import { optical, type BlurayPlaylist } from './gateway';

export type { BlurayPlaylist } from './gateway';
export {
  formatDuration, longestPlaylist, markIndexAt, playlistOptionLabel, segmentMarks,
  type PlaylistInfo, type SegmentInfo, type SegmentMark,
} from './bluraySegments';

const cache = new Map<string, Promise<BlurayPlaylist[]>>();

/** Read-only playlist metadata, shared by the optical panel and player bar. */
export function loadBlurayPlaylists(mountPoint: string, token: string): Promise<BlurayPlaylist[]> {
  const key = `${mountPoint}:${token}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const request = optical.blurayPlaylists(mountPoint, token).catch(cause => {
    cache.delete(key);
    throw cause;
  });
  cache.set(key, request);
  return request;
}
