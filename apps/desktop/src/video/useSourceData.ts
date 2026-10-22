import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../library/gateway';
import { video, type VideoWork } from './gateway';
import { workKey, workSourceName } from './sources';

export type SourceDataKind = 'chapters' | 'images' | 'characters';
const supported = (work: VideoWork, kind: SourceDataKind) => kind === 'characters' ? work.source === 'bangumi' : kind === 'images' ? work.source !== 'bangumi' : work.source !== 'tmdbMovie';
function missing(work: VideoWork, kind: SourceDataKind) {
  return work[kind] == null;
}
// Fetches remain drafts; a failed source retains its saved snapshot and reports its own error.
export function useSourceData(works: VideoWork[], kind: SourceDataKind, enabled: boolean) {
  const [drafts, setDrafts] = useState<Map<string, VideoWork>>(new Map());
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const live = useRef(true), pending = useRef(false), attempted = useRef(false);
  useEffect(() => {live.current = true; return () => {live.current = false;};}, []);
  async function load(onlyMissing = false) {
    if (pending.current) return;
    const targets = works.filter(work => supported(work, kind) && (!onlyMissing || missing(work, kind)));
    if (!targets.length) return;
    pending.current = true; setBusy(true); setError('');
    const results = await Promise.allSettled(targets.map(async work => {
      if (kind === 'chapters') return {...work, chapters: await video.chapters(work)};
      if (kind === 'images') return {...work, images: await video.images(work)};
      return {...work, characters: (await video.work(work.source, work.externalId)).characters || []};
    }));
    if (live.current) {
      setDrafts(previous => {const next = new Map(previous); for (const result of results) if (result.status === 'fulfilled') next.set(workKey(result.value), result.value); return next;});
      setError(results.flatMap((result,index) => result.status === 'rejected' ? [`${workSourceName(targets[index])}：${errorMessage(result.reason)}`] : []).join('\n'));
      setBusy(false);
    }
    pending.current = false;
  }
  const identity = works.map(workKey).join('|');
  useEffect(() => {if (enabled && works.length && !attempted.current) {attempted.current = true; void load(true);}}, [enabled, identity]);
  return {works:works.map(work => drafts.get(workKey(work)) || work), drafts:[...drafts.values()], busy, error,
    refresh:() => load(), reset:() => setDrafts(new Map()), supported:works.some(work => supported(work, kind))};
}
