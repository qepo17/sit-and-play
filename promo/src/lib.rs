//! Sit and Play: a promo for the light Steam launcher for Windows.
//!
//! Intro (the name) -> Demo (open the launcher, grab the controller, pick a game, press A,
//! all on real screens of the app) -> SitPlay ("Sit and play. That's it.") -> Features ->
//! Outro. The music is 100 BPM; presses and entrances land on its beats (0.6 s).
use fframes::{
    AnimateRuntimeInput, AudioMap, AudioTimestamp::*, AudioTrack, Color, Duration, FFramesContext,
    FontQuery, Frame, Overlap, Scene, Scenes, Svgr, Video,
    animation::{AnimationRuntime, Easing},
    include_media_dir,
};
use std::sync::LazyLock;

// Every file of `media/` is embedded into the binary. Fonts are used by family name.
include_media_dir!(pub struct SitAndPlayPromoMedia, "media");

pub const WIDTH: usize = 1920;
pub const HEIGHT: usize = 1080;
const FPS: usize = 30;

// ---- Timeline (seconds) ----

const INTRO_LEN: f32 = 3.6;
const DEMO_LEN: f32 = 13.2;
const DEMO_OVERLAP: f32 = 0.4;
const SIT_LEN: f32 = 3.6;
const SIT_OVERLAP: f32 = 0.5;
const FEATURES_LEN: f32 = 4.8;
const FEATURES_OVERLAP: f32 = 0.4;
const OUTRO_LEN: f32 = 4.2;
const OUTRO_OVERLAP: f32 = 0.4;

/// Where each scene's own clock starts on the video's clock.
const DEMO_T0: f32 = INTRO_LEN - DEMO_OVERLAP;
const SIT_T0: f32 = INTRO_LEN + DEMO_LEN - SIT_OVERLAP;
const FEATURES_T0: f32 = INTRO_LEN + DEMO_LEN + SIT_LEN - FEATURES_OVERLAP;
const OUTRO_T0: f32 = INTRO_LEN + DEMO_LEN + SIT_LEN + FEATURES_LEN - OUTRO_OVERLAP;

// Demo events, on the demo's clock.
const CARD_IN: f32 = 0.3;
const PAD_IN: f32 = 3.6;
const PAD_CONNECT: f32 = 4.6;
const RIGHT_1: f32 = 7.0;
const RIGHT_2: f32 = 8.2;
const PRESS_A: f32 = 10.0;
const ZOOM: f32 = 11.0;
/// After the zoom the picture keeps growing slowly, through the cut into SitPlay.
const DRIFT_FROM: f32 = DEMO_T0 + 12.2;

// SitPlay, Features and Outro events, on their own clocks.
const SIT_TITLE: f32 = 0.5;
const SIT_THATS_IT: f32 = 1.7;
const FEATURE_CARDS: f32 = 1.0;
const OUTRO_LOGO: f32 = 0.4;

// ---- Look ----

const NIGHT: &str = "#0B1117";
const INK: &str = "#F4F1EA";
const MUTED: &str = "#9AA8B2";
const ACCENT: &str = "#F0B94A";
const CARD: &str = "#141F28";
const PAD_BODY: &str = "#1C2A34";
const PAD_PART: &str = "#2B3C48";
const DISPLAY: &str = "Sora";
const BODY: &str = "DM Sans";

/// The art of the games in the demo, as the app draws it: background, orb, band.
const HOLLOW: [&str; 3] = ["#0D2633", "#2E9FB5", "#F0B94A"];
const IRON: [&str; 3] = ["#2A1712", "#C4572E", "#E8D5B0"];
const NEON: [&str; 3] = ["#1A1030", "#A94BE0", "#3DE0C8"];

// ---- Motion ----

/// Fast start, long settle: things sliding into place.
static OUT: LazyLock<AnimationRuntime> =
    LazyLock::new(|| AnimationRuntime::new(0.6, &Easing::CubicBezier(0.16, 1.0, 0.3, 1.0)));
/// Exits: slow start, quick end.
static IN: LazyLock<AnimationRuntime> =
    LazyLock::new(|| AnimationRuntime::new(0.25, &Easing::CubicBezier(0.55, 0.0, 1.0, 0.45)));
/// Scenes fading in over the one before.
static SWAP: LazyLock<AnimationRuntime> =
    LazyLock::new(|| AnimationRuntime::new(0.3, &Easing::CubicBezier(0.33, 0.0, 0.2, 1.0)));
