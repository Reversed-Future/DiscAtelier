import type { ReleaseTrack } from '../metadata/gateway';

export function removeTrackRows(rows: ReleaseTrack[], path: number[]): ReleaseTrack[] {
  const [index, ...rest] = path;
  if (index === undefined) return rows;
  if (!rest.length) return rows.filter((_, at) => at !== index);
  return rows.map((row, at) => at === index
    ? { ...row, sub_tracks: removeTrackRows(row.sub_tracks || [], rest) }
    : row);
}
