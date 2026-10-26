import type { MediumDraft } from '../library/types';
import type { LinkedMusicAlbum, SongLink, DiscAlbumLink } from '../integrations/gateway';
import type { ReleaseTrack } from '../metadata/gateway';
import { albumMatches, collectionRows, trackLeaves } from '../integrations/albumTracks.ts';
import { trackKey } from '../integrations/trackMatches.ts';
import { discPages } from '../metadata/discTracks.ts';
import type { QueueAlbum } from './musicQueue';

export function collectionQueue(editionId: string, songId: number, albums: LinkedMusicAlbum[], links: SongLink[], rows: ReleaseTrack[], bindings: DiscAlbumLink[] = [], discCount: number | readonly MediumDraft[] = 0): QueueAlbum | null {
  const matches = albumMatches(rows, albums, links, bindings, discCount);
  const ordered = trackLeaves(rows).length && typeof discCount !== 'number'
    ? discPages(rows, '', discCount).flatMap(page => trackLeaves(page.tracks)) : trackLeaves(collectionRows(rows, albums));
  const tracks = ordered.flatMap(row => {
    const song = matches.get(trackKey(row));
    return song ? [song] : [];
  });
  const unique = tracks.filter((song, i) => tracks.findIndex(s => s.id === song.id) === i);
  if (!unique.some(song => song.id === songId)) return null;
  return { editionId, albumId: albums.length === 1 ? albums[0].album.albumId : null,
    title: albums.map(a => a.album.title).join(' / ') || unique[0].title,
    artists: [...new Set(albums.flatMap(a => a.album.artists))], tracks: unique, lastSongId: songId };
}
