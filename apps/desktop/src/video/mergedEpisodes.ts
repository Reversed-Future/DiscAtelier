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
function corresponds(a: EpisodeGroup, b: EpisodeGroup) {
  if (a.work.source !== 'bangumi' || b.work.source !== 'tmdbTv' ||
      !a.rows.every(r => r.episodeKind === 0) || !b.rows.every(r => r.seasonNumber !== undefined && r.seasonNumber > 0)) return false;
  const left = new Map(a.rows.map(r => [r.number, r])), right = new Map(b.rows.map(r => [r.number, r]));
  if (left.size !== a.rows.length || right.size !== b.rows.length) return false;
  const pairs = [...left].flatMap(([n, row]) => right.has(n) ? [[row, right.get(n)!]] : []);
  if (!pairs.length || pairs.some(([x, y]) => x.airDate && y.airDate && x.airDate !== y.airDate)) return false;
  // Partial sets require a shared exact air date. Complete equal sets allow dates to be absent.
  return pairs.some(([x, y]) => x.airDate && x.airDate === y.airDate) ||
    (left.size === right.size && pairs.length === left.size);
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
  for (const group of all.filter(g => g.work.source === 'bangumi' && !locked.has(g.key))) {
    const matches = all.filter(other => !locked.has(other.key) && corresponds(group, other));
    if (matches.length !== 1 || all.filter(other => !locked.has(other.key) && corresponds(other, matches[0])).length !== 1) continue;
    paired.set(group.key, matches[0]); consumed.add(matches[0].key);
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
