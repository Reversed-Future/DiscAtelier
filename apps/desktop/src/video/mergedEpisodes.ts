import type { VideoChapter, VideoChapterLink, VideoSource, VideoWork } from './gateway';

export interface EpisodeCandidate { id: string; label: string }
export interface MergedEpisode extends VideoChapter {
  key: string;
  sources: string[];
  source: VideoSource;
  /** No automatic counterpart was found while the other site has episodes. */
  unmatched?: boolean;
  /** Saved explicit pair that produced this row, when one exists. */
  chapterLink?: VideoChapterLink;
  /** Episodes from the other site that can be picked without typing an ID. */
  candidates?: EpisodeCandidate[];
}
interface EpisodeGroup { key: string; label: string; work: VideoWork; rows: VideoChapter[] }
export interface MergedEpisodeGroup { key: string; label: string; rows: MergedEpisode[] }
const sourceName = (work: VideoWork) => work.source === 'bangumi' ? 'Bangumi' : work.source === 'local' ? '本地' : 'TMDB';
const identity = (work: VideoWork) => `${work.source}:${work.externalId}`;
const normalizeTitle = (value?: string | null) => (value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s\p{P}\p{S}]+/gu, '');
const titlesMatch = (a?: string | null, b?: string | null) => {
  const left = normalizeTitle(a), right = normalizeTitle(b);
  if (!left || !right) return false;
  return left === right || (left.length >= 4 && right.length >= 4 && (left.includes(right) || right.includes(left)));
};
const episodeTitlesMatch = (a: VideoChapter, b: VideoChapter) =>
  [a.title, a.originalTitle].some(left => [b.title, b.originalTitle].some(right => titlesMatch(left, right)));
const workTitlesMatch = (a: VideoWork, b: VideoWork) =>
  [a.title, a.originalTitle].some(left => [b.title, b.originalTitle].some(right => titlesMatch(left, right)));
const dayNumber = (value?: string) => {
  if (!value) return null;
  const time = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(time) ? Math.round(time / 86_400_000) : null;
};

// Only explicit provider season/type fields participate. Localized group titles are display text.
function groups(works: VideoWork[]): EpisodeGroup[] {
  return works.flatMap(work => {
    const result = new Map<string, EpisodeGroup>();
    for (const row of work.chapters || []) {
      const part = work.source === 'bangumi' ? row.episodeKind : row.seasonNumber;
      const key = `${identity(work)}:${part === undefined ? `legacy:${row.group}` : part}`;
      if (!result.has(key)) result.set(key, {key, label: row.group, work, rows: []});
      result.get(key)!.rows.push(row);
    }
    return [...result.values()];
  });
}
/**
 * Score a Bangumi group against a TMDB season. A season can still correspond
 * when some dates or translations differ; exact numbers/counts, nearby dates,
 * shared original/translated titles and the work title all contribute.
 */
