"""Synthesizes the placeholder soundtrack and sound effects into media/.

Standard library only: python3 gen_audio.py
The music is 100 BPM (a beat every 0.6 s), matching the beat constants in src/lib.rs.
"""

import math
import random
import struct
import wave

RATE = 44100
BEAT = 0.6
LENGTH = 29.4
random.seed(7)


def write(name, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    gain = 0.89 / peak if peak > 0.89 else 1.0
    with wave.open(f"media/{name}", "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s * gain)) * 32767)) for s in samples))


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def lowpass(samples, cutoff):
    a = 1 - math.exp(-2 * math.pi * cutoff / RATE)
    y, out = 0.0, []
    for s in samples:
        y += a * (s - y)
        out.append(y)
    return out


# ---- Music ----

# Fmaj7, Em7, Dm7, Cmaj7: one chord per bar of four beats.
CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]
BAR = 4 * BEAT
DRUMS_FROM = 3.6  # the demo starts
HATS_FROM = 9.6  # browsing starts
ARP_FROM = 16.8  # "Sit and play."
DRUMS_UNTIL = 27.6


def music():
    n = int(LENGTH * RATE)
    out = [0.0] * n
    # Pad: two slightly detuned sines per note, slow swell per bar.
    def chord_at(index, t):
        s = 0.0
        for note in CHORDS[index % 4]:
            f = hz(note)
            s += math.sin(2 * math.pi * f * t) + 0.6 * math.sin(2 * math.pi * f * 1.004 * t + 1.3)
        return s

    for i in range(n):
        t = i / RATE
        bar = int(t / BAR)
        in_bar = t % BAR
        # Each chord swells in while the one before it rings out: no gap at the bar line.
        s = chord_at(bar, t) * min(1.0, in_bar / 0.3) * (1 - 0.2 * in_bar / BAR)
        if bar > 0 and in_bar < 0.6:
            s += chord_at(bar - 1, t) * 0.8 * (1 - in_bar / 0.6)
        intro = min(1.0, t / 1.5)
        out[i] = 0.075 * s * intro
    # Bass on beats 1 and 3.
    for bar in range(int(LENGTH / BAR) + 1):
        root = CHORDS[bar % 4][0] - 12
        for beat in (0, 2):
            start = bar * BAR + beat * BEAT
            if start < DRUMS_FROM - 0.01 or start > DRUMS_UNTIL:
                continue
            for j in range(int(1.1 * RATE)):
                k = int(start * RATE) + j
                if k >= n:
                    break
                tt = j / RATE
                env = min(1, tt / 0.01) * math.exp(-tt * 2.5)
                out[k] += 0.22 * env * math.sin(2 * math.pi * hz(root) * tt)
    # Kick on every beat, with the pad ducked under it.
    duck = [1.0] * n
    beat_count = int(LENGTH / BEAT)
    for b in range(beat_count + 1):
        start = b * BEAT
        if start < DRUMS_FROM - 0.01 or start > DRUMS_UNTIL:
            continue
        phase = 0.0
        for j in range(int(0.35 * RATE)):
            k = int(start * RATE) + j
            if k >= n:
                break
            tt = j / RATE
            f = 45 + 90 * math.exp(-tt * 30)
            phase += 2 * math.pi * f / RATE
            out[k] += 0.5 * math.exp(-tt * 9) * math.sin(phase)
            duck[k] = min(duck[k], 0.55 + 0.45 * min(1, tt / 0.25))
    out = [s * d for s, d in zip(out, duck)]
    # Hats on the off beats.
    hats = [0.0] * n
    for b in range(beat_count + 1):
        start = b * BEAT + BEAT / 2
        if start < HATS_FROM or start > DRUMS_UNTIL:
            continue
        for j in range(int(0.05 * RATE)):
            k = int(start * RATE) + j
            if k < n:
                hats[k] += 0.12 * math.exp(-j / RATE * 70) * random.uniform(-1, 1)
    hp = lowpass(hats, 6000)
    out = [o + (h - l) for o, h, l in zip(out, hats, hp)]
    # A soft bell arpeggio on eighths from "Sit and play."
    step = BEAT / 2
    for e in range(int((DRUMS_UNTIL - ARP_FROM) / step)):
        start = ARP_FROM + e * step
        chord = CHORDS[int(start / BAR) % 4]
        note = chord[[0, 2, 1, 3, 2, 1, 3, 2][e % 8]] + 12
        f = hz(note)
        for j in range(int(0.5 * RATE)):
            k = int(start * RATE) + j
            if k >= n:
                break
            tt = j / RATE
            env = min(1, tt / 0.004) * math.exp(-tt * 7)
            out[k] += 0.07 * env * (math.sin(2 * math.pi * f * tt) + 0.3 * math.sin(2 * math.pi * f * 2.01 * tt))
    # Fade out.
    for i in range(n):
        t = i / RATE
        if t > LENGTH - 2.0:
            out[i] *= max(0.0, (LENGTH - t) / 2.0)
    return out


# ---- Sound effects ----


def click():
    out = []
    for j in range(int(0.06 * RATE)):
        t = j / RATE
        out.append(math.exp(-t * 90) * (0.7 * math.sin(2 * math.pi * 2100 * t) + 0.3 * random.uniform(-1, 1)))
    return out


def chime(notes, length=0.9, gap=0.07):
    out = [0.0] * int((length + gap * len(notes)) * RATE)
    for i, note in enumerate(notes):
        f = hz(note)
        start = int(i * gap * RATE)
        for j in range(int(length * RATE)):
            t = j / RATE
            env = min(1, t / 0.003) * math.exp(-t * 6)
            out[start + j] += env * (math.sin(2 * math.pi * f * t) + 0.25 * math.sin(2 * math.pi * f * 3.01 * t))
    return out


def whoosh(length=0.7, peak=0.6):
    noise = [random.uniform(-1, 1) for _ in range(int(length * RATE))]
    out, y = [], 0.0
    for j, s in enumerate(noise):
        t = j / length / RATE
        cutoff = 300 + 3500 * math.sin(math.pi * min(1, t))
        a = 1 - math.exp(-2 * math.pi * cutoff / RATE)
        y += a * (s - y)
        env = (t / peak) ** 2 if t < peak else ((1 - t) / (1 - peak)) ** 1.5
        out.append(y * env)
    return out


def impact():
    out, phase = [], 0.0
    for j in range(int(1.4 * RATE)):
        t = j / RATE
        f = 38 + 70 * math.exp(-t * 12)
        phase += 2 * math.pi * f / RATE
        out.append(math.exp(-t * 3.2) * math.sin(phase) + 0.25 * math.exp(-t * 25) * random.uniform(-1, 1))
    return out


def pop():
    out, phase = [], 0.0
    for j in range(int(0.12 * RATE)):
        t = j / RATE
        phase += 2 * math.pi * (500 + 2500 * t) / RATE
        out.append(math.exp(-t * 35) * math.sin(phase))
    return out


write("music.wav", music())
write("click.wav", click())
write("confirm.wav", chime([76, 83, 88]))
write("connect.wav", chime([72, 76, 79], length=0.5, gap=0.06))
write("chime.wav", chime([69, 76, 81, 88], length=1.6, gap=0.09))
write("whoosh.wav", whoosh())
write("impact.wav", impact())
write("pop.wav", pop())
print("ok")
