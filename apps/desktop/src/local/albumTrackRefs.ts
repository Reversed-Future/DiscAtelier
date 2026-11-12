import type { ReleaseTrack } from '../metadata/gateway';
import type { MediumDraft } from '../library/types';
import { discPages } from '../metadata/discTracks.ts';
import { trackKey } from '../integrations/trackMatches.ts';
import { normalized, parseTrack, positionNumber, trackNumberAt, type TrackTitle } from './match.ts';

export interface AlbumTrackRef extends TrackTitle {
  disc: string;
  discName: string;
  discNumber: number | null;
  number: number;
  order: number;
}

export interface DiscHint {
  kind: 'CD' | 'BD' | 'DVD' | 'DISC';
  number: number | null;
}

export function parseDiscHint(value: string): DiscHint | null {
  const text = normalized(value);
  const match = text.match(/\b(disc|cd|bd|dvd|bluray)\s*(\d{1,2})\b/);
  if (!match) return null;
  const word = match[1];
  const number = match[2] ? Number(match[2]) : null;
  return {
    kind: word === 'bluray' ? 'BD' : word.toUpperCase() as DiscHint['kind'],
    number,
  };
}

function discMatches(track: TrackTitle, hint: DiscHint) {
  const key = (track.disc || '').toLowerCase();
  const number = (track as AlbumTrackRef).discNumber ?? null;
  if (hint.kind === 'DISC') {
    return hint.number === null || number === hint.number
      || new RegExp(`(?:^|\\D)${hint.number}$`).test(key);
  }
  const expected = hint.kind.toLowerCase();
  if (!key.startsWith(expected)) return false;
  if (hint.number === null) return true;
  return number === hint.number || key === `${expected}${hint.number}`
    || new RegExp(`${expected}\\s*${hint.number}$`).test(key);
}

function fileCandidates(name: string) {
  const base = normalized(name);
  const candidates = new Set([base]);
  const parts = base.split(/\s+/);
  if (parts.length > 1) candidates.add(parts.slice(1).join(' '));
  const dash = name.replace(/\.[^.]+$/, '').split(/\s+[-–—]\s+/);
  if (dash.length > 1) candidates.add(normalized(dash[dash.length - 1]));
  return [...candidates].filter(Boolean);
}

/** Build the real playable tracks in disc order, excluding headings/title entries. */
export function albumTrackRefs(tracks: ReleaseTrack[], title: string, media: number | readonly MediumDraft[] = 0): AlbumTrackRef[] {
  let order = 0;
  const result: AlbumTrackRef[] = [];
  discPages(tracks, title, media).forEach((page, pageIndex) => {
    const rows = page.tracks.filter(track => track.type_ !== 'heading');
    rows.forEach((track, index) => {
      result.push({
        title: track.title,
        position: track.position,
        disc: page.key,
        discName: page.name || page.key,
        discNumber: page.number ?? pageIndex + 1,
        number: trackNumberAt(rows, index) ?? positionNumber(track.position) ?? index + 1,
        order: order++,
      });
    });
  });
  return result;
}

export function matchAlbumTrack(name: string, tracks: TrackTitle[], hintText = ''): AlbumTrackRef | null {
  if (!tracks.length) return null;
  const hint = parseDiscHint(hintText);
  const pool = tracks.map((track, index) => ({
    track,
    number: track.number ?? trackNumberAt(tracks, index) ?? index + 1,
  })).filter(item => !hint || discMatches(item.track, hint));
  if (!pool.length) return null;
  const candidates = fileCandidates(name);
  const titles = pool.map(item => normalized(item.track.title));
  let matches = pool.filter((item, index) => !!titles[index] && candidates.includes(titles[index]));
  if (!matches.length) {
    matches = pool.map((item, index) => {
      const title = titles[index];
      const matched = !!title && title.length >= 4 && candidates.some(candidate =>
        candidate.length >= 4 && (candidate.includes(title) || title.includes(candidate)));
      return { item, matched, length: title.length };
    }).filter(value => value.matched).sort((left, right) => right.length - left.length)
      .map(value => value.item);
  }
  const byNumber = (items: typeof pool) => {
    const number = parseTrack(name);
    if (number === null) return null;
    const found = items.filter(item => item.number === number);
    return found.length === 1 ? found[0] : null;
  };
  if (matches.length) {
    const uniqueTitle = new Set(matches.map(item => normalized(item.track.title))).size === 1;
    if (matches.length === 1) return albumRef(matches[0].track, matches[0].number);
    if (uniqueTitle) {
      const chosen = byNumber(matches);
      return chosen ? albumRef(chosen.track, chosen.number) : null;
    }
    return null;
  }
  const chosen = byNumber(pool);
  return chosen ? albumRef(chosen.track, chosen.number) : null;
}

export interface LocalBindingRef {
  label: string;
  track?: number | null;
  disc?: string | null;
}

/** Map saved local bindings onto the page rows by title, then unique track number. */
export function localBindingByTrack<T extends LocalBindingRef>(pages: { key: string; tracks: ReleaseTrack[] }[], bindings: T[]): Map<string, T> {
  const result = new Map<string, T>();
  const entries = pages.flatMap(page => {
    const tracks = page.tracks.filter(track => track.type_ !== 'heading');
    return tracks.map((track, index) => ({
      track,
      page,
      number: trackNumberAt(tracks, index) ?? positionNumber(track.position) ?? index + 1,
    }));
  });
  for (const binding of bindings) {
    const titles = entries.filter(entry => !!binding.label && binding.label.includes(` · ${entry.track.title}`)
      && (!binding.disc || entry.page.key === binding.disc));
    if (titles.length === 1) { result.set(trackKey(titles[0].track), binding); continue; }
    // Repeats such as "Grand Escape" on CD and DVD are disambiguated by the
    // unique track number; only ambiguous numbers remain unassociated.
    const pool = titles.length ? titles : binding.disc ? entries.filter(entry => entry.page.key === binding.disc) : entries;
    const numbers = binding.track != null ? pool.filter(entry => entry.number === binding.track) : [];
    if (numbers.length === 1) result.set(trackKey(numbers[0].track), binding);
  }
  return result;
}

function albumRef(track: TrackTitle, number: number): AlbumTrackRef {
  return {
    title: track.title,
    position: track.position,
    disc: track.disc || '',
    discName: track.discName || track.disc || '',
    discNumber: track.discNumber ?? null,
    number,
    order: track.order ?? 0,
  };
}