/// The camera move into the game.
static MOVE: LazyLock<AnimationRuntime> =
    LazyLock::new(|| AnimationRuntime::new(1.4, &Easing::CubicBezier(0.65, 0.0, 0.35, 1.0)));
/// Friendly, a little overshoot.
static SPRING: LazyLock<AnimationRuntime> = LazyLock::new(|| {
    AnimationRuntime::new(3.0, &Easing::Spring { mass: 1.0, stiffness: 170.0, damping: 17.0 })
});

fn run(frame: &Frame, runtime: &AnimationRuntime, at: f32, from: f32, to: f32) -> f32 {
    frame.animate_runtime(AnimateRuntimeInput { on_second: at, from, to, animation_runtime: runtime })
}

/// 0 -> 1 from `at`.
fn appear(frame: &Frame, at: f32) -> f32 {
    run(frame, &OUT, at, 0.0, 1.0)
}

/// 1 -> 0 from `at`.
fn vanish(frame: &Frame, at: f32) -> f32 {
    run(frame, &IN, at, 1.0, 0.0)
}

/// A distance that springs to 0 from `at`.
fn settle(frame: &Frame, at: f32, from: f32) -> f32 {
    run(frame, &SPRING, at, from, 0.0)
}

/// A button press: 0 -> 1 in 60 ms, back to 0 by 450 ms.
fn press(t: f32, at: f32) -> f32 {
    let d = t - at;
    if !(0.0..0.45).contains(&d) {
        0.0
    } else if d < 0.06 {
        d / 0.06
    } else {
        let k = (d - 0.06) / 0.39;
        1.0 - k * k
    }
}

/// Moves an element down by `y`.
fn down(y: f32) -> String {
    format!("translate(0 {y})")
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

fn rgb(hex: &str) -> [f32; 3] {
    let v = u32::from_str_radix(hex.trim_start_matches('#'), 16).unwrap_or(0);
    [(v >> 16 & 255) as f32, (v >> 8 & 255) as f32, (v & 255) as f32]
}

fn mix(a: &str, b: &str, t: f32) -> String {
    let (a, b) = (rgb(a), rgb(b));
    let c = |i: usize| lerp(a[i], b[i], t).round() as u8;
    format!("#{:02x}{:02x}{:02x}", c(0), c(1), c(2))
}

fn seconds(frame: &Frame) -> f32 {
    frame.global_index as f32 / FPS as f32
}

/// How much the Neon Courier art has grown since the zoom, shared by Demo and SitPlay.
fn drift(frame: &Frame) -> f32 {
    1.0 + 0.04 * (seconds(frame) - DRIFT_FROM).max(0.0)
}

fn width<'a>(frame: &mut Frame, ctx: &FFramesContext<'a, '_>, family: &'static str, size: usize, weight: u16, text: &'a str) -> f32 {
    let font = FontQuery { family, size, weight, ..Default::default() };
    frame.text_width(ctx, font, text).map(|w| w as f32).unwrap_or(text.len() as f32 * size as f32 * 0.55)
}

/// A screen of the app, `name` in `media/`.
fn screen<'a>(ctx: &FFramesContext<'a, '_>, name: &str, opacity: f32) -> Svgr<'a> {
    if opacity <= 0.001 {
        return Svgr::empty();
    }
    match ctx.get_image(name) {
        Some(image) => fframes::svgr!(
            <image href={image.href()} x="0" y="0" width="1920" height="1080" opacity={opacity} />
        ),
        None => Svgr::empty(),
    }
}

/// A game's backdrop as the app draws it on the home screen: orb, band and ring.
fn backdrop<'a>(art: [&'a str; 3], rot: f32, cx: f32) -> Svgr<'a> {
    fframes::svgr!(<g>
        <circle cx={cx} cy="594" r="250" fill={art[1]} />
        <rect x="1109" y="540" width="1049" height="56" fill={art[2]}
            transform={format!("rotate({rot} 1633.5 568)")} />
        <circle cx="1774" cy="243" r="69" fill="none" stroke={art[2]} stroke-width="2" />
    </g>)
}

/// The app icon: a rounded square with a ring, `size` px wide, top-left at the origin.
fn app_icon<'a>(size: f32) -> Svgr<'a> {
    let s = size / 1024.0;
    fframes::svgr!(<g transform={format!("scale({s})")}>
        <rect x="100" y="100" width="824" height="824" rx="190" fill="url(#icon-fill)" />
        <circle cx="512" cy="512" r="230" fill="none" stroke="#ffffff" stroke-width="96" />
    </g>)
}

