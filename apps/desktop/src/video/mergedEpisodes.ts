import type { VideoChapter, VideoWork } from './gateway';

export interface MergedEpisode extends VideoChapter { key: string; sources: string[] }
interface EpisodeGroup { key: string; label: string; work: VideoWork; rows: VideoChapter[] }
export interface MergedEpisodeGroup { key: string; label: string; rows: MergedEpisode[] }
const sourceName = (work: VideoWork) => work.source === 'bangumi' ? 'Bangumi' : 'TMDB';
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
function combine(row:VideoChapter, key:string, source:string, supplement?:VideoChapter):MergedEpisode {
  return {...row,key,sources:supplement ? ['Bangumi','TMDB'] : [source],
    title:row.title || supplement?.title || '',originalTitle:row.originalTitle || supplement?.originalTitle || '',
    airDate:row.airDate || supplement?.airDate || '',duration:row.duration || supplement?.duration || '',
    summary:supplement?.summary || row.summary,imageUrl:supplement?.imageUrl || row.imageUrl};
}
export function mergeEpisodes(works: VideoWork[]): MergedEpisodeGroup[] {
  const all = groups(works), paired = new Map<string, EpisodeGroup>(), consumed = new Set<string>();
  for (const group of all.filter(g => g.work.source === 'bangumi')) {
    const matches = all.filter(other => corresponds(group, other));
    if (matches.length !== 1 || all.filter(other => corresponds(other, matches[0])).length !== 1) continue;
    paired.set(group.key, matches[0]); consumed.add(matches[0].key);
  }
  const refs:EpisodeRef[] = all.filter(g => !paired.has(g.key) && !consumed.has(g.key))
    .flatMap(group => group.rows.map(row => ({key:`${group.key}:${row.id}`,group,row})));
  const singles = new Map<string,EpisodeRef>(), used = new Set<string>();
  const bangumi = episodeIndex(refs.filter(r => r.group.work.source === 'bangumi'));
  const tmdb = episodeIndex(refs.filter(r => r.group.work.source === 'tmdbTv'));
  for (const ref of refs.filter(r => r.group.work.source === 'bangumi')) {
    const matches = preferredMatches(ref,tmdb);
    if (matches.length !== 1) continue;
    const reverse = preferredMatches(matches[0],bangumi,true);
    if (reverse.length !== 1 || reverse[0].key !== ref.key) continue;
    singles.set(ref.key,matches[0]); used.add(matches[0].key);
  }
  return all.filter(g => !consumed.has(g.key)).map(group => {
    const other = paired.get(group.key), extra = new Map(other?.rows.map(r => [r.number, r]) || []);
    const rows: MergedEpisode[] = group.rows.filter(row => !used.has(`${group.key}:${row.id}`)).map(row => {
      const key = `${group.key}:${row.id}`, supplement = extra.get(row.number) || singles.get(key)?.row; extra.delete(row.number);
      return combine(row,key,sourceName(group.work),supplement);
    });
    if (other) for (const row of extra.values()) rows.push({...row, key:`${other.key}:${row.id}`, sources:[sourceName(other.work)]});
    rows.sort((a,b) => Number(a.number) - Number(b.number));
    return {key:group.key, label:other?.label || group.label, rows};
  }).filter(group => group.rows.length > 0);
}
