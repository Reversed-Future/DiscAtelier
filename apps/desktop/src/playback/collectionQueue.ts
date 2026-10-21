import type { LinkedMusicAlbum, SongLink, DiscAlbumLink } from '../integrations/gateway';
import type { ReleaseTrack } from '../metadata/gateway';
import { albumMatches, collectionRows, trackLeaves } from '../integrations/albumTracks.ts';
import { trackKey } from '../integrations/trackMatches.ts';
import type { QueueAlbum } from './musicQueue';

export function collectionQueue(editionId: string, songId: number, albums: LinkedMusicAlbum[], links: SongLink[], rows: ReleaseTrack[], bindings: DiscAlbumLink[] = []): QueueAlbum | null {
  const matches = albumMatches(rows, albums, links, bindings);
  const tracks = trackLeaves(collectionRows(rows, albums)).flatMap(row => {
    const song = matches.get(trackKey(row));
    return song ? [song] : [];
  });
  const unique = tracks.filter((song, i) => tracks.findIndex(s => s.id === song.id) === i);
  if (!unique.some(song => song.id === songId)) return null;
  return { editionId, albumId: albums.length === 1 ? albums[0].album.albumId : null,
    title: albums.map(a => a.album.title).join(' / ') || unique[0].title,
    artists: [...new Set(albums.flatMap(a => a.album.artists))], tracks: unique, lastSongId: songId };
}
