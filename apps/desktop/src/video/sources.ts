import type { VideoMetadata, VideoWork } from './gateway';

export const workKey = (work: VideoWork) => `${work.source}:${work.externalId}`;
export const videoWorks = (value?: VideoMetadata | null): VideoWork[] => value?.work ? [value.work, ...(value.additionalWorks || [])] : [];
export const workSourceName = (work: VideoWork) => work.source === 'bangumi' ? 'Bangumi' : work.source === 'tmdbTv' ? 'TMDB 剧集' : 'TMDB 电影';
export function sourceCaption(work: VideoWork, works: VideoWork[]) {
  return works.filter(w => w.source === work.source).length > 1 ? `${workSourceName(work)} · ${work.originalTitle || work.title}` : workSourceName(work);
}
// The source and numeric ID form the identity. Matching titles never replaces a source.
export function putVideoWork(value: VideoMetadata, work: VideoWork): VideoMetadata {
  if (!value.work) return {...value, work};
  if (workKey(value.work) === workKey(work)) return {...value, work};
  const others = value.additionalWorks || [];
  if (others.some(w => workKey(w) === workKey(work))) return {...value, additionalWorks: others.map(w => workKey(w) === workKey(work) ? work : w)};
  if (videoWorks(value).length >= 8) throw new Error('每份收藏最多关联 8 份作品资料。');
  return {...value, additionalWorks: [...others, work]};
}
export function removeVideoWork(value: VideoMetadata, key: string): VideoMetadata {
  const [work, ...additionalWorks] = videoWorks(value).filter(w => workKey(w) !== key);
  return {...value, work: work || null, additionalWorks, parts: value.parts?.map(part => {
    const sourceKeys = part.sourceKeys.filter(source => source !== key);
    return {...part, sourceKeys, coverSourceKey: sourceKeys.includes(part.coverSourceKey) ? part.coverSourceKey : sourceKeys[0] || ''};
  })};
}
export function primaryVideoWork(value: VideoMetadata, key: string): VideoMetadata {
  const works = videoWorks(value), work = works.find(w => workKey(w) === key);
  return work ? {...value, work, additionalWorks: works.filter(w => workKey(w) !== key)} : value;
}
