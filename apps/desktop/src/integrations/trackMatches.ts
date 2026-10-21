import type { ReleaseTrack } from '../metadata/gateway';
import type { MusicSupplement } from './gateway';

export const trackKey = (track: Pick<ReleaseTrack, 'position' | 'title'>) => JSON.stringify([track.position, track.title]);
function leaves(rows: ReleaseTrack[]): ReleaseTrack[] {
  return rows.flatMap(t => t.sub_tracks?.length ? leaves(t.sub_tracks) : t.type_ === 'heading' ? [] : [t]);
}
function seconds(value: string): number | null {
  if (!/^\d+:[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
  return value.split(':').reduce((n, part) => n * 60 + Number(part), 0);
}
// Match only within the album explicitly saved by the user. Preserve spelling,
// case and version suffixes; neither position alone nor fuzzy title establishes identity.
export function trackMatches(rows: ReleaseTrack[], album: MusicSupplement | null) {
  const result = new Map<string, MusicSupplement['tracks'][number]>();
  if (!album) return result;
  const tracks = leaves(rows);
  const audio = tracks.filter(t => !t.position.startsWith('DVD'));
  for (const track of tracks) {
    const key = trackKey(track);
    if (tracks.filter(t => trackKey(t) === key).length !== 1) continue;
    const link = album.links?.find(l => l.position === track.position && l.title === track.title);
    const manual = link && album.tracks.find(t => t.id === link.songId);
    if (manual) { result.set(key, manual); continue; }
    if (!audio.includes(track) || audio.filter(t => t.title === track.title).length !== 1) continue;
    const same = album.tracks.filter(t => t.title === track.title);
    if (same.length !== 1) continue;
    const length = seconds(track.duration);
    if (length !== null && same[0].durationMs > 0 && Math.abs(length - same[0].durationMs / 1000) > 2) continue;
    result.set(key, same[0]);
  }
  return result;
}
