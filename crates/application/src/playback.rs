use crate::{LibraryRepository, LibraryService};
use discatelier_contracts::{AppError, PlaybackRecord};

pub trait PlaybackHistoryRepository: Send {
    fn save_playback(&mut self, record: &PlaybackRecord) -> Result<(), AppError>;
    fn playback_history(&self) -> Result<Vec<PlaybackRecord>, AppError>;
    fn interrupt_playback(&mut self) -> Result<(), AppError>;
}
impl<R: LibraryRepository + PlaybackHistoryRepository> LibraryService<R> {
    pub fn save_playback(&mut self, record: &PlaybackRecord) -> Result<(), AppError> {
        self.repository.save_playback(record)
    }
    pub fn playback_history(&self) -> Result<Vec<PlaybackRecord>, AppError> {
        self.repository.playback_history()
    }
    pub fn interrupt_playback(&mut self) -> Result<(), AppError> {
        self.repository.interrupt_playback()
    }
}

/// Count contiguous media advancement, never the distance skipped by a seek.
#[derive(Default)]
pub struct PlaybackProgress {
    previous: Option<(f64, f64)>,
    watched: f64,
    ranges: Vec<(f64, f64)>,
}
impl PlaybackProgress {
    pub fn reset_sample(&mut self) {
        self.previous = None;
    }
    pub fn sample(&mut self, position: f64, monotonic_seconds: f64, playing: bool) {
        if !position.is_finite() || position < 0.0 || !playing {
            self.reset_sample();
            return;
        }
        if let Some((before, time)) = self.previous {
            let delta = position - before;
            let elapsed = monotonic_seconds - time;
            if elapsed > 0.0 && elapsed <= 2.0 && delta > 0.0 && delta <= elapsed * 1.5 + 0.25 {
                self.watched += delta.min(elapsed);
                self.ranges.push((before, position));
                self.ranges.sort_by(|a, b| a.0.total_cmp(&b.0));
                let mut merged: Vec<(f64, f64)> = Vec::new();
                for &(start, end) in &self.ranges {
                    if let Some(last) = merged.last_mut().filter(|last| start <= last.1 + 0.1) {
                        last.1 = last.1.max(end);
                    } else {
                        merged.push((start, end));
                    }
                }
                if merged.len() > 10000 {
                    merged.truncate(10000);
                }
                self.ranges = merged;
            }
        }
        self.previous = Some((position, monotonic_seconds));
    }
    pub fn watched(&self) -> f64 {
        self.watched
    }
    pub fn completed(&self, duration: Option<f64>, eof: bool) -> bool {
        eof && duration.is_some_and(|d| {
            d > 0.0 && self.ranges.iter().map(|(a, b)| b - a).sum::<f64>() >= d * 0.9
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pause_seek_and_sleep_do_not_count_as_watching() {
        let mut p = PlaybackProgress::default();
        p.sample(0.0, 0.0, true);
        p.sample(1.0, 1.0, true);
        p.sample(1.0, 2.0, false);
        p.sample(1.0, 50.0, false);
        p.sample(600.0, 51.0, true);
        p.sample(601.0, 52.0, true);
        p.sample(7800.0, 53.0, true);
        assert_eq!(p.watched(), 2.0);
        assert!(!p.completed(Some(7800.0), true));
        p.sample(7801.0, 100.0, true);
        assert_eq!(p.watched(), 2.0);
    }
    #[test]
    fn repeated_section_cannot_complete_unwatched_content() {
        let mut p = PlaybackProgress::default();
        for pass in 0..20 {
            p.reset_sample();
            for i in 0..6 {
                p.sample(i as f64, (pass * 10 + i) as f64, true);
            }
        }
        assert!(p.watched() >= 90.0);
        assert!(!p.completed(Some(100.0), true));
    }
    #[test]
    fn completion_requires_coverage_and_natural_end() {
        let mut p = PlaybackProgress::default();
        for i in 0..=10 {
            p.sample(i as f64, i as f64, true);
        }
        assert!(!p.completed(Some(10.0), false));
        assert!(p.completed(Some(10.0), true));
    }
}
