import type { MusicSupplement, SongLink } from '../integrations/gateway';
import type { ReleaseTrack } from '../metadata/gateway';
import { trackKey, trackMatches } from '../integrations/trackMatches.ts';
import type { QueueAlbum } from './musicQueue';

export function linkedQueue(editionId: string, songId: number, album: MusicSupplement | null, links: SongLink[], rows: ReleaseTrack[]): QueueAlbum | null {
  const leaves = (tracks: ReleaseTrack[]): ReleaseTrack[] => tracks.flatMap(t => t.sub_tracks?.length ? leaves(t.sub_tracks) : t.type_ === 'heading' ? [] : [t]);
  const source = rows.length ? rows : (album?.tracks || []).map(t => ({ position: `${t.disc}-${t.number}`, title: t.title, duration: '', type_: 'track' }));
  const original = trackMatches(source, album);
  const matched = trackMatches(source, album, links);
  const replacements = new Map<number, MusicSupplement['tracks'][number]>();
  const extra: MusicSupplement['tracks'] = [];
  for (const row of leaves(source)) {
    const song = matched.get(trackKey(row));
    if (!song) continue;
    const previous = original.get(trackKey(row));
    if (previous) replacements.set(previous.id, song);
    else extra.push(song);
  }
  const tracks = [...(album?.tracks || []).map(t => replacements.get(t.id) || t), ...extra];
  const unique = tracks.filter((t, i) => tracks.findIndex(s => s.id === t.id) === i);
  if (!unique.some(t => t.id === songId)) return null;
  return { editionId, albumId: album?.albumId ?? null, title: album?.title || unique[0].title, artists: album?.artists || unique[0].artists, tracks: unique, lastSongId: songId };
}
