#!/usr/bin/env python3
"""Narration: each scene's paragraph is synthesised in one pass with Kokoro (82M, offline, voice am_michael), so the
intonation flows across sentences instead of being stitched together. Subtitle times come from the sentence
boundaries: each sentence is also synthesised alone to predict where it ends, and the prediction is snapped to the
nearest pause in the paragraph audio. Writes audio/<scene>.wav and audio/<scene>.json ([start, end, sentence]).
Model files: github.com/thewh1teagle/kokoro-onnx releases (model-files-v1.0); set KOKORO_DIR to their folder."""
import json, os, re
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.environ.get("KOKORO_DIR", "/tmp/claude-0/kokoro")
VOICE = os.environ.get("VOICE", "am_michael")
SPEED = float(os.environ.get("SPEED", "1.0"))
k = Kokoro(os.path.join(D, "kokoro-v1.0.onnx"), os.path.join(D, "voices-v1.0.bin"))
os.makedirs(os.path.join(HERE, "audio"), exist_ok=True)

def pauses(a, sr, thr=0.012, min_len=0.09):
    """Silent stretches in the audio: list of (start, end) seconds."""
    hop = int(sr * 0.01)
    rms = np.array([np.sqrt(np.mean(a[i:i + hop] ** 2)) for i in range(0, len(a) - hop, hop)])
    quiet = rms < thr
    out, s = [], None
    for i, q in enumerate(quiet):
        if q and s is None: s = i
        if not q and s is not None:
            if (i - s) * 0.01 >= min_len: out.append((s * 0.01, i * 0.01))
            s = None
    return out

total = 0
for name, text in json.load(open(os.path.join(HERE, "narration.json"))):
    sentences = [s.strip() for s in re.split(r"(?<=[.?!])\s+", text) if s.strip()]
    a, sr = k.create(text, voice=VOICE, speed=SPEED, lang="en-us")
    nz = np.where(np.abs(a) > 0.008)[0]
    a = a[max(0, nz[0] - 1200): nz[-1] + 4800]  # keep natural decay at the end
    d = len(a) / sr
    solo = [len(k.create(s, voice=VOICE, speed=SPEED, lang="en-us")[0]) for s in sentences]
    ps = [p for p in pauses(a, sr) if 0.2 < p[0] < d - 0.2]
    spans, start, acc = [], 0.0, 0
    for i, s in enumerate(sentences):
        acc += solo[i]
        if i == len(sentences) - 1:
            spans.append([round(start, 3), round(d, 3), s]); break
        guess = d * acc / sum(solo)
        # sentence breaks are the longest pauses near the prediction (commas give shorter ones)
        near = [p for p in ps if abs((p[0] + p[1]) / 2 - guess) < 1.2 and p[0] > start + 0.4]
        p = max(near, key=lambda p: (p[1] - p[0]) - 0.15 * abs((p[0] + p[1]) / 2 - guess)) if near else \
            (min(ps, key=lambda p: abs((p[0] + p[1]) / 2 - guess)) if ps else (guess, guess))
        spans.append([round(start, 3), round(p[0], 3), s])
        start = p[1]
    sf.write(os.path.join(HERE, "audio", f"{name}.wav"), a, sr, subtype="PCM_16")
    json.dump(spans, open(os.path.join(HERE, "audio", f"{name}.json"), "w"), indent=1)
    total += d
    print(f"{name:16s} {d:6.2f}s  {len(sentences)} sentences")
print("narration total", round(total, 1))