// ---- Video ----

pub struct SitAndPlayPromoVideo<'a> {
    pub media: &'a SitAndPlayPromoMedia,
}

impl<'a> SitAndPlayPromoVideo<'a> {
    pub fn new(media: &'a SitAndPlayPromoMedia) -> Self {
        Self { media }
    }
}

impl std::fmt::Debug for SitAndPlayPromoVideo<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SitAndPlayPromoVideo").finish()
    }
}

impl Video for SitAndPlayPromoVideo<'_> {
    const FPS: usize = FPS;
    const WIDTH: usize = WIDTH;
    const HEIGHT: usize = HEIGHT;
    const BACKGROUND_COLOR: Color = Color::BLACK;

    fn duration(&self) -> Duration<'_> {
        Duration::Auto
    }

    fn audio(&self) -> AudioMap<'_> {
        let demo = |t: f32| Second(DEMO_T0 + t);
        AudioMap::from([
            AudioTrack::new("music.wav", Second(0.)..Eof).gain_db(1.5).fade_in(0.3),
            AudioTrack::new("whoosh.wav", demo(CARD_IN - 0.15)..Eof).gain_db(-7.),
            AudioTrack::new("whoosh.wav", demo(PAD_IN - 0.1)..Eof).gain_db(-9.),
            AudioTrack::new("connect.wav", demo(PAD_CONNECT)..Eof).gain_db(-5.),
            AudioTrack::new("click.wav", demo(RIGHT_1)..Eof).gain_db(-3.),
            AudioTrack::new("click.wav", demo(RIGHT_2)..Eof).gain_db(-3.),
            AudioTrack::new("confirm.wav", demo(PRESS_A)..Eof).gain_db(-5.),
            AudioTrack::new("whoosh.wav", demo(ZOOM + 0.2)..Eof).gain_db(-4.),
            AudioTrack::new("impact.wav", Second(SIT_T0 + SIT_TITLE)..Eof).gain_db(0.),
            AudioTrack::new("pop.wav", Second(SIT_T0 + SIT_THATS_IT)..Eof).gain_db(-7.),
            AudioTrack::new("pop.wav", Second(FEATURES_T0 + FEATURE_CARDS)..Eof).gain_db(-9.),
            AudioTrack::new("pop.wav", Second(FEATURES_T0 + FEATURE_CARDS + 0.12)..Eof).gain_db(-9.).pan(0.3),
            AudioTrack::new("pop.wav", Second(FEATURES_T0 + FEATURE_CARDS + 0.24)..Eof).gain_db(-9.).pan(0.6),
            AudioTrack::new("chime.wav", Second(OUTRO_T0 + OUTRO_LOGO)..Eof).gain_db(-5.),
        ])
    }

    fn define_scenes(&self) -> Scenes<'_> {
        Scenes::from(vec![&Intro as &dyn Scene, &Demo, &SitPlay, &Features, &Outro])
    }

    fn render_frame<'a>(&'a self, frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        fframes::svgr!(
            <svg xmlns="http://www.w3.org/2000/svg" width={WIDTH} height={HEIGHT} viewBox="0 0 1920 1080">
                <defs>
                    <linearGradient id="icon-fill" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stop-color="#4A7CF7" />
                        <stop offset="1" stop-color="#9B5CF5" />
                    </linearGradient>
                </defs>
                <rect width="1920" height="1080" fill={NIGHT} />
                {ctx.render_scenes(&frame)}
            </svg>
        )
    }
}

// ---- Intro: the name ----

#[derive(Debug)]
struct Intro;

