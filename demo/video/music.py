#!/usr/bin/env python3
"""Generated music bed (no samples, nothing licensed): a slow, quiet synth pad for the "Night shift" theme, plus low
impact hits at given times. Usage: music.py <seconds> <out.wav> [hit_time ...]"""
import sys
import numpy as np, soundfile as sf
from scipy.signal import lfilter

SR = 48000
dur = float(sys.argv[1]); out = sys.argv[2]; hits = [float(x) for x in sys.argv[3:]]
n = int(dur * SR); t = np.arange(n) / SR
rng = np.random.default_rng(7)

def hz(m):  # midi -> Hz
    return 440.0 * 2 ** ((m - 69) / 12)

# Am9 · Fmaj7 · Cadd9 · G6, eight seconds each, low and wide
chords = [[45, 57, 60, 64, 71], [41, 57, 60, 64, 69], [48, 55, 62, 64, 67], [43, 55, 59, 62, 64]]
CH = 8.0
pad = np.zeros((n, 2))
for i in range(int(dur // CH) + 2):
    c = chords[i % 4]
    s0 = i * CH - 1.5  # overlap for crossfade
    a, b = int(max(0, s0) * SR), int(min(dur, s0 + CH + 3.0) * SR)
    if a >= n or b <= a:
        continue
    tt = t[a:b] - s0
    env = np.clip(tt / 2.5, 0, 1) * np.clip((CH + 3.0 - tt) / 3.0, 0, 1)
    env = env ** 1.5
    for j, m in enumerate(c):
        f = hz(m)
        for side, det in ((0, -0.12), (1, 0.12)):
            ph = rng.uniform(0, 2 * np.pi)
            v = np.sin(2 * np.pi * (f + det) * tt + ph) + 0.18 * np.sin(2 * np.pi * 2 * (f + det) * tt + ph)
            pad[a:b, side] += v * env * (0.9 if j == 0 else 0.55) / len(c)

# gentle movement and a soft low-pass (one-pole) so it sits under the voice
lfo = 0.85 + 0.15 * np.sin(2 * np.pi * t / 11.0)
pad *= lfo[:, None]
alpha = 0.06
for ch in range(2):
    pad[:, ch] = lfilter([alpha], [1, alpha - 1], pad[:, ch])

# fade in / out
fi, fo = int(2.0 * SR), int(4.0 * SR)
pad[:fi] *= np.linspace(0, 1, fi)[:, None]
pad[-fo:] *= np.linspace(1, 0, fo)[:, None]

# impact hits: a sub drop plus a short filtered noise burst
for h in hits:
    a = int(h * SR); L = int(2.2 * SR)
    if a >= n:
        continue
    L = min(L, n - a); tt = np.arange(L) / SR
    sub = np.sin(2 * np.pi * (55 * np.exp(-tt * 1.4) + 30) * tt) * np.exp(-tt * 2.2)
    noise = lfilter([0.08], [1, -0.92], rng.normal(0, 1, L)) * np.exp(-tt * 6)
    pad[a:a + L, 0] += 0.9 * sub + 0.5 * noise
    pad[a:a + L, 1] += 0.9 * sub + 0.5 * noise

pad /= np.max(np.abs(pad)) + 1e-9
sf.write(out, (pad * 0.8).astype(np.float32), SR)
print("music", out, round(dur, 1), "s, hits", hits)
