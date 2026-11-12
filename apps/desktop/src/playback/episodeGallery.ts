import type { VideoMetadata, VideoWork } from '../video/gateway';
import { mergeEpisodes, type MergedEpisodeGroup } from '../video/mergedEpisodes.ts';
import { videoWorks } from '../video/sources.ts';
import { VIDEO_EXTENSIONS, extension } from '../local/match.ts';

export interface EpisodeBinding {
  copyId: string;
  path: string;
  label: string;
  episode?: number | null;
  track?: number | null;
}

export interface PlayerEpisode {
  key: string;
  copyId: string;
  path: string;
  number: number | null;
  badge: string;
  title: string;
  meta: string;
  stillUrl: string;
  groupLabel: string;
}

export const normalizePath = (path: string) => path.replace(/\\/g, '/').toLowerCase();

function episodeNumber(binding: EpisodeBinding) {
  return binding.episode !== null && binding.episode !== undefined && Number.isFinite(binding.episode)
    ? binding.episode
    : null;
}

/** Saved labels look like `作品名 · 第 3 章 · 分集标题`; keep the most specific part. */
export function localEpisodeTitle(binding: EpisodeBinding) {
  const detail = binding.label.split(' · ').slice(1).join(' · ');
  const stripped = detail.replace(/^第\s*\d+\s*[章轨集](?:\s*·\s*)?/, '').trim();
  if (stripped) return stripped;
  if (detail) return detail;
  const name = binding.path.split(/[\\/]/).pop() || binding.path;
  return name.replace(/\.[^.]+$/, '') || binding.label;
}

export function videoBindingsForCopy(bindings: EpisodeBinding[], copyId: string) {
  const seen = new Set<string>();
  return bindings
    .filter(binding => binding.copyId === copyId && VIDEO_EXTENSIONS.has(extension(binding.path)))
    .filter(binding => {
      const key = normalizePath(binding.path);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) =>
      (episodeNumber(left) ?? Number.MAX_SAFE_INTEGER) - (episodeNumber(right) ?? Number.MAX_SAFE_INTEGER)
      || left.label.localeCompare(right.label, 'zh-CN')
      || left.path.localeCompare(right.path));
}

function workForGroup(group: MergedEpisodeGroup, works: VideoWork[]) {
  const [source, externalId] = group.key.split(':');
  return works.find(work => work.source === source && String(work.externalId) === externalId) || null;
}

function stillFor(row: { imageUrl?: string } | null, work: VideoWork | null) {
  if (row?.imageUrl) return row.imageUrl;
  const images = work?.images || [];
  const backdrop = images.find(image => image.kind === 'backdrop' && image.previewUrl)
    || images.find(image => image.kind === 'backdrop' && image.url);
  return backdrop?.previewUrl || backdrop?.url || work?.posterUrl || '';
}

function titleMatches(binding: EpisodeBinding, row: { title: string; originalTitle: string }) {
  return [row.title, row.originalTitle].some(title => !!title && binding.label.includes(title));
}

/** The same episode number may exist in several seasons. Prefer the group whose saved labels name its episode titles. */
function groupScores(groups: MergedEpisodeGroup[], bindings: EpisodeBinding[]) {
  return groups.map(group => {
    const rows = new Map(group.rows.map(row => [Number(row.number), row]));
    let score = 0;
    for (const binding of bindings) {
      const number = episodeNumber(binding);
      if (number === null) continue;
      const row = rows.get(number);
      if (!row) continue;
      score += 2;
      if (titleMatches(binding, row)) score += 3;
    }
    return score;
  });
}

function findRow(binding: EpisodeBinding, groups: MergedEpisodeGroup[], scores: number[]) {
  const number = episodeNumber(binding);
  if (number === null) return null;
  const candidates = groups.flatMap((group, index) => group.rows
    .filter(row => Number(row.number) === number)
    .map(row => ({ group, row, index })));
  if (!candidates.length) return null;
  candidates.sort((left, right) =>
    Number(titleMatches(binding, right.row)) - Number(titleMatches(binding, left.row))
    || scores[right.index] - scores[left.index]
    || left.index - right.index);
  return candidates[0];
}

export function buildPlayerEpisodes(metadata: VideoMetadata | null, bindings: EpisodeBinding[], currentPath: string): PlayerEpisode[] {
  const works = videoWorks(metadata);
  const groups = mergeEpisodes(works, metadata?.chapterLinks || []);
  const scores = groupScores(groups, bindings);
  return bindings.map((binding, index) => {
    const match = findRow(binding, groups, scores);
    const work = match ? workForGroup(match.group, works) : null;
    const number = episodeNumber(binding);
    const meta = [match?.group.label, match?.row.airDate, match?.row.duration].filter(Boolean).join(' · ');
    return {
      key: normalizePath(binding.path),
      copyId: binding.copyId,
      path: binding.path,
      number,
      badge: String(number ?? index + 1).padStart(2, '0'),
      title: match?.row.title || match?.row.originalTitle || localEpisodeTitle(binding),
      meta,
      stillUrl: stillFor(match?.row || null, work),
      groupLabel: match?.group.label || '',
    };
  });
}

export function currentEpisodeIndex(items: PlayerEpisode[], currentPath: string) {
  const key = normalizePath(currentPath);
  return items.findIndex(item => item.key === key);
}