impl Scene for Intro {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(INTRO_LEN)
    }

    fn render_frame<'a>(&'a self, mut frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let out = vanish(&frame, INTRO_LEN - DEMO_OVERLAP - 0.05);

        // The backdrop assembles: orb, then band, then ring, and drifts while it holds.
        let orb = run(&frame, &SPRING, 0.0, 0.82, 1.0);
        let band = run(&frame, &OUT, 0.25, 420.0, 0.0);
        let ring = run(&frame, &SPRING, 0.45, 0.4, 1.0);
        let drift = 180.0 - 14.0 * t;

        // "Sit and Play", word by word; "Play" in the accent.
        let size = 156;
        let w_sit = width(&mut frame, ctx, DISPLAY, size, 800, "Sit");
        let w_and = width(&mut frame, ctx, DISPLAY, size, 800, "and");
        let w_both = width(&mut frame, ctx, DISPLAY, size, 800, "Sit and");
        let space = (w_both - w_sit - w_and).max(30.0);
        let chip = width(&mut frame, ctx, BODY, 32, 500, "Made for your Steam games") + 94.0;
        let words = [("Sit", 192.0, INK), ("and", 192.0 + w_sit + space, INK), ("Play", 192.0 + w_both + space, ACCENT)];
        let words: Vec<Svgr> = words
            .into_iter()
            .enumerate()
            .map(|(i, (word, x, fill))| {
                let at = 0.6 + i as f32 * 0.1;
                fframes::svgr!(<text x={x} y={600.0 + settle(&frame, at, 70.0)} opacity={appear(&frame, at)}
                    font-family={DISPLAY} font-weight="800" font-size={size} letter-spacing="-4" fill={fill}>{word}</text>)
            })
            .collect();

        fframes::svgr!(<g opacity={out}>
            <rect width="1920" height="1080" fill={HOLLOW[0]} />
            <g transform={format!("translate({drift} 0)")}>
                <g opacity={appear(&frame, 0.0)} transform={format!("translate(1517 594) scale({orb}) translate(-1517 -594)")}>
                    <circle cx="1517" cy="594" r="250" fill={HOLLOW[1]} />
                </g>
                <g opacity={appear(&frame, 0.25)} transform={format!("translate({band} {})", band * -0.21)}>
                    <rect x="1109" y="540" width="1049" height="56" fill={HOLLOW[2]} transform="rotate(-12 1633.5 568)" />
                </g>
                <g opacity={appear(&frame, 0.45)} transform={format!("translate(1774 243) scale({ring}) translate(-1774 -243)")}>
                    <circle cx="1774" cy="243" r="69" fill="none" stroke={HOLLOW[2]} stroke-width="3" />
                </g>
            </g>
            <g opacity={appear(&frame, 0.35)} transform={format!("translate(178 {})", 250.0 + settle(&frame, 0.35, 50.0))}>
                {app_icon(168.0)}
            </g>
            {words}
            <g opacity={appear(&frame, 1.15)} transform={down(settle(&frame, 1.15, 40.0))}>
                <text x="196" y="700" font-family={BODY} font-weight="500" font-size="56" fill={INK}>"A light game launcher for Windows."</text>
            </g>
            <g opacity={appear(&frame, 1.5)} transform={down(settle(&frame, 1.5, 30.0))}>
                <rect x="196" y="752" width={chip} height="64" rx="32" fill="none" stroke={ACCENT} stroke-width="2" />
                <circle cx="230" cy="784" r="8" fill={ACCENT} />
                <text x="252" y="796" font-family={BODY} font-weight="500" font-size="32" fill={ACCENT}>"Made for your Steam games"</text>
            </g>
        </g>)
    }
}

// ---- Demo: open, grab, pick, play ----

#[derive(Debug)]
struct Demo;

/// Frames captured of the app's own transitions (`r1_00.png`..), at 30 fps.
const TRANSITION_FRAMES: usize = 24;

/// The screens of the app shown at `t`, bottom first, with their opacity. The D-pad
/// presses play the app's real transitions; the hint swap and the toast are cross-fades.
fn demo_screens(t: f32) -> Vec<(String, f32)> {
    let step = |at: f32| (((t - at) * FPS as f32 + 0.001).floor().max(0.0) as usize).min(TRANSITION_FRAMES - 1);
    let fade = |at: f32, length: f32| ((t - at) / length).clamp(0.0, 1.0);
    if t < PAD_CONNECT {
        vec![("home_keys.png".into(), 1.0)]
    } else if t < RIGHT_1 {
        vec![("home_keys.png".into(), 1.0), ("home_pad.png".into(), fade(PAD_CONNECT, 0.15))]
    } else if t < RIGHT_2 {
        vec![(format!("r1_{:02}.png", step(RIGHT_1)), 1.0)]
    } else if t < PRESS_A + 0.05 {
        vec![(format!("r2_{:02}.png", step(RIGHT_2)), 1.0)]
    } else {
        let last = format!("r2_{:02}.png", TRANSITION_FRAMES - 1);
        vec![(last, 1.0), ("launch.png".into(), fade(PRESS_A + 0.05, 0.2))]
    }
}

