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
export function partIssue(value: VideoMetadata): { message: string; selector: string } | null {
  if (!value.parts?.length) return null;
  const assignments = '.video-part-assignment button[role=combobox]';
  if (value.parts.length !== 2) return { message: '请设置前后两编。', selector: '.video-parts-heading .video-heading-actions button:last-child' };
  const keys = videoWorks(value).map(workKey), seen = new Set<string>();
  for (const [index, part] of value.parts.entries()) {
    const card = `.video-part-editor:nth-child(${index + 1})`;
    if (!part.label.trim()) return { message: '请填写分编名称。', selector: card + ' input' };
    if (!part.sourceKeys.length) return { message: `请为「${part.label}」关联至少一份作品资料。`, selector: assignments };
    if (!part.sourceKeys.includes(part.coverSourceKey)) return { message: `请选择「${part.label}」的封面来源。`, selector: card + ' button[role=combobox]' };
    for (const key of part.sourceKeys) {
      if (!keys.includes(key) || seen.has(key)) return { message: '每份作品资料只能属于一个分编。', selector: assignments };
      seen.add(key);
    }
  }
  const missing = keys.findIndex(key => !seen.has(key));
  return missing < 0 ? null : { message: '请将所有作品资料分配到前编或后编。', selector: `.video-part-assignment:nth-of-type(${missing + 1}) button` };
}
export function partsError(value: VideoMetadata): string {
  return partIssue(value)?.message || '';
}
export function assignPart(value: VideoMetadata, key: string, id: string): VideoMetadata {
  return {...value, parts: value.parts?.map(part => {
    const sourceKeys = part.sourceKeys.filter(k => k !== key);
    if (part.id === id) sourceKeys.push(key);
    return {...part, sourceKeys, coverSourceKey: sourceKeys.includes(part.coverSourceKey) ? part.coverSourceKey : sourceKeys[0] || ''};
  })};
}
