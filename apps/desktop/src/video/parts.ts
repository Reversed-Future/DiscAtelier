import type { VideoMetadata, VideoPart } from './gateway';
import { videoWorks, workKey } from './sources.ts';

// Group membership is explicit; matching provider names or titles never creates a part.
export function partWorks(value: VideoMetadata, part?: VideoPart) {
  const works = videoWorks(value);
  return part ? works.filter(w => part.sourceKeys.includes(workKey(w))) : works;
}
export function partView(value: VideoMetadata | null, part?: VideoPart): VideoMetadata | null {
  if (!value || !part) return value;
  const [work, ...additionalWorks] = partWorks(value, part);
  return {...value, work: work || null, additionalWorks, parts: []};
}
export function partsError(value: VideoMetadata): string {
  if (!value.parts?.length) return '';
  if (value.parts.length !== 2) return '请设置前后两编。';
  const keys = videoWorks(value).map(workKey), seen = new Set<string>();
  for (const part of value.parts) {
    if (!part.label.trim()) return '请填写分编名称。';
    if (!part.sourceKeys.length) return `请为「${part.label}」关联至少一份作品资料。`;
    if (!part.sourceKeys.includes(part.coverSourceKey)) return `请选择「${part.label}」的封面来源。`;
    for (const key of part.sourceKeys) {
      if (!keys.includes(key) || seen.has(key)) return '每份作品资料只能属于一个分编。';
      seen.add(key);
    }
  }
  return seen.size === keys.length ? '' : '请将所有作品资料分配到前编或后编。';
}
export function assignPart(value: VideoMetadata, key: string, id: string): VideoMetadata {
  return {...value, parts: value.parts?.map(part => {
    const sourceKeys = part.sourceKeys.filter(k => k !== key);
    if (part.id === id) sourceKeys.push(key);
    return {...part, sourceKeys, coverSourceKey: sourceKeys.includes(part.coverSourceKey) ? part.coverSourceKey : sourceKeys[0] || ''};
  })};
}
