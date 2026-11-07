#!/usr/bin/env python3
"""Narration: each sentence synthesised separately with Kokoro (82M, offline, voice am_michael), joined with short
pauses, so subtitle timings are exact. Writes audio/<scene>.wav and audio/<scene>.json ([start, end, sentence]).
Model files: github.com/thewh1teagle/kokoro-onnx releases (model-files-v1.0); set KOKORO_DIR to their folder."""
import json, os, re
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.environ.get("KOKORO_DIR", "/tmp/claude-0/kokoro")
VOICE = os.environ.get("VOICE", "am_michael")
SPEED = float(os.environ.get("SPEED", "1.04"))
PAUSE = 0.32
k = Kokoro(os.path.join(D, "kokoro-v1.0.onnx"), os.path.join(D, "voices-v1.0.bin"))
os.makedirs(os.path.join(HERE, "audio"), exist_ok=True)
total = 0
for name, text in json.load(open(os.path.join(HERE, "narration.json"))):
    sentences = [s.strip() for s in re.split(r"(?<=[.?!])\s+", text) if s.strip()]
    parts, t, spans, sr = [], 0.0, [], 24000
    for i, s in enumerate(sentences):
        a, sr = k.create(s, voice=VOICE, speed=SPEED, lang="en-us")
        # trim leading/trailing near-silence so pauses are even
        nz = np.where(np.abs(a) > 0.01)[0]
        if len(nz):
            a = a[max(0, nz[0] - 600): nz[-1] + 1800]
        d = len(a) / sr
        spans.append([round(t, 3), round(t + d, 3), s])
        parts.append(a); t += d
        if i < len(sentences) - 1:
            parts.append(np.zeros(int(PAUSE * sr), dtype=a.dtype)); t += PAUSE
    sf.write(os.path.join(HERE, "audio", f"{name}.wav"), np.concatenate(parts), sr, subtype="PCM_16")
    json.dump(spans, open(os.path.join(HERE, "audio", f"{name}.json"), "w"), indent=1)
    total += t
    print(f"{name:16s} {t:6.2f}s  {len(sentences)} sentences")
print("narration total", round(total, 1))
