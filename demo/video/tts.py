#!/usr/bin/env python3
"""Narration: each sentence synthesised separately with Piper (en-us ryan high, offline), joined with short pauses,
so subtitle timings are exact. Writes audio/<scene>.wav and audio/<scene>.json ([start, end, sentence] in seconds)."""
import json, os, re, subprocess, wave
HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = os.environ.get("PIPER_VOICE", "/tmp/claude-0/tts/ryan/en-us-ryan-high.onnx")
PAUSE = 0.38
os.makedirs(os.path.join(HERE, "audio"), exist_ok=True)
for name, text in json.load(open(os.path.join(HERE, "narration.json"))):
    sentences = [s.strip() for s in re.split(r"(?<=[.?!])\s+", text) if s.strip()]
    frames, rate, t, spans = b"", None, 0.0, []
    for i, s in enumerate(sentences):
        tmp = os.path.join(HERE, "audio", f".tmp_{i}.wav")
        subprocess.run(["python3", "-m", "piper", "-m", VOICE, "-f", tmp, "--length-scale", "1.1"], input=s.encode(), check=True, capture_output=True)
        with wave.open(tmp) as w:
            rate = w.getframerate(); sw = w.getsampwidth(); ch = w.getnchannels(); data = w.readframes(w.getnframes())
        d = len(data) / (rate * sw * ch)
        spans.append([round(t, 3), round(t + d, 3), s])
        frames += data
        t += d
        if i < len(sentences) - 1:
            frames += b"\x00" * int(PAUSE * rate) * sw * ch
            t += PAUSE
        os.remove(tmp)
    with wave.open(os.path.join(HERE, "audio", f"{name}.wav"), "wb") as w:
        w.setnchannels(ch); w.setsampwidth(sw); w.setframerate(rate); w.writeframes(frames)
    json.dump(spans, open(os.path.join(HERE, "audio", f"{name}.json"), "w"), indent=1)
    print(f"{name:16s} {t:6.2f}s  {len(sentences)} sentences")
