import type { ReleaseTrack } from '../metadata/gateway';
import type { MusicSupplement } from './gateway';
import { comparableTitle } from './trackTitle.ts';

export const trackKey = (track: Pick<ReleaseTrack, 'position' | 'title'>) => JSON.stringify([track.position, track.title]);
function leaves(rows: ReleaseTrack[]): ReleaseTrack[] {
  return rows.flatMap(t => t.sub_tracks?.length ? leaves(t.sub_tracks) : t.type_ === 'heading' ? [] : [t]);
}
function seconds(value: string): number | null {
  if (!/^\d+:[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
  return value.split(':').reduce((n, part) => n * 60 + Number(part), 0);
}
type Song = MusicSupplement['tracks'][number];
function timing(track: ReleaseTrack, song: Song, required = false) {
  const length = seconds(track.duration);
  if (length === null || !song.durationMs) return !required;
  return Math.abs(length - song.durationMs / 1000) <= Math.min(10, Math.max(5, length * .03));
}
// Positions use the same documented Discogs forms as discTracks.ts. Unknown
// positions never become inferred indices; array order is not a disc number.
function sameSlot(track: ReleaseTrack, song: Song, album: MusicSupplement) {
  const numbered = /^(?:CD)?([1-9]\d*)-0*([1-9]\d*)$/.exec(track.position);
  if (numbered) return song.disc === numbered[1] && song.number === Number(numbered[2]);
  const single = /^(?:CD-)?0*([1-9]\d*)$/.exec(track.position);
  return !!single && album.tracks.every(t => t.disc === '1') && song.number === Number(single[1]);
}
// Match only inside a user-selected album. Normalization applies to display
// titles, never source IDs or stored link keys. Version words remain significant.
export function trackMatches(rows: ReleaseTrack[], album: MusicSupplement | null) {
  const result = new Map<string, MusicSupplement['tracks'][number]>();
  if (!album) return result;
  const tracks = leaves(rows);
  const audio = tracks.filter(t => !t.position.startsWith('DVD'));
  const names = new Map(audio.map(t => [t, comparableTitle(t.title)]));
  const songNames = new Map(album.tracks.map(t => [t, comparableTitle(t.title)]));
  const used = new Set<number>();
  for (const track of tracks) {
    const key = trackKey(track);
    if (tracks.filter(t => trackKey(t) === key).length !== 1) continue;
    const link = album.links?.find(l => l.position === track.position && l.title === track.title);
    const manual = link && album.tracks.find(t => t.id === link.songId);
    if (manual) { result.set(key, manual); used.add(manual.id); }
  }
  for (const track of audio) {
    const key = trackKey(track), name = names.get(track);
    if (result.has(key) || !name || tracks.filter(t => trackKey(t) === key).length !== 1) continue;
    const same = album.tracks.filter(t => songNames.get(t) === name);
    const repeated = same.length > 1 || audio.filter(t => names.get(t) === name).length > 1;
    const matches = same.filter(song => !used.has(song.id) && timing(track, song, repeated)
      && (!repeated || sameSlot(track, song, album)));
    if (matches.length !== 1) continue;
    const song = matches[0];
    if (repeated && audio.filter(t => names.get(t) === name && timing(t, song, true) && sameSlot(t, song, album)).length !== 1) continue;
    result.set(key, song); used.add(song.id);
  }
  return result;
}