const CAPTIONS: [(&str, f32, f32); 4] = [
    ("Open the launcher.", 0.6, 3.2),
    ("Grab the controller.", 3.45, 6.1),
    ("Pick a game with the D-pad.", 6.35, 9.2),
    ("Press A. You're playing.", 9.45, ZOOM - 0.1),
];

impl Scene for Demo {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(DEMO_LEN)
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(DEMO_OVERLAP)
    }

    fn render_frame<'a>(&'a self, frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();

        // The screens, stacked; the ones under a fully shown screen are skipped.
        let shown = demo_screens(t);
        let top = shown.iter().rposition(|(_, o)| *o >= 0.999).unwrap_or(0);
        let screens: Vec<Svgr> = shown[top..].iter().map(|(name, opacity)| screen(ctx, name, *opacity)).collect();

        // The card: rises in, then the zoom makes it the whole screen.
        let rise = settle(&frame, CARD_IN, 160.0);
        let grow = run(&frame, &SPRING, CARD_IN, 0.92, 1.0);
        let zoom = run(&frame, &MOVE, ZOOM, 0.0, 1.0);
        let scale = lerp(0.75 * grow, 1.0, zoom);
        let x = lerp(240.0 + 1440.0 * (1.0 - grow) / 2.0, 0.0, zoom);
        let y = lerp(210.0 + rise + 810.0 * (1.0 - grow) / 2.0, 0.0, zoom);
        let k = drift(&frame);
        let card_transform = format!(
            "translate({x} {y}) scale({scale}) translate(1574 594) scale({k}) translate(-1574 -594)"
        );
        let corner = lerp(24.0, 0.0, zoom);
        let (card_w, card_h) = (1920.0 * scale, 1080.0 * scale);
        let framing = 1.0 - zoom;

        // Highlights drawn on the screen: the hints that switch to the controller, and Play.
        let hints = appear(&frame, PAD_CONNECT + 0.15) * vanish(&frame, 6.0);
        let play_ring = ((t - PRESS_A) / 0.6).clamp(0.0, 1.0);
        let play_opacity = if t < PRESS_A { 0.0 } else { 1.0 - play_ring };
        let grow_ring = 4.0 + 22.0 * play_ring;

        // The glow behind the card takes the color of the game in focus.
        let glow = if t < RIGHT_1 {
            HOLLOW[1].to_string()
        } else if t < RIGHT_2 {
            mix(HOLLOW[1], IRON[1], ((t - RIGHT_1) / 0.4).min(1.0))
        } else {
            mix(IRON[1], NEON[1], ((t - RIGHT_2) / 0.4).min(1.0))
        };

        let captions: Vec<Svgr> = CAPTIONS
            .iter()
            .map(|&(text, enter, exit)| {
                if t < enter - 0.01 || t > exit + 0.3 {
                    return Svgr::empty();
                }
                let opacity = appear(&frame, enter) * vanish(&frame, exit);
                let dy = settle(&frame, enter, 50.0) + run(&frame, &IN, exit, 0.0, -24.0);
                fframes::svgr!(<text x="240" y={152.0 + dy} opacity={opacity} font-family={DISPLAY}
                    font-weight="700" font-size="72" letter-spacing="-2" fill={INK}>{text}</text>)
            })
            .collect();

        // Four dots: which step the caption is on.
        let step = CAPTIONS.iter().rposition(|&(_, enter, _)| t >= enter).unwrap_or(0);
        let dots: Vec<Svgr> = (0..CAPTIONS.len())
            .map(|i| {
                let on = i == step;
                let x = 1670.0 - (CAPTIONS.len() - 1 - i) as f32 * 30.0;
                fframes::svgr!(<circle cx={x} cy="128" r={if on { 9.0 } else { 6.0 }}
                    fill={if on { ACCENT } else { "#3A4852" }} />)
            })
            .collect();
        let chrome = appear(&frame, 0.5) * vanish(&frame, ZOOM - 0.1);

        // The controller comes up from below and leaves with the zoom.
        let pad_y = settle(&frame, PAD_IN, 420.0) + run(&frame, &IN, ZOOM - 0.1, 0.0, 480.0);
        let pad_turn = settle(&frame, PAD_IN, -10.0);
        let pad = if t < PAD_IN - 0.01 {
            Svgr::empty()
        } else {
            fframes::svgr!(<g transform={format!("translate(1316 {}) rotate({pad_turn} 221 145) scale(0.85)", 742.0 + pad_y)}>
                {gamepad(t)}
            </g>)
        };

        fframes::svgr!(<g>
            <rect width="1920" height="1080" fill={NIGHT} opacity={appear(&frame, 0.0)} />
            <defs>
                <radialGradient id="demo-glow">
                    <stop offset="0" stop-color={glow.clone()} stop-opacity="1" />
                    <stop offset="1" stop-color={glow} stop-opacity="0" />
                </radialGradient>
                <clipPath id="card-clip">
                    <rect x={x} y={y} width={card_w} height={card_h} rx={corner} />
                </clipPath>
            </defs>
            <ellipse cx="960" cy="640" rx="980" ry="520" fill="url(#demo-glow)" opacity={0.22 * appear(&frame, CARD_IN)} />
            <g opacity={appear(&frame, CARD_IN)}>
                <rect x={x + 10.0} y={y + 22.0} width={card_w} height={card_h} rx={corner} fill="#000000" opacity={0.45 * framing} />
                <g clip-path="url(#card-clip)">
                    <g transform={card_transform}>
                        {screens}
                        <rect x="44" y="1018" width="930" height="52" rx="26" fill="none" stroke={ACCENT}
                            stroke-width="4" opacity={hints} />
                        <rect x={56.0 - grow_ring} y={801.0 - grow_ring} width={200.0 + 2.0 * grow_ring}
                            height={56.0 + 2.0 * grow_ring} rx={28.0 + grow_ring} fill="none" stroke={ACCENT}
                            stroke-width="5" opacity={play_opacity} />
                    </g>
                </g>
                <rect x={x} y={y} width={card_w} height={card_h} rx={corner} fill="none"
                    stroke="#ffffff" stroke-opacity="0.1" stroke-width="2" opacity={framing} />
            </g>
            <g opacity={chrome}>
                {captions}
                {dots}
            </g>
            {pad}
        </g>)
    }
}

