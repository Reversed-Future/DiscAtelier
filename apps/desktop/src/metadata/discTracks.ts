import type { ReleaseTrack } from './gateway';

export interface DiscPage { key: string; name: string; tracks: ReleaseTrack[]; numbered: boolean }

// Discogs guidelines 12.2.8 / 12.2.9: 1-1, 2-1, CD1-01, DVD1-1.
// A1/B1 and 3.1 do not identify a physical disc; never infer one by track count.
function discKey(position: string): string | null {
  const match = /^(CD|DVD)?([1-9]\d*)-0*[1-9]\d*(?:\.\d+)?$/.exec(position);
  return match ? `${match[1] || ''}${match[2]}` : null;
}

interface TrackRow { track: ReleaseTrack; key: string | null }
function flatten(tracks: ReleaseTrack[], parentKey: string | null = null): TrackRow[] {
  return tracks.flatMap(track => {
    const key = discKey(track.position) ?? parentKey;
    return track.sub_tracks?.length
      ? [{ track: { ...track, type_: 'heading', sub_tracks: [] }, key }, ...flatten(track.sub_tracks, key)]
      : [{ track, key }];
  });
}

export function discPages(tracks: ReleaseTrack[], title: string): DiscPage[] {
  const pages = new Map<string, DiscPage>();
  let headings: ReleaseTrack[] = [];
  for (const { track, key } of flatten(tracks)) {
    if (track.type_ === 'heading') { headings.push(track); continue; }
    const id = key ?? 'unassigned';
    let page = pages.get(id);
    if (!page) {
      page = { key: id, name: headings.find(row => row.title !== '-')?.title || title, tracks: [], numbered: key !== null };
      pages.set(id, page);
    }
    page.tracks.push(...headings, track);
    headings = [];
  }
  if (headings.length) {
    // Retain trailing headings too, rather than silently discarding source data.
    const last = [...pages.values()].at(-1);
    if (last) last.tracks.push(...headings);
    else pages.set('unassigned', { key: 'unassigned', name: title, tracks: headings, numbered: false });
  }
  return [...pages.values()];
}
