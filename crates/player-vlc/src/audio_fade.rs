//! Short audio-only transitions implemented as an audio-filter gain. The
//! Windows application volume is never touched.
use discatelier_contracts::{AppError, PlaybackControl, PlaybackSource};
pub const STEP_MS: u64 = 8;
const STEPS: u16 = 32;
pub const FADE_DB: f32 = -20.0;
pub fn music(source: &PlaybackSource) -> bool {
    source.media_token == "local-audio"
        || source.playlist.starts_with("netease-song:")
        || crate::cd_track(&source.playlist).is_some()
}
pub fn ramp(
    from: f32,
    to: f32,
    send: &mut impl FnMut(PlaybackControl) -> Result<(), AppError>,
    wait: &mut impl FnMut() -> Result<(), AppError>,
) -> Result<(), AppError> {
    for step in 1..=STEPS {
        wait()?;
        let t = f64::from(step) / f64::from(STEPS);
        let eased = t * t * (3.0 - 2.0 * t);
        let db = f64::from(from) + (f64::from(to) - f64::from(from)) * eased;
        send(PlaybackControl::Gain { db: db as f32 })?;
    }
    Ok(())
}
pub fn pause(
    paused: bool,
    was_paused: bool,
    mut send: impl FnMut(PlaybackControl) -> Result<(), AppError>,
    mut wait: impl FnMut() -> Result<(), AppError>,
) -> Result<(), AppError> {
    if paused == was_paused {
        return send(PlaybackControl::Pause { paused });
    }
    let result = if paused {
        ramp(0.0, FADE_DB, &mut send, &mut wait)
            .and_then(|_| send(PlaybackControl::Pause { paused: true }))
    } else {
        send(PlaybackControl::Gain { db: FADE_DB })
            .and_then(|_| send(PlaybackControl::Pause { paused: false }))
            .and_then(|_| ramp(FADE_DB, 0.0, &mut send, &mut wait))
    };
    if !paused || result.is_err() {
        let restored = send(PlaybackControl::Gain { db: 0.0 });
        return result.and(restored);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fades_before_pause_and_after_resume_without_touching_volume() {
        for paused in [true, false] {
            let mut operations = Vec::new();
            pause(
                paused,
                !paused,
                |op| {
                    operations.push(op);
                    Ok(())
                },
                || Ok(()),
            )
            .unwrap();
            let index = operations
                .iter()
                .position(|op| matches!(op, PlaybackControl::Pause { .. }))
                .unwrap();
            if paused {
                assert_eq!(index, STEPS as usize);
            } else {
                assert_eq!(index, 1);
            }
            assert!(matches!(
                operations[index - 1],
                PlaybackControl::Gain { db } if db == FADE_DB
            ));
            if paused {
                assert!(matches!(
                    operations.last(),
                    Some(PlaybackControl::Pause { paused: true })
                ));
            } else {
                assert!(matches!(
                    operations.last(),
                    Some(PlaybackControl::Gain { db }) if *db == 0.0
                ));
            }
            let levels: Vec<_> = operations[..operations.len() - 1]
                .iter()
                .filter_map(|op| {
                    if let PlaybackControl::Gain { db } = op {
                        Some(*db)
                    } else {
                        None
                    }
                })
                .collect();
            if paused {
                assert_eq!(levels.last(), Some(&FADE_DB));
            } else {
                assert_eq!(levels.last(), Some(&0.0));
            }
            assert!(levels
                .windows(2)
                .all(|w| if paused { w[0] >= w[1] } else { w[0] <= w[1] }));
            assert!(!operations
                .iter()
                .any(|op| matches!(op, PlaybackControl::Volume { .. })));
        }
    }
    #[test]
    fn interruption_restores_gain_and_does_not_pause_a_replaced_session() {
        let mut operations = Vec::new();
        let result = pause(
            true,
            false,
            |op| {
                operations.push(op);
                Ok(())
            },
            || Err(AppError::new("cancelled", "stopped")),
        );
        assert!(result.is_err());
        assert!(matches!(
            operations.as_slice(),
            [PlaybackControl::Gain { db }] if *db == 0.0
        ));
    }
    #[test]
    fn already_paused_tracks_do_not_ramp() {
        let mut count = 0;
        pause(
            true,
            true,
            |op| {
                assert!(matches!(op, PlaybackControl::Pause { paused: true }));
                count += 1;
                Ok(())
            },
            || panic!("no fade required"),
        )
        .unwrap();
        assert_eq!(count, 1);
    }
}
