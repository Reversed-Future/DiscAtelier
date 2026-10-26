import type { ReleaseTrack } from './gateway';
import type { MediumDraft } from '../library/types';
import { sourceSections, structureKeys, physicalDiscCount } from './discStructure.ts';
import { physicalDiscNumber } from './physicalDiscs.ts';

export interface DiscEntry { source: ReleaseTrack; path: number[] }
export interface DiscPage { key: string; name: string; tracks: ReleaseTrack[]; numbered: boolean; number?: number; entries?: DiscEntry[]; titleEntry?: DiscEntry }

// Discogs positions: 1-1, 2-1, CD1-01, DVD1-1; Quintet uses BD1-13 / BD2-1.
// A1/B1 and 3.1 do not identify a physical disc; never infer one by track count.
export function discKey(position: string): string | null {
  // Pop Virus uses CD1…CD14 and BR1…: the digits identify tracks, not discs.
  const compact = /^(CD|BR)0*[1-9]\d*$/.exec(position);
  if (compact) return compact[1];
  const match = /^(CD|DVD|BD)?([1-9]\d*)-0*[1-9]\d*(?:\.\d+)?$/.exec(position);
  if (match) return `${match[1] || ''}${match[2]}`;
  // Release 14262376 explicitly uses CD-1…CD-15 and DVD-1…DVD-14.
  return /^(CD|DVD|BD)-0*[1-9]\d*(?:\.\d+)?$/.exec(position)?.[1] ?? null;
}

export function isVideoDiscKey(key: string | null): boolean {
  return key !== null && /^(?:DVD|BD|BR)(?:[1-9]\d*)?$/.test(key);
}

interface TrackRow extends DiscEntry { track: ReleaseTrack; key: string | null }
function flatten(tracks: ReleaseTrack[], parentKey: string | null = null, sectionKey: string | null = null, prefix: number[] = [], roots?: Map<ReleaseTrack, number>): TrackRow[] {
  return tracks.flatMap((track, index) => {
    const path = [...prefix, prefix.length ? index : roots?.get(track) ?? index];
    const key = track.disc_number != null ? `manual:${track.disc_number}`
      : parentKey?.startsWith('manual:') ? parentKey : sectionKey ?? discKey(track.position) ?? parentKey;
    return track.sub_tracks?.length
      ? [{ track: { ...track, type_: 'heading', sub_tracks: [] }, source: track, path, key }, ...flatten(track.sub_tracks, key, sectionKey, path)]
      : [{ track, source: track, path, key }];
  });
}

export function discPages(tracks: ReleaseTrack[], title: string, media: number | readonly MediumDraft[] = 0): DiscPage[] {
  const discCount = typeof media === 'number' ? media : physicalDiscCount(media);
  const pages = new Map<string, DiscPage>();
  let headings: TrackRow[] = [];
  const sections = sourceSections(tracks);
  const sectionKeys = structureKeys(sections, discCount, discKey);
  const roots = new Map(tracks.map((track, index) => [track, index]));
  const rows = sectionKeys ? sections.flatMap((section, i) => flatten(section, null, sectionKeys[i], [], roots)) : flatten(tracks);
  for (const row of rows) {
    const { track, key } = row;
    if (track.type_ === 'heading' && key !== null && (sectionKeys !== null || key.startsWith('manual:'))) {
      const id = key;
      let page = pages.get(id);
      const name = track.heading_kind === 'section' || track.title === '-' ? title : track.title || title;
      if (!page) { page = { key: id, name, tracks: [], entries: [], numbered: true }; pages.set(id, page); }
      else if (page.name === title && name !== title) page.name = name;
      if (!page.titleEntry && row.source.type_ === 'heading' && track.heading_kind !== 'section' && track.title !== '-') page.titleEntry = row;
      page.tracks.push(track); page.entries!.push(row);
      continue;
    }
    if (track.type_ === 'heading') { headings.push(row); continue; }
    const id = key ?? 'unassigned';
    let page = pages.get(id);
    if (!page) {
      const titleRow = headings.find(row => row.track.title !== '-' && row.track.heading_kind !== 'section');
      page = { key: id, name: titleRow?.track.title || title, tracks: [], entries: [], titleEntry: titleRow?.source.type_ === 'heading' ? titleRow : undefined, numbered: key !== null };
      pages.set(id, page);
    }
    page.tracks.push(...headings.map(row => row.track), track);
    page.entries!.push(...headings, row);
    headings = [];
  }
  if (headings.length) {
    // Retain trailing headings too, rather than silently discarding source data.
    const last = [...pages.values()].at(-1);
    if (last) { last.tracks.push(...headings.map(row => row.track)); last.entries!.push(...headings); }
    else pages.set('unassigned', { key: 'unassigned', name: title, tracks: headings.map(row => row.track), entries: headings, numbered: false });
  }
  if (typeof media === 'number' || !media.length) return [...pages.values()];
  const merged = new Map<string, DiscPage>();
  for (const page of pages.values()) {
    const number = physicalDiscNumber(page.key, media);
    const slot = number === null ? page.key : `physical:${number}`;
    const existing = merged.get(slot);
    if (existing) {
      existing.tracks.push(...page.tracks); existing.entries!.push(...page.entries!);
      if (existing.key.startsWith('manual:') && !page.key.startsWith('manual:')) existing.key = page.key;
      if (existing.name === title && page.name !== title) existing.name = page.name;
      if (!existing.titleEntry && page.titleEntry) existing.titleEntry = page.titleEntry;
    } else merged.set(slot, { ...page, number: number ?? undefined, numbered: number !== null });
  }
  for (const page of merged.values()) {
    const ordered = page.entries!.map((entry, index) => ({ entry, track: page.tracks[index] }));
    ordered.sort((a, b) => {
      for (let index = 0; index < Math.min(a.entry.path.length, b.entry.path.length); index++) {
        const difference = a.entry.path[index] - b.entry.path[index];
        if (difference) return difference;
      }
      return a.entry.path.length - b.entry.path.length;
    });
    page.entries = ordered.map(row => row.entry);
    page.tracks = ordered.map(row => row.track);
  }
  return [...merged.values()].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
}
