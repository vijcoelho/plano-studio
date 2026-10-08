---
name: video-demo
description: Short product demo/promo video (20-40s, Twitter/X style) in HyperFrames with pixel-art sprites, synthesized audio and frenetic motion. Use for "make a demo video", "video for the tweet", "promo of the project".
---
# Video demo (HyperFrames + pixel sprites + synth audio)


## Setup
- Project OUTSIDE the product repo (no media in git). `package.json` pins `npx --yes hyperframes@<version> preview|check|render`.
- One `index.html`: `#root[data-composition-id=main][data-duration=30][data-width=1920][data-height=1080]`,
  `<audio src="assets/audio.wav" data-start=0 data-duration=30 data-track-index=1>`.
- GSAP from jsdelivr; one paused timeline `gsap.timeline({ paused: true, defaults: { immediateRender: false } })`,
  register `window.__timelines["main"] = tl; tl.seek(0);` at the end.
- Fonts local in `assets/fonts` via `@font-face` (no Google Fonts at render time).

## Style (the user's taste)
- Frenetic Twitter/X motion: slam-in (scale 2.2 -> 1, back.out), white flash, screen shake, particle bursts, marquee backgrounds.
- Pixel art characters, dynamic backgrounds, black/white + one accent (#e8774f).
- Contrast WCAG AA 3:1 minimum on EVERY text and sprite edge; check before showing (`helena/tools/contrast.mjs`).

## Pixel sprites: `sprite.js` (this folder)
- Each sprite = layers of string rows (`.` empty, letter = color key). Auto 1-cell outline from the first layer,
  so a dark sprite on a dark background still reads (pass a light outline color).
- Rects get `px + 1` size to hide seams between cells.
- Swap expressions by stacking layers (`eyeN`, `eyeP`, `eyeH`) and toggling opacity.

## Audio: `synth.py` (this folder)
- numpy only, writes `assets/audio.wav`. 120 bpm beat + SFX placed at the SAME seconds as the timeline cues
  (`add(at, sound, gain)`). Edit the cue list when the timeline changes; rerun `python assets/synth.py`.
- Sounds: kick, hat, clap, pop, blip, tick, whoosh, impact, ding, buzz, alarm, boing, riser, saw bass, end chord.
- Soft clip with tanh, normalize to 0.89, 1.2s fade out.

## Gotchas
- Discrete state (eyes, which sprite is shown) must be DERIVED FROM TIME: a tween on a clock object
  `{t}` from 0 to duration whose onUpdate picks the state from a sorted key list. `tl.set` toggles are lost on direct seeks
  (render seeks frame by frame out of order).
- Every tween uses `fromTo` (explicit start), never `to`, for the same reason.
- Random positions come from a seeded RNG (`seed * 16807 % 2147483647`), never Math.random: frames must match between renders.
- Overlapping layers need `data-layout-allow-overlap` / `data-layout-allow-occlusion` or `hyperframes check` complains.
- Run `npm run check` before `npm run render`; open `npm run dev` for the user to scrub ("roda pra eu ver": free port, send URL).