function groupScore(a: EpisodeGroup, b: EpisodeGroup): number | null {
  if (a.work.source !== 'bangumi' || b.work.source !== 'tmdbTv' ||
      !a.rows.every(r => r.episodeKind === 0) || !b.rows.every(r => r.seasonNumber !== undefined && r.seasonNumber > 0)) return null;
  const left = new Map(a.rows.map(r => [r.number, r])), right = new Map(b.rows.map(r => [r.number, r]));
  if (left.size !== a.rows.length || right.size !== b.rows.length) return null;
  const shared = [...left.keys()].filter(number => right.has(number));
  if (!shared.length) return null;
  let exactDates = 0, nearDates = 0, distantDates = 0, matchingTitles = 0;
  for (const number of shared) {
    const x = left.get(number)!, y = right.get(number)!;
    const dx = dayNumber(x.airDate), dy = dayNumber(y.airDate);
    if (dx !== null && dy !== null) {
      const difference = Math.abs(dx - dy);
      if (difference === 0) exactDates++;
      else if (difference <= 2) nearDates++;
      else if (difference > 7) distantDates++;
    }
    if (episodeTitlesMatch(x, y)) matchingTitles++;
  }
  const sameSize = a.rows.length === b.rows.length;
  const minCount = Math.min(a.rows.length, b.rows.length), maxCount = Math.max(a.rows.length, b.rows.length);
  const workMatch = workTitlesMatch(a.work, b.work);
  const evidence = exactDates + nearDates + matchingTitles;
  // A single episode must not merge across a clearly different date, and a
  // single undated episode needs a matching title (not just a shared number).
  if (maxCount === 1 && distantDates > 0) return null;
  if (maxCount === 1 && exactDates + nearDates === 0 && matchingTitles === 0) return null;
  // Partial sets need date/title evidence or matching work titles.
  if (!sameSize && evidence < 1 && !workMatch) return null;
  // Uneven partial sets need at least one date, two title matches or work title.
  if (!sameSize && exactDates + nearDates === 0 && matchingTitles < 2 && !workMatch) return null;
  // Complete sets may omit dates, but missing rows need date/title evidence.
  if (sameSize && shared.length < minCount && evidence === 0) return null;
  if (shared.length < Math.ceil(minCount * 0.6)) return null;
  // Some episodes may disagree; a majority of distant dates is still a different season.
  if (distantDates > evidence) return null;
  let score = shared.length * 2 + exactDates * 3 + nearDates * 2 + matchingTitles * 2 - distantDates * 2;
  if (sameSize && shared.length === minCount) score += 2;
  if (workMatch) score += 2;
  return score;
}
function bestScored<T>(items: T[], score: (item: T) => number | null) {
  let best: T | null = null, bestScore = -Infinity, tied = false;
  for (const item of items) {
    const value = score(item);
    if (value === null) continue;
    if (value > bestScore) { best = item; bestScore = value; tied = false; }
    else if (value === bestScore) tied = true;
  }
  return { best, bestScore, tied };
}
interface EpisodeRef { key:string; group:EpisodeGroup; row:VideoChapter }
const refKey = (group:EpisodeGroup, row:VideoChapter) => `${group.key}:${row.id}`;
const contentKeys = ({row}:EpisodeRef) => row.number && row.airDate ? [JSON.stringify([row.number,row.airDate])] : [];
function episodeIndex(refs:EpisodeRef[]) {
  const index = new Map<string,EpisodeRef[]>();
  for (const ref of refs) for (const key of contentKeys(ref)) index.set(key,[...(index.get(key) || []),ref]);
  return index;
}
function lookup(ref:EpisodeRef,index:Map<string,EpisodeRef[]>) {
  return [...new Map(contentKeys(ref).flatMap(key => index.get(key) || []).map(row => [row.key,row])).values()];
}
function datedEpisode(a:EpisodeRef, b:EpisodeRef) {
  if (a.group.work.source !== 'bangumi' || b.group.work.source !== 'tmdbTv') return false;
  const x=a.row,y=b.row;
  // User-linked sources, an identical episode number and air date identify this
  // episode even when translations use different words or a title is missing.
  if ((x.episodeKind !== undefined && x.episodeKind !== 0) || y.seasonNumber === 0) return false;
  return !!x.number && x.number === y.number && !!x.airDate && x.airDate === y.airDate;
}
function preferredMatches(ref:EpisodeRef,index:Map<string,EpisodeRef[]>, reverse = false) {
  const matches = lookup(ref,index).filter(other => reverse ? datedEpisode(other,ref) : datedEpisode(ref,other));
  if (matches.length < 2) return matches;
  // Titles only help resolve multiple date/number matches; they never veto a
  // unique match. No synonym dictionary or character-similarity threshold.
  const sameTitle = matches.filter(({row}) => [ref.row.title,ref.row.originalTitle]
    .some(title => !!title && (title === row.title || title === row.originalTitle)));
  return sameTitle.length ? sameTitle : matches;
}
function chapterIndex(refs:EpisodeRef[]) {
  const index = new Map<string,EpisodeRef | null>();
  for (const ref of refs) {
    const id = String(ref.row.id);
    index.set(id, index.has(id) ? null : ref);
  }
  return index;
}
// Explicit pairs win over automatic matching. Duplicate or missing chapter IDs
// are ignored so an old link cannot block the remaining automatic rows.
function manualPairs(refs:EpisodeRef[], links:VideoChapterLink[]) {
  const bangumi = chapterIndex(refs.filter(ref => ref.group.work.source === 'bangumi'));
  const tmdb = chapterIndex(refs.filter(ref => ref.group.work.source === 'tmdbTv'));
  const pairs = new Map<string,{bangumi:EpisodeRef;tmdb:EpisodeRef}>(), used = new Set<string>();
  for (const link of links) {
    const b = bangumi.get(link.bangumi), t = tmdb.get(link.tmdb);
    if (!b || !t || pairs.has(b.key) || used.has(t.key)) continue;
    pairs.set(b.key,{bangumi:b,tmdb:t}); used.add(t.key);
  }
  return {pairs,used};
}
function combine(row:VideoChapter, key:string, group:EpisodeGroup, supplement?:VideoChapter, chapterLink?:VideoChapterLink):MergedEpisode {
  return {...row,key,source:group.work.source,sources:supplement ? ['Bangumi','TMDB'] : [sourceName(group.work)],
    ...(chapterLink ? {chapterLink} : {}),
    title:row.title || supplement?.title || '',originalTitle:row.originalTitle || supplement?.originalTitle || '',
    airDate:row.airDate || supplement?.airDate || '',duration:row.duration || supplement?.duration || '',
    summary:supplement?.summary || row.summary,imageUrl:supplement?.imageUrl || row.imageUrl};
}
function candidateLabel(ref:EpisodeRef) {
  const title = ref.row.originalTitle || ref.row.title;
  return [ref.group.work.source === 'bangumi' ? 'Bangumi' : 'TMDB',ref.group.label.trim(),
    ref.row.number ? `第 ${ref.row.number} 集` : '未编号',title,ref.row.airDate].filter(Boolean).join(' · ');
}
function candidatesFor(refs:EpisodeRef[]):EpisodeCandidate[] {
  const unique = [...new Map(refs.map(ref => [String(ref.row.id),ref])).values()];
  unique.sort((a,b) => (Number(a.row.number) || 0) - (Number(b.row.number) || 0) || a.group.label.localeCompare(b.group.label));
  return unique.map(ref => ({id:String(ref.row.id),label:candidateLabel(ref)}));
}
export function mergeEpisodes(works: VideoWork[], chapterLinks: VideoChapterLink[] = []): MergedEpisodeGroup[] {
  const all = groups(works);
  const refs:EpisodeRef[] = all.flatMap(group => group.rows.map(row => ({key:refKey(group,row),group,row})));
  const manual = manualPairs(refs, chapterLinks), locked = new Set<string>();
  for (const {bangumi,tmdb} of manual.pairs.values()) { locked.add(bangumi.group.key); locked.add(tmdb.group.key); }
  const paired = new Map<string, EpisodeGroup>(), consumed = new Set<string>();
  const bangumiGroups = all.filter(g => g.work.source === 'bangumi' && !locked.has(g.key));
  const tmdbGroups = all.filter(g => g.work.source === 'tmdbTv' && !locked.has(g.key));
  const scores = new Map<string, Map<string, number>>();
  for (const group of bangumiGroups) {
    const row = new Map<string, number>();
    for (const other of tmdbGroups) {
      const score = groupScore(group, other);
      if (score !== null) row.set(other.key, score);
    }
    scores.set(group.key, row);
  }
  // Pair only when each side is the other side's unique best candidate.
  for (const group of bangumiGroups) {
    if (paired.has(group.key)) continue;
    const forward = bestScored(tmdbGroups.filter(other => !consumed.has(other.key)), other => scores.get(group.key)?.get(other.key) ?? null);
    const target = forward.best;
    if (!target || forward.tied) continue;
    const reverse = bestScored(bangumiGroups.filter(other => !paired.has(other.key)), other => scores.get(other.key)?.get(target.key) ?? null);
    if (reverse.best !== group || reverse.tied) continue;
    paired.set(group.key, target); consumed.add(target.key);
  }
  const autoRefs:EpisodeRef[] = all.filter(g => !paired.has(g.key) && !consumed.has(g.key))
    .flatMap(group => group.rows.map(row => ({key:refKey(group,row),group,row})))
    .filter(ref => !manual.pairs.has(ref.key) && !manual.used.has(ref.key));
  const singles = new Map<string,EpisodeRef>(), used = new Set<string>(manual.used);
  const bangumi = episodeIndex(autoRefs.filter(r => r.group.work.source === 'bangumi'));
  const tmdb = episodeIndex(autoRefs.filter(r => r.group.work.source === 'tmdbTv'));
  for (const ref of autoRefs.filter(r => r.group.work.source === 'bangumi')) {
    const matches = preferredMatches(ref,tmdb);
    if (matches.length !== 1) continue;
    const reverse = preferredMatches(matches[0],bangumi,true);
    if (reverse.length !== 1 || reverse[0].key !== ref.key) continue;
    singles.set(ref.key,matches[0]); used.add(matches[0].key);
  }
  const result = all.filter(g => !consumed.has(g.key)).map(group => {
    const other = paired.get(group.key), extra = new Map(other?.rows.map(r => [r.number, r]) || []);
    const rows: MergedEpisode[] = group.rows.filter(row => !used.has(refKey(group,row))).map(row => {
      const key = refKey(group,row), manualPair = manual.pairs.get(key), supplement = extra.get(row.number) || manualPair?.tmdb.row || singles.get(key)?.row;
      extra.delete(row.number);
      const chapterLink = manualPair ? {bangumi:String(manualPair.bangumi.row.id),tmdb:String(manualPair.tmdb.row.id)} : undefined;
      return combine(row,key,group,supplement,chapterLink);
    });
    if (other) for (const row of extra.values()) rows.push({...row, key:`${other.key}:${row.id}`, source:other.work.source, sources:[sourceName(other.work)]});
    rows.sort((a,b) => Number(a.number) - Number(b.number));
    return {key:group.key, label:other?.label || group.label, rows};
  }).filter(group => group.rows.length > 0);
  const hasBoth = all.some(g => g.work.source === 'bangumi') && all.some(g => g.work.source === 'tmdbTv');
  if (hasBoth) {
    const pairedBangumi = new Set(paired.keys());
    const takenBangumi = new Set([...manual.pairs.keys(),...singles.keys()]);
    const availableTmdb = refs.filter(ref => ref.group.work.source === 'tmdbTv' && !consumed.has(ref.group.key) && !used.has(ref.key));
    const availableBangumi = refs.filter(ref => ref.group.work.source === 'bangumi' && !used.has(ref.key) &&
      !takenBangumi.has(ref.key) && !pairedBangumi.has(ref.group.key));
    const tmdbCandidates = candidatesFor(availableTmdb), bangumiCandidates = candidatesFor(availableBangumi);
    for (const group of result) for (const row of group.rows) {
      if (row.sources.length !== 1 || (row.source !== 'bangumi' && row.source !== 'tmdbTv')) continue;
      row.unmatched = true;
      const candidates = row.source === 'bangumi' ? tmdbCandidates : bangumiCandidates;
      if (candidates.length) row.candidates = candidates;
    }
  }
  return result;
}
