#!/usr/bin/env python3
"""Assemble the Aerar demo video (v2) from the recorded scenes (rec/out/*.webm), the narration (audio/*.wav), a
generated music bed (music.py) and burned-in subtitles plus chapter tags. Output: demo/video/aerar-demo.mp4
(1920x1080, 30 fps, H.264 + AAC)."""
import json, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "rec", "out")
BUILD = os.path.join(HERE, "build")
os.makedirs(BUILD, exist_ok=True)
marks = json.load(open(os.path.join(OUT, "marks.json")))
narr = json.load(open(os.path.join(HERE, "narration.json")))
LEAD = 0.28   # silence before each scene's narration
TAIL = 0.30   # breathing room after it
EXTRA = {"s01_grok": 0.6, "s14_close": 1.4}

def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]))

def run(args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

S = lambda name: marks[name]["start"]
M = lambda name, k: marks[name][k]
# piece: (clip, in-point (None = take the last `src` seconds), source seconds, output seconds, options)
# speed = source/output; >1 only speeds up waits (cursor travel, page loads, scrolling), never hides a result.
# options: zoom=(t0 in output seconds, x, y, factor) punches in on a point recorded by record.js.
box = lambda clip, k: marks[clip]["boxes"][k]
PLAN = {
    "s01_grok":      [("c_grok", 0, None, None, {})],
    "s02_openai":    [("c_openai", 0, None, None, {})],
    "s03_problem":   [("c_bridge", 0, 5.0, 5.0, {}), ("s02a_landing", S("s02a_landing"), 4.8, 4.8, {}),
                      ("c_questions", 0, None, None, {})],
    "s04_what":      [("c_flow", 0, None, None, {})],
    "s05_mandate":   [("s03_mandate", S("s03_mandate"), 15.0, None, {})],
    "s06_intentlock":[("s04_intentlock", S("s04_intentlock"), None, None,
                       {"zoom": (M("s04_intentlock", "refused") - S("s04_intentlock") + 0.2, 1155, box("s04_intentlock", "refused")["y"], 1.3)})],
    "s07_sandbox":   [("s05_sandbox", S("s05_sandbox"), None, None, {})],
    "s08_guards":    [("s08_guards", S("s08_guards"), None, None, {})],
    "s09_delivery":  [("s06_outcomes", S("s06_outcomes"), 12.0, None, {})],
    "s10_proof":     [("s07_proof", S("s07_proof") + 0.4, M("s07_proof", "verify") - S("s07_proof") - 0.6, 3.6, {}),
                      ("s07_proof", M("s07_proof", "verify") + 0.1, 12.2, None,
                       {"zoom_at": ("invalid", M("s07_proof", "invalid") - M("s07_proof", "verify") - 0.1, 1180, box("s07_proof", "invalid")["y"], 1.28)})],
    "s11_vault":     [("s08_vault", S("s08_vault"), 5.6, 3.4, {}), ("c_forge", 0, 4.7, 4.7, {}), ("s08_vault", None, 5.6, None, {})],
    "s12_compare":   [("c_compare", 0, None, None, {})],
    "s13_tests":     [("s09_runall", None, 4.0, 3.0, {}), ("c_tests", 0, None, None, {})],
    "s14_close":     [("s10b_sdk", S("s10b_sdk"), 4.6, 4.2, {}), ("c_end", 0, None, None, {})],
}
TAGS = {"s05_mandate": "Signed mandate", "s06_intentlock": "IntentLock", "s07_sandbox": "Memory · trusted shops",
        "s08_guards": "Price memory · wallet-swap guard", "s09_delivery": "Approvals · delivery checks",
        "s10_proof": "Evidence · verifiable receipts", "s11_vault": "Aerar Vault on Base", "s13_tests": "Attack lab · tests"}
HITS = {"s01_grok": 13.8, "s02_openai": 7.0}   # card-time of the money reveal on each incident card

def zoom_vf(t0, cx, cy, z):
    K = f"clip((t-{t0:.3f})/0.7\\,0\\,1)"
    Z = f"(1+{z - 1:.3f}*{K}*{K}*(3-2*{K}))"
    return (f",scale=w='trunc(1920*{Z}/2)*2':h='trunc(1080*{Z}/2)*2':eval=frame:flags=bicubic"
            f",crop=1920:1080:x='clip({cx:.1f}*({Z}-1)\\,0\\,1920*({Z}-1))':y='clip({cy:.1f}*({Z}-1)\\,0\\,1080*({Z}-1))'")

segments, audio_parts, subs, tags, hits, t = [], [], [], [], [], 0.0
for name, text in narr:
    wav = os.path.join(HERE, "audio", f"{name}.wav")
    adur = dur(wav)
    slot = LEAD + adur + TAIL + EXTRA.get(name, 0)
    pieces = PLAN[name]
    fixed = sum(p[3] for p in pieces if p[3] is not None)
    flex = [p for p in pieces if p[3] is None]
    left = slot - fixed
    pt = t
    for i, (clip, start, src, outd, opt) in enumerate(pieces):
        path = os.path.join(OUT, clip + ".webm")
        if not os.path.exists(path):
            path = os.path.join(OUT, clip + ".mp4")  # title cards are rendered frame by frame (rec/cards.js)
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
        vf = f"trim=start={start:.3f}:duration={src:.3f},setpts=(PTS-STARTPTS)/{speed:.5f},fps=30,scale=1920:1080:flags=lanczos"
        if "zoom" in opt:
            t0, cx, cy, z = opt["zoom"]; vf += zoom_vf(t0 / speed, cx, cy, z)
        if "zoom_at" in opt:
            _, t0, cx, cy, z = opt["zoom_at"]; vf += zoom_vf(t0 / speed, cx, cy, z)
        vf += f",format=yuv420p,tpad=stop_mode=clone:stop_duration={pad + 0.2:.3f},trim=duration={outd:.3f}"
        vf += f",fade=t=in:st=0:d=0.18,fade=t=out:st={max(0, outd - 0.18):.3f}:d=0.18"
        run(["ffmpeg", "-y", "-i", path, "-vf", vf, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-r", "30", seg])
        segments.append(seg)
        print(f"{name}[{i}] {clip}: src {src:.2f}s -> {outd:.2f}s (x{speed:.2f})")
        pt += outd
    if name in TAGS:
        tags.append((t + 0.25, t + slot - 0.25, TAGS[name]))
    if name in HITS:
        hits.append(t + HITS[name])
    a = os.path.join(BUILD, f"{name}.wav")
    run(["ffmpeg", "-y", "-i", wav, "-af", f"adelay={int(LEAD*1000)}:all=1,apad=whole_dur={slot:.3f},aresample=48000", "-ac", "2", a])
    audio_parts.append(a)
    spans = json.load(open(os.path.join(HERE, "audio", f"{name}.json")))
    merged = []
    for st, en, sen in spans:  # a one-word sentence ("Aerar.") joins the next
        if merged and len(merged[-1][2].split()) == 1:
            merged[-1] = [merged[-1][0], en, merged[-1][2] + " " + sen]
        else:
            merged.append([st, en, sen])
    for st, en, sen in merged:
        subs.append((t + LEAD + st, t + LEAD + en + 0.2, sen))
    t += slot

lst = os.path.join(BUILD, "list.txt")
open(lst, "w").write("".join(f"file '{s}'\n" for s in segments))
video = os.path.join(BUILD, "video.mp4")
run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video])
alst = os.path.join(BUILD, "alist.txt")
open(alst, "w").write("".join(f"file '{a}'\n" for a in audio_parts))
voice = os.path.join(BUILD, "narration.wav")
run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", alst, "-af", "highpass=f=70,equalizer=f=3500:t=q:w=1.2:g=-2,equalizer=f=180:t=q:w=1:g=1.5,acompressor=threshold=0.1:ratio=2:attack=20:release=250,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", voice])
music = os.path.join(BUILD, "music.wav")
run(["python3", os.path.join(HERE, "music.py"), f"{t:.2f}", music] + [f"{h:.2f}" for h in hits])
audio = os.path.join(BUILD, "mix.wav")
# Music steady, about 20 dB under the voice (no ducking, so nothing pumps).
run(["ffmpeg", "-y", "-i", voice, "-i", music, "-filter_complex",
     "[1:a]volume=0.13[m];[0:a][m]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.89", "-ar", "48000", audio])

def ts(x):
    h, r = divmod(x, 3600); m, s = divmod(r, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"
REPL = [("AI X B T", "AIXBT"), ("x four oh two", "x402"), ("U S D C", "USDC"), ("M C P", "MCP"), ("S D K", "SDK"),
        ("forty seven thousand dollars", "$47,000"), ("fifty five and a half ether", "55.5 ETH"),
        ("over a hundred thousand dollars", "over $100,000"), ("eight dollar", "$8"), ("five times more", "5x more"),
        ("Thirty six", "36"), ("One hundred and eighty six", "186"), ("eighteen", "18"), ("three billion", "3 billion"), ("a hundred and fifty thousand dollars", "$150,000")]
def clean(s):
    for k, v in REPL:
        s = s.replace(k, v)
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
Style: Tag,Inter,27,&H00FFFFFF,&H00FFFFFF,&H00D6552B,&H00D6552B,1,0,0,0,100,100,1,0,3,12,0,7,56,56,96,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""")
    for a, b, s in tags:
        f.write(f"Dialogue: 1,{ts(a)},{ts(b)},Tag,,0,0,0,,{{\\fad(250,250)}}{s}\n")
    for a, b, s in subs:
        f.write(f"Dialogue: 0,{ts(a)},{ts(b)},Cap,,0,0,0,,{clean(s)}\n")
final = os.path.join(HERE, "aerar-demo.mp4")
run(["ffmpeg", "-y", "-i", video, "-i", audio, "-vf", f"ass={ass}", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", final])
print("total", round(t, 2), "s ->", final, round(dur(final), 2))
json.dump([{"start": round(a, 2), "end": round(b, 2), "text": clean(s)} for a, b, s in subs], open(os.path.join(HERE, "subtitles.json"), "w"), indent=1)
