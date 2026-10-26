import type { ReleaseTrack } from '../metadata/gateway';

export function updateTrackRows(rows: ReleaseTrack[], path: number[], patch: Partial<ReleaseTrack>): ReleaseTrack[] {
  const [index, ...rest] = path;
  return rows.map((row, at) => at !== index ? row : rest.length
    ? { ...row, sub_tracks: updateTrackRows(row.sub_tracks || [], rest, patch) } : { ...row, ...patch });
}

export function assignTrackDisc(rows: ReleaseTrack[], path: number[], disc_number: number | null): ReleaseTrack[] {
  const [index, ...rest] = path;
  if (rest.length) return rows.map((row, at) => at === index ? { ...row, sub_tracks: assignTrackDisc(row.sub_tracks || [], rest, disc_number) } : row);
  let end = index + 1;
  if (rows[index]?.type_ === 'heading') {
    while (end < rows.length && rows[end].type_ !== 'heading') end++;
  }
  return rows.map((row, at) => at >= index && at < end ? { ...row, disc_number } : row);
}

export function removeTrackRows(rows: ReleaseTrack[], path: number[]): ReleaseTrack[] {
  const [index, ...rest] = path;
  if (index === undefined) return rows;
  if (!rest.length) return rows.filter((_, at) => at !== index);
  return rows.map((row, at) => at === index
    ? { ...row, sub_tracks: removeTrackRows(row.sub_tracks || [], rest) }
    : row);
}
