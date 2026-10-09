use fframes::{EncoderOptions, RenderOptions, StaticMediaProvider, cli};
use sit_and_play_promo::{SitAndPlayPromoMedia, SitAndPlayPromoVideo};
use std::process::ExitCode;

fn main() -> ExitCode {
    let media = SitAndPlayPromoMedia::prepare().expect("media");
    let video = SitAndPlayPromoVideo::new(&media);

    cli::new(
        &video,
        RenderOptions {
            media: Some(&media),
            video_encoder_options: EncoderOptions {
                preferred_encoder: Some("libx264"),
                codec_params: Some(&[("crf", "18"), ("preset", "medium"), ("tune", "animation")]),
                ..Default::default()
            },
            ..Default::default()
        },
    )
    .run()
}
