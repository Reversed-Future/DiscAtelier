/**
 * Pure helpers for Blu-ray playlist ranking and the full segmented progress
 * bar. No Tauri import: these rules are exercised by the Node test runner.
 */
export interface SegmentInfo {
  index: number;
  clipId: string;
  startSeconds: number;
  durationSeconds: number;
  seamless: boolean;
  angleCount: number;
}
export interface PlaylistInfo {
  playlist: string;
  durationSeconds: number;
  segments: SegmentInfo[];
  chapters: { index: number; startSeconds: number; durationSeconds: number }[];
}
export interface SegmentMark {
  startSeconds: number;
  endSeconds: number;
  label: string;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const value = Math.max(0, Math.round(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value % 3600 / 60);
  const rest = value % 60;
  return `${hours ? `${hours}:${String(minutes).padStart(2, '0')}` : minutes}:${String(rest).padStart(2, '0')}`;
}

/** The main feature is normally the longest playlist, not the first file name. */
export function longestPlaylist<T extends PlaylistInfo>(rows: readonly T[]): T | null {
  let result: T | null = null;
  for (const row of rows) {
    if (!Number.isFinite(row.durationSeconds) || row.durationSeconds <= 0) continue;
    if (!result
      || row.durationSeconds > result.durationSeconds + 0.001
      || (Math.abs(row.durationSeconds - result.durationSeconds) <= 0.001
        && (row.segments.length > result.segments.length
          || (row.segments.length === result.segments.length && row.playlist < result.playlist)))) {
      result = row;
    }
  }
  return result;
}

export function playlistOptionLabel(row: PlaylistInfo): string {
  const count = row.segments.length;
  return `${row.playlist} · ${formatDuration(row.durationSeconds)}${count > 1 ? ` · ${count} 段` : ''}`;
}

/**
 * Boundaries across the complete playlist. Seamless branches stay on one
 * timeline; a one-item playlist needs no divider bar.
 */
export function segmentMarks(row: PlaylistInfo | null | undefined): SegmentMark[] {
  if (!row || row.segments.length < 2) return [];
  const total = Number.isFinite(row.durationSeconds) && row.durationSeconds > 0
    ? row.durationSeconds
    : row.segments.reduce((sum, segment) => sum + Math.max(0, segment.durationSeconds || 0), 0);
  if (!(total > 0)) return [];
  let elapsed = 0;
  const marks: SegmentMark[] = [];
  row.segments.forEach((segment, index) => {
    const duration = Number.isFinite(segment.durationSeconds) ? segment.durationSeconds : 0;
    const start = Number.isFinite(segment.startSeconds) && segment.startSeconds >= 0
      ? segment.startSeconds
      : elapsed;
    elapsed = start + Math.max(0, duration);
    if (!(duration > 0) || start >= total) return;
    marks.push({
      startSeconds: start,
      endSeconds: Math.min(total, elapsed),
      label: `第 ${index + 1} 段 · ${segment.clipId || row.playlist}`,
    });
  });
  return marks;
}

export function markIndexAt(marks: readonly SegmentMark[], seconds: number): number {
  let result = -1;
  for (let index = 0; index < marks.length; index += 1) {
    if (seconds >= marks[index].startSeconds) result = index;
    else break;
  }
  return result;
}
