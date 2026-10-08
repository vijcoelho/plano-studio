# Builds assets/audio.wav: 120 bpm beat + SFX synced to index.html. Run: python assets/synth.py
import wave, numpy as np
SR = 44100; DUR = 30.0
out = np.zeros(int(SR * DUR))
rng = np.random.default_rng(7)

def t_(d): return np.arange(int(SR * d)) / SR
def add(at, sig, g=1.0):
    i = int(at * SR); j = min(len(out), i + len(sig)); out[i:j] += sig[: j - i] * g
def sweep(f0, f1, d):  # sine with exponential pitch sweep
    t = t_(d); f = f0 * (f1 / f0) ** (t / d); return np.sin(2 * np.pi * np.cumsum(f) / SR)
def env(d, k): return np.exp(-t_(d) * k)
def noise(d): return rng.uniform(-1, 1, len(t_(d)))
def hp(x): return np.diff(x, prepend=0)
def lp(x, n): return np.convolve(x, np.ones(n) / n, "same")

kick = lambda: sweep(130, 42, .3) * env(.3, 14)
hat = lambda: hp(noise(.05)) * env(.05, 90)
clap = lambda: lp(hp(noise(.15)), 3) * env(.15, 30)
pop = lambda: sweep(500, 1300, .08) * env(.08, 40)
blip = lambda: sweep(900, 1500, .06) * env(.06, 50)
tick = lambda: sweep(2200, 1800, .015) * env(.015, 200)
def whoosh(d=.4):
    n = lp(noise(d), 6); return n * np.sin(np.pi * t_(d) / d) ** 2
def impact(d=.9): return sweep(90, 28, d) * env(d, 5) * 1.4 + lp(noise(d), 4) * env(d, 12) * .8
def ding(f=1320): return (np.sin(2 * np.pi * f * t_(.7)) + .5 * np.sin(2 * np.pi * f * 1.5 * t_(.7))) * env(.7, 6)
def buzz(): t = t_(.35); return np.sign(np.sin(2 * np.pi * 98 * t)) * env(.35, 6) * .5
def alarm(): t = t_(.12); return np.sign(np.sin(2 * np.pi * 880 * t)) * .35
def boing(): t = t_(.25); return np.sin(2 * np.pi * np.cumsum(220 + 300 * t / .25 + 30 * np.sin(2 * np.pi * 30 * t)) / SR) * env(.25, 9)
def riser(d=1.0): t = t_(d); return lp(noise(d), 3) * (t / d) ** 2 * .6 + sweep(200, 1400, d) * (t / d) ** 2 * .4
def saw(f, d):
    t = t_(d); return sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 8)) * env(d, 9)
def chord(fs, d=3.0): return sum(np.sin(2 * np.pi * f * t_(d)) for f in fs) * env(d, 1.2) / len(fs)

# --- beat (120 bpm) ---
for b in np.arange(0, 26, .5):
    if 8.5 <= b < 9.5: continue
    add(b, kick(), .9)
    add(b + .25, hat(), .35)
    if b % 1 == .5 and b >= 9.5: add(b, clap(), .35)
for b in np.arange(4, 8.5, .125): add(b, hat(), .25)  # frenzy 16ths
bass = [55, 55, 65.4, 73.4]
for i, b in enumerate(np.arange(9.5, 26, .25)):
    add(b, saw(bass[int(i // 8) % 4], .22), .22)

# --- sfx ---
add(0.0, whoosh(.4), .6); add(0.45, impact(.5), .7); add(0.5, pop(), .5); add(0.65, blip(), .4)
add(1.95, whoosh(.25), .5); add(2.5, impact(.6), .8); add(2.5, lp(noise(.3), 2) * env(.3, 8), .6)
add(2.95, whoosh(.25), .5); add(3.5, impact(.5), .7); add(3.5, buzz(), .6)
for i in range(16): add(4.0 + i * .125, tick(), .5)
for t in [4.25, 4.75, 5.25, 5.75, 4.5, 5.0, 5.5]: add(t, pop(), .35)
for i in range(24): add(6.0 + i * .07 + .35, impact(.15), .35)
add(7.6, alarm(), .5); add(7.85, alarm(), .5)
add(8.0, riser(1.4), .9)
add(9.0, whoosh(.5), .8); add(9.5, impact(1.0), 1.2); add(10.0, clap(), .6); add(10.0, impact(.4), .5)
add(11.0, whoosh(.5), .8)
add(12.2, whoosh(.3), .5); add(12.85, ding(), .5); add(13.2, blip(), .4); add(13.5, clap(), .5)
add(15.2, pop(), .4); add(15.4, riser(.95) * .6, .7); add(16.35, impact(.5), 1.0); add(16.35, clap(), .8)
add(17.0, ding(1760), .45); add(17.6, clap(), .5)
add(19.0, whoosh(1.6), .6); add(20.6, hp(noise(.03)) * env(.03, 150), 1.0); add(20.7, whoosh(.35), .6)
for i in range(12): add(21.0 + i * .066, tick(), .45)
add(21.8, ding(), .5); add(21.6, clap(), .5)
add(23.0, boing(), .5); add(23.5, boing(), .5); add(24.0, clap(), 1.0); add(24.0, ding(2093), .4); add(24.2, impact(.4), .6)
add(26.0, chord([440, 554.4, 659.3, 880], 3.8), .8); add(26.0, impact(.8), .5)

out = np.tanh(out * 1.2); out /= np.abs(out).max() / .89
fade = int(SR * 1.2); out[-fade:] *= np.linspace(1, 0, fade)
with wave.open(__file__.replace("synth.py", "audio.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype("<i2").tobytes())
