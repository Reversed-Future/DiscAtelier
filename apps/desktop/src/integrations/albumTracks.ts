import type { MediumDraft } from '../library/types';
import type { LinkedMusicAlbum, NeteaseSong, SongLink, DiscAlbumLink } from './gateway';
import type { ReleaseTrack } from '../metadata/gateway';
import { discPages, isVideoDiscKey } from '../metadata/discTracks.ts';
import { trackKey, trackMatches } from './trackMatches.ts';

export const trackLeaves = (rows: ReleaseTrack[]): ReleaseTrack[] => rows.flatMap(t => t.sub_tracks?.length ? trackLeaves(t.sub_tracks) : t.type_ === 'heading' ? [] : [t]);
export const albumPosition = (entry: LinkedMusicAlbum, song: NeteaseSong) => entry.legacyPositions ? `${song.disc}-${song.number}` : `netease:${entry.album.albumId}:${song.disc}:${song.number}`;
export function albumRows(entry: LinkedMusicAlbum): ReleaseTrack[] {
  return entry.album.tracks.map(song => {
    const seconds = Math.round(song.durationMs / 1000);
    return { position: albumPosition(entry, song), title: song.title, duration: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, type_: 'track' };
  });
}
export function collectionRows(rows: ReleaseTrack[], albums: LinkedMusicAlbum[]) {
  return trackLeaves(rows).length ? rows : albums.flatMap(albumRows);
}
export function albumRowLabel(row: ReleaseTrack, albums: LinkedMusicAlbum[]) {
  for (const entry of albums) {
    const song = entry.album.tracks.find(s => albumPosition(entry, s) === row.position && s.title === row.title);
    if (song) return `${song.disc}-${song.number}`;
  }
  return row.position;
}

// Exact manual identities always win. An automatic match must agree across all
// linked albums; duplicate titles in different releases are not silently picked.
export function albumMatches(rows: ReleaseTrack[], albums: LinkedMusicAlbum[], links: SongLink[], bindings: DiscAlbumLink[] = [], discCount: number | readonly MediumDraft[] = 0) {
  const physical = trackLeaves(rows).length > 0;
  const source = collectionRows(rows, albums);
  const leaves = trackLeaves(source);
  const counts = new Map<string, number>();
  for (const row of leaves) counts.set(trackKey(row), (counts.get(trackKey(row)) || 0) + 1);
  const result = trackMatches(source, null, links);
  if (!physical) {
    for (const entry of albums) for (const song of entry.album.tracks) {
      const key = trackKey({ position: albumPosition(entry, song), title: song.title });
      if (!result.has(key) && counts.get(key) === 1) result.set(key, song);
    }
    return result;
  }
  const automatic: Map<string, NeteaseSong>[] = [];
  const scoped = new Map<string, NeteaseSong>();
  const constrained = new Set<string>();
  for (const page of discPages(rows, '', discCount)) {
    const binding = bindings.find(b => b.discKey === page.key);
    if (!binding) {
      const carrier = typeof discCount !== 'number' && page.number !== undefined
        ? discCount[page.number - 1]?.carrierId : undefined;
      const video = carrier !== undefined ? carrier === 'bd' || carrier === 'dvd' : isVideoDiscKey(page.key);
      if (!video) automatic.push(...albums.map(entry => trackMatches(page.tracks, entry.album, links, { includeVideo: true })));
      continue;
    }
    const album = albums.find(a => a.album.albumId === binding.albumId)?.album ?? null;
    const matches = trackMatches(page.tracks, album, links, { includeVideo: true });
    for (const row of trackLeaves(page.tracks)) {
      const key = trackKey(row);
      constrained.add(key);
      const song = matches.get(key);
      if (song) scoped.set(key, song);
    }
  }
  const legacy = albums.flatMap(a => a.album.links.map(l => ({ ...l, song: a.album.tracks.find(t => t.id === l.songId) })));
  for (const row of leaves) {
    const key = trackKey(row);
    if (result.has(key) || counts.get(key) !== 1) continue;
    const explicit = legacy.filter(l => l.position === row.position && l.title === row.title && l.song).map(l => l.song!);
    if (!explicit.length && constrained.has(key)) { const song = scoped.get(key); if (song) result.set(key, song); continue; }
    const songs = explicit.length ? explicit : automatic.flatMap(m => m.has(key) ? [m.get(key)!] : []);
    const unique = new Map(songs.map(s => [s.id, s]));
    if (unique.size === 1) result.set(key, songs[0]);
  }
  return result;
}
