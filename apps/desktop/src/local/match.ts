import type { LibraryCopy } from '../library/types';

export interface ScannedLike {
  relativePath: string;
  name: string;
}

export const AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'ape', 'wv']);
export const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'avi', 'mov', 'm4v', 'ts', 'm2ts', 'webm', 'wmv', 'flv', 'mpg', 'mpeg']);

export function extension(path: string) {
  return path.split('.').pop()?.toLowerCase() || '';
}

export function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[\[\](){}._-]+/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b(2160p|1080p|720p|480p|bluray|blu-ray|webrip|web-dl|bdrip|dvdrip|x264|x265|hevc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string) {
  return normalized(value).split(' ').filter(word => word.length >= 2);
}

export function score(item: LibraryCopy, text: string) {
  const path = normalized(text);
  const title = words(item.edition.title);
  const creator = words(item.edition.creator);
  let result = 0;
  for (const word of title) if (path.includes(word)) result += word.length >= 4 ? 4 : 2;
  for (const word of creator) if (path.includes(word)) result += 1;
  return result;
}

/** S01E03, 第 03 集, E03 and a leading 03 all map to episode 3. */
export function parseEpisode(name: string): number | null {
  const text = normalized(name);
  const season = text.match(/\bs\s*(\d{1,2})\s*e\s*(\d{1,3})\b/i);
  if (season) return Number(season[2]);
  const episode = text.match(/\b(?:ep|episode)\s*(\d{1,3})\b/i) || text.match(/第\s*(\d{1,3})\s*[集话話]/);
  if (episode) return Number(episode[1]);
  const leading = text.match(/^(\d{1,3})(?:\s|$)/);
  return leading ? Number(leading[1]) : null;
}

/** Track 03, CD03 and a leading 03 all map to track 3. */
export function parseTrack(name: string): number | null {
  const text = normalized(name);
  const marked = text.match(/\b(?:track|disc|cd)\s*(\d{1,3})\b/i);
  if (marked) return Number(marked[1]);
  const leading = text.match(/^(\d{1,3})(?:\s|$)/);
  if (leading) return Number(leading[1]);
  const separated = text.match(/\s(\d{1,3})(?:\s|$)/);
  return separated ? Number(separated[1]) : null;
}

export interface TrackTitle {
  title: string;
  position: string;
}

export function positionNumber(position: string): number | null {
  const value = position.match(/\d{1,3}/);
  return value ? Number(value[0]) : null;
}

export interface TrackMatch {
  number: number;
  title: string;
}

/** Match a file's song name against the album tracklist, independent of track numbers. */
export function matchTrack(name: string, tracks: TrackTitle[]): TrackMatch | null {
  if (!tracks.length) return null;
  const base = normalized(name);
  const parts = base.split(/\s+/);
  const candidates = new Set<string>([base]);
  const dash = name.replace(/\.[^.]+$/, '').split(/\s+[-–—]\s+/);
  if (dash.length > 1) candidates.add(normalized(dash[dash.length - 1]));
  if (parts.length > 1) candidates.add(parts.slice(1).join(' '));
  const numbers = tracks.map(track => positionNumber(track.position));
  const uniquePositions = new Set(numbers).size === tracks.length;
  const titles = tracks.map(track => normalized(track.title));
  // An exact title must win before trying containment. Otherwise a short title
  // such as "夏のせい" is swallowed by "夏のせい (English ver.)".
  const exact = titles
    .map((title, index) => candidates.has(title) ? index : -1)
    .filter(index => index >= 0);
  const best = exact.length ? exact[0] : tracks
    .map((track, index) => {
      const title = titles[index];
      const matched = [...candidates].some(candidate =>
        candidate.length >= 4 && title.length >= 4 && (candidate.includes(title) || title.includes(candidate)));
      return { index, matched, length: title.length };
    })
    .filter(value => value.matched)
    .sort((left, right) => right.length - left.length)[0]?.index;
  if (best === undefined) return null;
  const number = (uniquePositions ? numbers[best] : null) || best + 1;
  return { number, title: tracks[best].title };
}

export function matchTrackNumber(name: string, tracks: TrackTitle[]): number | null {
  return matchTrack(name, tracks)?.number || null;
}

export function isAudio(file: ScannedLike) {
  return AUDIO_EXTENSIONS.has(extension(file.name));
}

export function chooseItem(items: LibraryCopy[], file: ScannedLike, allowFallback = false, trackTitles?: Map<string, TrackTitle[]>): LibraryCopy | null {
  const text = `${file.relativePath} ${file.name}`;
  const category = isAudio(file) ? 'music' : 'video';
  const candidates = items
    .filter(item => item.edition.categoryId === category)
    .map(item => {
      const tracks = trackTitles?.get(item.id) || [];
      const track = category === 'music' && tracks.length ? matchTrackNumber(file.name, tracks) : null;
      return { item, value: score(item, text) + (track ? 20 : 0) };
    })
    .sort((left, right) => right.value - left.value);
  if (!candidates[0] || (!allowFallback && candidates[0].value === 0)) return null;
  return candidates[0].item;
}
