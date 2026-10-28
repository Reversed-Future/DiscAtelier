//! Short audio-only transitions. Gain never changes the user's volume setting.
use discatelier_contracts::{AppError, PlaybackControl, PlaybackSource};
pub const STEP_MS: u64 = 20;
const STEPS: u16 = 12;
pub fn music(source: &PlaybackSource) -> bool {
    source.media_token == "local-audio"
        || source.playlist.starts_with("netease-song:")
        || crate::cd_track(&source.playlist).is_some()
}
pub fn ramp(
    from: u16,
    to: u16,
    send: &mut impl FnMut(PlaybackControl) -> Result<(), AppError>,
    wait: &mut impl FnMut() -> Result<(), AppError>,
) -> Result<(), AppError> {
    for step in 1..=STEPS {
        wait()?;
        let t = f64::from(step) / f64::from(STEPS);
        let eased = t * t * (3.0 - 2.0 * t);
        let volume = (f64::from(from) + (f64::from(to) - f64::from(from)) * eased).round() as u16;
        send(PlaybackControl::Volume { volume })?;
    }
    Ok(())
}
pub fn pause(
    paused: bool,
    was_paused: bool,
    volume: u16,
    mut send: impl FnMut(PlaybackControl) -> Result<(), AppError>,
    mut wait: impl FnMut() -> Result<(), AppError>,
) -> Result<(), AppError> {
    if paused == was_paused || volume == 0 {
        return send(PlaybackControl::Pause { paused });
    }
    let result = if paused {
        ramp(volume, 0, &mut send, &mut wait)
            .and_then(|_| send(PlaybackControl::Pause { paused: true }))
    } else {
        send(PlaybackControl::Volume { volume: 0 })
            .and_then(|_| send(PlaybackControl::Pause { paused: false }))
            .and_then(|_| ramp(0, volume, &mut send, &mut wait))
    };
    // Restore even after a failed transition; otherwise the next play can remain silent.
    let restored = send(PlaybackControl::Volume { volume });
    result.and(restored)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fades_before_pause_and_after_resume_without_losing_user_volume() {
        for paused in [true, false] {
            let mut operations = Vec::new();
            pause(
                paused,
                !paused,
                37,
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
                PlaybackControl::Volume { volume: 0 }
            ));
            assert!(matches!(
                operations.last(),
                Some(PlaybackControl::Volume { volume: 37 })
            ));
            let levels: Vec<_> = operations[..operations.len() - 1]
                .iter()
                .filter_map(|op| {
                    if let PlaybackControl::Volume { volume } = op {
                        Some(*volume)
                    } else {
                        None
                    }
                })
                .collect();
            assert!(levels
                .windows(2)
                .all(|w| if paused { w[0] >= w[1] } else { w[0] <= w[1] }));
        }
    }
    #[test]
    fn interruption_restores_volume_and_does_not_pause_a_replaced_session() {
        let mut operations = Vec::new();
        let result = pause(
            true,
            false,
            65,
            |op| {
                operations.push(op);
                Ok(())
            },
            || Err(AppError::new("cancelled", "stopped")),
        );
        assert!(result.is_err());
        assert!(matches!(
            operations.as_slice(),
            [PlaybackControl::Volume { volume: 65 }]
        ));
    }
    #[test]
    fn muted_or_already_paused_tracks_never_ramp_up() {
        for (volume, was_paused) in [(0, false), (60, true)] {
            let mut count = 0;
            pause(
                true,
                was_paused,
                volume,
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
}
