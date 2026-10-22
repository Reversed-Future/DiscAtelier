import type { VideoWork } from './gateway';
import { sourceCaption, workKey } from './sources';
export function VideoSourceTabs({ works, selected, onChange, disabled = false }: { works: VideoWork[]; selected: string; onChange(key: string): void; disabled?: boolean }) {
  if (works.length < 2) return null;
  return <nav className="disc-tabs video-source-tabs" aria-label="资料来源">{works.map(work => <button type="button" key={workKey(work)} aria-selected={selected === workKey(work)} disabled={disabled} onClick={() => onChange(workKey(work))}>{sourceCaption(work, works)}</button>)}</nav>;
}
