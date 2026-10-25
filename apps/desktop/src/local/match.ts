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

export function isAudio(file: ScannedLike) {
  return AUDIO_EXTENSIONS.has(extension(file.name));
}

export function chooseItem(items: LibraryCopy[], file: ScannedLike, allowFallback = false): LibraryCopy | null {
  const text = `${file.relativePath} ${file.name}`;
  const category = isAudio(file) ? 'music' : 'video';
  const candidates = items
    .filter(item => item.edition.categoryId === category)
    .map(item => ({ item, value: score(item, text) }))
    .sort((left, right) => right.value - left.value);
  if (!candidates[0] || (!allowFallback && candidates[0].value === 0)) return null;
  return candidates[0].item;
}
