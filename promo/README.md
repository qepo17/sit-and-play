# Sit and Play — promo video

A 29 s, 1920x1080 @ 30 fps promo made with [fframes](https://github.com/dmtrKovalenko/fframes),
rendered with the built-in CPU backend.

Intro (the name) → Demo (open the launcher, grab the controller, pick a game with the D-pad,
press A, on real screens of the app) → "Sit and play. That's it." → Features → Outro.

| file | what |
| --- | --- |
| `src/lib.rs` | the video: scenes, timing constants, animation, audio map |
| `src/main.rs` | the command line (`fframes::cli`) |
| `media/*.png` | screens of the app (`bun run dev:web`, demo games, clock frozen at 20:30) driven by a fake Xbox controller; `r1_*`/`r2_*` are the app's own transitions after a D-pad press, captured with CSS animations slowed 20x |
| `media/*.ttf` | Sora and DM Sans, the app's fonts |
| `media/*.wav` | placeholder music (100 BPM) and sound effects from `gen_audio.py` |

## Build

Needs `libclang` and `libx264` (Ubuntu: `sudo apt install libclang-dev clang libx264-dev`).

```sh
python3 gen_audio.py                 # only when changing the sounds; then touch src/lib.rs
cargo run --release -- timeline      # scenes, duration, audio tracks
cargo run --release -- inspect       # missing media/fonts, clipped text, panics in any frame
cargo run --release -- strip Demo -n 12
cargo run --release -- audio analyze --waveform w.png
cargo run --release -- render -o sit-and-play-promo.mp4
# the GIF in the project README: 960 px, 15 fps
ffmpeg -i sit-and-play-promo.mp4 -vf "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 sit-and-play.gif
```

`media/` is embedded at compile time: after changing a file there, `touch src/lib.rs` so
cargo rebuilds.
