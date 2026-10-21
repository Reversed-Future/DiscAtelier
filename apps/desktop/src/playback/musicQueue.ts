import type { MusicSupplement } from '../integrations/gateway';

// UI history contains metadata only. Stream URLs and credentials are never stored.
export interface QueueAlbum {
  editionId: string; albumId: number; title: string; artists: string[];
  tracks: MusicSupplement['tracks']; lastSongId: number;
}
export type RepeatMode = 'list' | 'one';
export interface QueueHistory { version: 1; mode: RepeatMode; albums: QueueAlbum[] }
export const historyKey = 'discatelier.music-queue.v1';
export const emptyHistory = (): QueueHistory => ({ version: 1, mode: 'list', albums: [] });
export function rememberAlbum(albums: QueueAlbum[], album: QueueAlbum): QueueAlbum[] {
  return [album, ...albums.filter(row => row.albumId !== album.albumId)].slice(0, 3);
}
export function nextSong(album: QueueAlbum, songId: number, mode: RepeatMode, direction = 1, automatic = false): number | null {
  const index = album.tracks.findIndex(track => track.id === songId);
  if (index < 0 || !album.tracks.length) return null;
  return album.tracks[automatic && mode === 'one' ? index : (index + direction + album.tracks.length) % album.tracks.length].id;
}
export function parseHistory(raw: string | null): QueueHistory {
  try {
    const value = JSON.parse(raw || 'null');
    if (value?.version !== 1 || !['list', 'one'].includes(value.mode) || !Array.isArray(value.albums)) return emptyHistory();
    const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 4000;
    const id = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
    const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
    const albums: QueueAlbum[] = [];
    for (const album of value.albums.slice(0, 3)) {
      if (!album || !text(album.editionId) || !album.editionId || !id(album.albumId) || !text(album.title) || !strings(album.artists)
        || !Array.isArray(album.tracks) || !album.tracks.length || album.tracks.length > 5000 || !id(album.lastSongId)) continue;
      const tracks: QueueAlbum['tracks'] = [];
      for (const track of album.tracks) {
        if (!track || !id(track.id) || !text(track.title) || !strings(track.artists) || !text(track.disc)
          || !Number.isSafeInteger(track.number) || track.number < 0 || !Number.isFinite(track.durationMs) || track.durationMs < 0) continue;
        if (!tracks.some(row => row.id === track.id)) tracks.push({ id: track.id, title: track.title, artists: track.artists, disc: track.disc, number: track.number, durationMs: track.durationMs });
      }
      if (tracks.length && tracks.some(track => track.id === album.lastSongId) && !albums.some(row => row.albumId === album.albumId))
        albums.push({ editionId: album.editionId, albumId: album.albumId, title: album.title, artists: album.artists, tracks, lastSongId: album.lastSongId });
    }
    return { version: 1, mode: value.mode, albums };
  } catch { return emptyHistory(); }
}