/// A controller, 520 x 340, with the buttons of the demo lit when pressed at time `t`.
fn gamepad<'a>(t: f32) -> Svgr<'a> {
    let connect = press(t, PAD_CONNECT);
    let right = press(t, RIGHT_1).max(press(t, RIGHT_2));
    let a = press(t, PRESS_A);
    let ripple = |at: f32, cx: f32, cy: f32| -> Svgr<'a> {
        let d = t - at;
        if !(0.0..0.6).contains(&d) {
            return Svgr::empty();
        }
        let k = d / 0.6;
        fframes::svgr!(<circle cx={cx} cy={cy} r={24.0 + 46.0 * k} fill="none" stroke={ACCENT}
            stroke-width={4.0 * (1.0 - k) + 0.5} opacity={1.0 - k} />)
    };
    let face = |cx: f32, cy: f32, label: &'a str, lit: f32| -> Svgr<'a> {
        fframes::svgr!(<g>
            <circle cx={cx} cy={cy} r="22" fill={PAD_PART} />
            <circle cx={cx} cy={cy} r={22.0 * (1.0 - 0.08 * lit)} fill={ACCENT} opacity={lit} />
            <text x={cx} y={cy + 8.0} text-anchor="middle" font-family={BODY} font-weight="500" font-size="22"
                fill={mix(MUTED, "#1A1206", lit)}>{label}</text>
        </g>)
    };
    fframes::svgr!(<g>
        <rect x="88" y="18" width="120" height="34" rx="14" fill={PAD_PART} />
        <rect x="312" y="18" width="120" height="34" rx="14" fill={PAD_PART} />
        <path d="M130 40 H390 C450 40 482 62 496 112 L516 232 C526 292 496 332 456 332 C420 332 400 306 380 276 L362 248 H158 L140 276 C120 306 100 332 64 332 C24 332 -6 292 4 232 L24 112 C38 62 70 40 130 40 Z"
            fill={PAD_BODY} stroke="#ffffff" stroke-opacity="0.14" stroke-width="2" />
        <circle cx="142" cy="132" r="40" fill="#111A20" />
        <circle cx="142" cy="132" r="27" fill={PAD_PART} />
        <circle cx="328" cy="224" r="40" fill="#111A20" />
        <circle cx="328" cy="224" r="27" fill={PAD_PART} />
        <rect x="174" y="180" width="36" height="96" rx="8" fill={PAD_PART} />
        <rect x="144" y="210" width="96" height="36" rx="8" fill={PAD_PART} />
        <rect x="210" y="210" width="30" height="36" rx="8" fill={ACCENT} opacity={right} />
        <path d="M224 220 L232 228 L224 236 Z" fill={mix(MUTED, "#1A1206", right)} />
        <path d="M160 220 L152 228 L160 236 Z" fill={MUTED} />
        <path d="M184 196 L192 188 L200 196 Z" fill={MUTED} />
        <path d="M184 260 L192 268 L200 260 Z" fill={MUTED} />
        {ripple(RIGHT_1, 225.0, 228.0)}
        {ripple(RIGHT_2, 225.0, 228.0)}
        <circle cx="236" cy="124" r="10" fill={PAD_PART} />
        <circle cx="304" cy="124" r="10" fill={PAD_PART} />
        <circle cx="270" cy="82" r="20" fill={PAD_PART} />
        <circle cx="270" cy="82" r="20" fill={ACCENT} opacity={connect} />
        <circle cx="270" cy="82" r="11" fill="none" stroke={mix(MUTED, "#1A1206", connect)} stroke-width="3" />
        {ripple(PAD_CONNECT, 270.0, 82.0)}
        {face(392.0, 92.0, "Y", 0.0)}
        {face(350.0, 132.0, "X", 0.0)}
        {face(434.0, 132.0, "B", 0.0)}
        {face(392.0, 172.0, "A", a)}
        {ripple(PRESS_A, 392.0, 172.0)}
    </g>)
}

