#!/usr/bin/env python3
"""Assemble the Aerar demo video from the recorded scenes (rec/out/*.webm), the narration (audio/*.wav) and
burned-in subtitles. Output: demo/video/aerar-demo.mp4 (1920x1080, 30 fps, H.264 + AAC)."""
import json, os, re, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "rec", "out")
BUILD = os.path.join(HERE, "build")
os.makedirs(BUILD, exist_ok=True)
marks = json.load(open(os.path.join(OUT, "marks.json")))
narr = json.load(open(os.path.join(HERE, "narration.json")))
LEAD = 0.35   # silence before each scene's narration
TAIL = 0.45   # breathing room after it

def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]))

def run(args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

# Each scene: list of (clip, in-point seconds or ("mark", name, offset), source seconds to use, output seconds).
# The speed of a piece is source/output; >1 speeds idle waits up (cursor moves, page loads), never the results.
S = lambda name: marks[name]["start"]
PLAN = {
    "s01_hook":      [("s01_hook", S("s01_hook"), None, None)],
    "s02_problem":   [("s02a_landing", S("s02a_landing"), 8.8, 8.8), ("s02b_questions", S("s02b_questions"), 8.9, None)],
    "s03_mandate":   [("s03_mandate", S("s03_mandate"), 17.0, None)],
    "s04_intentlock":[("s04_intentlock", S("s04_intentlock"), 20.6, None)],
    "s05_sandbox":   [("s05_sandbox", S("s05_sandbox"), 18.2, None)],
    "s06_outcomes":  [("s06_outcomes", S("s06_outcomes"), 19.9, None)],
    "s07_proof":     [("s07_proof", S("s07_proof"), 7.2, 6.0), ("s07_proof", marks["s07_proof"]["verify"] + 0.5, 17.0, None)],
    "s08_vault":     [("s08_vault", S("s08_vault"), 5.6, 5.2), ("s08c_forge", S("s08c_forge"), 5.6, 5.3), ("s08_vault", None, 5.6, None)],
    "s09_tests":     [("s09_runall", S("s09_runall"), 11.1, 6.4), ("s09b_tests", S("s09b_tests"), 6.6, None)],
    "s10_close":     [("s10a_compare", S("s10a_compare"), 8.2, 8.2), ("s10b_sdk", S("s10b_sdk"), 4.6, 4.5), ("s10c_end", S("s10c_end"), 12.6, None)],
}

segments, audio_parts, subs, t = [], [], [], 0.0
for name, text in narr:
    wav = os.path.join(HERE, "audio", f"{name}.wav")
    adur = dur(wav)
    slot = LEAD + adur + TAIL + (1.6 if name == "s10_close" else 0)
    pieces = PLAN[name]
    fixed = sum(p[3] for p in pieces if p[3] is not None)
    flex = [p for p in pieces if p[3] is None]
    left = slot - fixed
    for i, (clip, start, src, outd) in enumerate(pieces):
        path = os.path.join(OUT, clip + ".webm")
        total = dur(path)
        if outd is None:
            outd = left / len(flex)
        if start is None:  # take the last `src` seconds
            start = total - src - 0.1
        if src is None:
            src = min(total - start - 0.05, outd)
        src = min(src, total - start - 0.05)
        speed = src / outd
        seg = os.path.join(BUILD, f"{name}_{i}.mp4")
        pad = max(0.0, outd - src / speed)
        vf = f"trim=start={start:.3f}:duration={src:.3f},setpts=(PTS-STARTPTS)/{speed:.5f},fps=30,scale=1920:1080:flags=lanczos,format=yuv420p"
        vf += f",tpad=stop_mode=clone:stop_duration={pad + 0.2:.3f},trim=duration={outd:.3f}"
        vf += f",fade=t=in:st=0:d=0.18,fade=t=out:st={max(0, outd - 0.18):.3f}:d=0.18"
        run(["ffmpeg", "-y", "-i", path, "-vf", vf, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-r", "30", seg])
        segments.append(seg)
        print(f"{name}[{i}] {clip}: src {src:.2f}s -> {outd:.2f}s (x{speed:.2f})")
    # Narration for the slot, padded with silence
    a = os.path.join(BUILD, f"{name}.wav")
    run(["ffmpeg", "-y", "-i", wav, "-af", f"adelay={int(LEAD*1000)}:all=1,apad=whole_dur={slot:.3f},aresample=48000", "-ac", "2", a])
    audio_parts.append(a)
    # Subtitles: exact sentence timings from tts.py; a one-word sentence ("Aerar.") joins the next.
    spans = json.load(open(os.path.join(HERE, "audio", f"{name}.json")))
    merged = []
    for st, en, sen in spans:
        if merged and len(merged[-1][2].split()) == 1:
            merged[-1] = [merged[-1][0], en, merged[-1][2] + " " + sen]
        else:
            merged.append([st, en, sen])
    for st, en, sen in merged:
        subs.append((t + LEAD + st, t + LEAD + en + 0.25, sen))
    t += slot

# Video concat
lst = os.path.join(BUILD, "list.txt")
open(lst, "w").write("".join(f"file '{s}'\n" for s in segments))
video = os.path.join(BUILD, "video.mp4")
run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video])
alst = os.path.join(BUILD, "alist.txt")
open(alst, "w").write("".join(f"file '{a}'\n" for a in audio_parts))
audio = os.path.join(BUILD, "narration.wav")
run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", alst, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", audio])

# Subtitles (ASS): clean lower-third captions in the site's fonts
def ts(x):
    h, r = divmod(x, 3600); m, s = divmod(r, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"
spoken = {"U S D C": "USDC", "M C P": "MCP", "x402": "x402", "mock up": "mock-up", "per payment": "per-payment"}
def clean(s):
    for k, v in spoken.items():
        s = s.replace(k, v)
    s = s.replace("ten dollars", "$10").replace("eight dollar", "$8").replace("Eight dollars", "$8").replace("ten dollar", "$10")
    s = s.replace("Thirty six", "36").replace("One hundred and eighty six", "186").replace("eighteen", "18")
    return s
ass = os.path.join(BUILD, "subs.ass")
with open(ass, "w") as f:
    f.write("""[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter,38,&H00FFFFFF,&H00FFFFFF,&H00000000,&H9A18201C,0,0,0,0,100,100,0,0,3,14,0,2,260,260,46,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""")
    for a, b, s in subs:
        f.write(f"Dialogue: 0,{ts(a)},{ts(b)},Cap,,0,0,0,,{clean(s)}\n")
final = os.path.join(HERE, "aerar-demo.mp4")
fontsdir = os.path.join(HERE, "cards", "fonts")
run(["ffmpeg", "-y", "-i", video, "-i", audio, "-vf", f"ass={ass}", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", final])
print("total", round(t, 2), "s ->", final, round(dur(final), 2))
json.dump([{"start": round(a, 2), "end": round(b, 2), "text": clean(s)} for a, b, s in subs], open(os.path.join(HERE, "subtitles.json"), "w"), indent=1)