// ---- SitPlay: the tagline over the game ----

#[derive(Debug)]
struct SitPlay;

impl Scene for SitPlay {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(SIT_LEN)
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(SIT_OVERLAP)
    }

    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let k = drift(&frame);
        let out = vanish(&frame, SIT_LEN + SIT_OVERLAP - FEATURES_OVERLAP - 0.25);
        fframes::svgr!(<g opacity={run(&frame, &SWAP, 0.0, 0.0, 1.0)}>
            <rect width="1920" height="1080" fill={NEON[0]} />
            <g transform={format!("translate(1574 594) scale({k}) translate(-1574 -594)")}>
                {backdrop(NEON, -24.0, 1574.0)}
            </g>
            <g opacity={out}>
                <g opacity={appear(&frame, SIT_TITLE)} transform={down(settle(&frame, SIT_TITLE, 80.0))}>
                    <text x="184" y="580" font-family={DISPLAY} font-weight="800" font-size="160" letter-spacing="-5"
                        fill={INK}>"Sit and play."</text>
                </g>
                <g opacity={appear(&frame, SIT_THATS_IT)} transform={down(settle(&frame, SIT_THATS_IT, 40.0))}>
                    <text x="192" y="690" font-family={DISPLAY} font-weight="600" font-size="76" letter-spacing="-2"
                        fill={NEON[2]}>"That's it."</text>
                </g>
            </g>
        </g>)
    }
}

// ---- Features: light, Steam, Windows ----

#[derive(Debug)]
struct Features;

const FEATURES: [(&str, &str, &str); 3] = [
    ("Your Steam games", "Found on their own", "#2E9FB5"),
    ("No sign-in", "Your account is optional", ACCENT),
    ("No bloat", "A small app, no Electron", "#A94BE0"),
];

/// The icon of a feature card, 64 px, top-left at the origin.
fn feature_icon<'a>(i: usize, color: &'a str) -> Svgr<'a> {
    match i {
        // A grid of games.
        0 => fframes::svgr!(<g fill={color}>
            <rect x="0" y="0" width="28" height="28" rx="7" />
            <rect x="36" y="0" width="28" height="28" rx="7" />
            <rect x="0" y="36" width="28" height="28" rx="7" />
            <rect x="36" y="36" width="28" height="28" rx="7" opacity="0.5" />
        </g>),
        // An open padlock.
        1 => fframes::svgr!(<g>
            <path d="M16 28 V18 C16 6 26 0 34 0 C44 0 50 6 52 14" fill="none" stroke={color} stroke-width="7" stroke-linecap="round" />
            <rect x="4" y="28" width="56" height="36" rx="9" fill={color} />
        </g>),
        // A bolt.
        _ => fframes::svgr!(<path d="M38 0 L6 38 H30 L24 64 L58 24 H34 Z" fill={color} />),
    }
}

impl Scene for Features {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(FEATURES_LEN)
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(FEATURES_OVERLAP)
    }

    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let out = vanish(&frame, FEATURES_LEN + FEATURES_OVERLAP - OUTRO_OVERLAP - 0.2);
        let cards: Vec<Svgr> = FEATURES
            .iter()
            .enumerate()
            .map(|(i, &(title, body, color))| {
                let at = FEATURE_CARDS + i as f32 * 0.12;
                let x = 192.0 + i as f32 * 524.0;
                fframes::svgr!(<g opacity={appear(&frame, at)} transform={format!("translate({x} {})", 500.0 + settle(&frame, at, 90.0))}>
                    <rect x="0" y="0" width="488" height="330" rx="28" fill={CARD} stroke="#ffffff" stroke-opacity="0.06" stroke-width="2" />
                    <g transform="translate(48 52)">{feature_icon(i, color)}</g>
                    <text x="48" y="212" font-family={DISPLAY} font-weight="600" font-size="44" letter-spacing="-1" fill={INK}>{title}</text>
                    <text x="48" y="270" font-family={BODY} font-weight="500" font-size="34" fill={MUTED}>{body}</text>
                </g>)
            })
            .collect();
        fframes::svgr!(<g opacity={run(&frame, &SWAP, 0.0, 0.0, 1.0)}>
            <rect width="1920" height="1080" fill={NIGHT} />
            <g opacity={out}>
                <g opacity={appear(&frame, 0.45)} transform={down(settle(&frame, 0.45, 40.0))}>
                    <text x="196" y="252" font-family={BODY} font-weight="500" font-size="32" letter-spacing="5"
                        fill={ACCENT}>"FOR STEAM ON WINDOWS"</text>
                </g>
                <g opacity={appear(&frame, 0.55)} transform={down(settle(&frame, 0.55, 60.0))}>
                    <text x="186" y="392" font-family={DISPLAY} font-weight="700" font-size="120" letter-spacing="-4"
                        fill={INK}>"Light by design."</text>
                </g>
                {cards}
            </g>
        </g>)
    }
}

// ---- Outro: the name, the link ----

#[derive(Debug)]
struct Outro;

impl Scene for Outro {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(OUTRO_LEN)
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(OUTRO_OVERLAP)
    }

    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let end = OUTRO_LEN + OUTRO_OVERLAP;
        let black = ((t - (end - 0.7)) / 0.6).clamp(0.0, 1.0);
        let ring = run(&frame, &SPRING, OUTRO_LOGO, 0.6, 1.0) + 0.012 * t;
        let logo_y = 330.0 + settle(&frame, OUTRO_LOGO, 50.0);
        let logo_scale = run(&frame, &SPRING, OUTRO_LOGO, 0.8, 1.0);

        let at = OUTRO_LOGO + 0.15;

        fframes::svgr!(<g opacity={run(&frame, &SWAP, 0.0, 0.0, 1.0)}>
            <rect width="1920" height="1080" fill={NIGHT} />
            <g opacity={0.5 * appear(&frame, OUTRO_LOGO)} transform={format!("translate(960 330) scale({ring})")}>
                <circle cx="0" cy="0" r="260" fill="none" stroke="#24323C" stroke-width="2" />
                <circle cx="0" cy="0" r="380" fill="none" stroke="#1A262E" stroke-width="2" />
            </g>
            <g opacity={appear(&frame, OUTRO_LOGO)} transform={format!("translate(960 {logo_y}) scale({logo_scale}) translate(-80 -80)")}>
                {app_icon(160.0)}
            </g>
            <g opacity={appear(&frame, at)} transform={down(settle(&frame, at, 60.0))}>
                <text x="960" y="600" text-anchor="middle" font-family={DISPLAY} font-weight="800" font-size="132"
                    letter-spacing="-4" fill={INK}>"Sit and "<tspan fill={ACCENT}>"Play"</tspan></text>
            </g>
            <g opacity={appear(&frame, at + 0.35)} transform={down(settle(&frame, at + 0.35, 40.0))}>
                <text x="960" y="690" text-anchor="middle" font-family={BODY} font-weight="500" font-size="48"
                    fill={MUTED}>"The light game launcher for Steam on Windows"</text>
            </g>
            <g opacity={appear(&frame, at + 0.6)} transform={down(settle(&frame, at + 0.6, 30.0))}>
                <rect x="660" y="760" width="600" height="72" rx="36" fill={CARD} stroke={ACCENT} stroke-opacity="0.5" stroke-width="2" />
                <text x="960" y="807" text-anchor="middle" font-family={BODY} font-weight="500" font-size="34"
                    fill={INK}>"github.com/qepo17/sit-and-play"</text>
            </g>
            <rect width="1920" height="1080" fill="#000000" opacity={black} />
        </g>)
    }
}
