import type { VideoMetadata } from './gateway';
import { Select } from '../ui/Select';
import { videoWorks, workKey, sourceCaption } from './sources';
import { assignPart, partsError, partWorks } from './parts';

export function VideoPartsEditor({value,onChange}: {value:VideoMetadata;onChange(value:VideoMetadata):void}) {
  const parts = value.parts || [], works = videoWorks(value), error = partsError(value);
  const setParts = (next: VideoMetadata['parts']) => onChange({ ...value, parts: next });
  return <section className="video-parts-editor">
    <div className="video-section-heading video-parts-heading">
      <div className="video-parts-intro">
        <h3>分编卡片</h3>
        <p className="form-note">一份实体、两张作品卡片，购入信息共用。更改在保存版本后生效。</p>
      </div>
      <div className="video-heading-actions">
        {!!parts.length && <button type="button" className="text-button" onClick={() => setParts([...parts].reverse())}>交换前后顺序</button>}
        {parts.length
          ? <button type="button" className="text-button" onClick={() => setParts([])}>取消分编</button>
          : <button type="button" className="text-button" disabled={works.length < 2} onClick={() => setParts([
              { id: crypto.randomUUID(), label: '前编', sourceKeys: works.map(workKey), coverSourceKey: workKey(works[0]) },
              { id: crypto.randomUUID(), label: '后编', sourceKeys: [], coverSourceKey: '' },
            ])}>设置前后编</button>}
      </div>
    </div>
    {!!parts.length && <>
      <div className="video-parts-grid">
        {parts.map((part, index) => <article className="video-part-editor" key={part.id}>
          <header className="video-part-editor-heading">
            <span>{index === 0 ? '第一张卡片' : '第二张卡片'}</span>
            <strong>{part.label || (index === 0 ? '前编' : '后编')}</strong>
          </header>
          <label>卡片名称<input value={part.label} maxLength={60} onChange={e => setParts(parts.map(p => p.id === part.id ? { ...p, label: e.target.value } : p))}/></label>
          <label>封面来源<Select label={`${part.label}封面来源`} value={part.coverSourceKey}
            options={[{ id: '', label: '请选择封面作品' }, ...partWorks(value, part).map(work => ({ id: workKey(work), label: sourceCaption(work, works) }))]}
            onChange={coverSourceKey => setParts(parts.map(p => p.id === part.id ? { ...p, coverSourceKey } : p))}/></label>
        </article>)}
      </div>
      <div className="video-part-assignments">
        <div className="video-part-assignments-heading">
          <strong>作品归属</strong>
          <span>为每部作品指定前编或后编</span>
        </div>
        {works.map(work => <label className="video-part-assignment" key={workKey(work)}>
          <span className="video-part-assignment-text"><strong>{work.originalTitle || work.title}</strong><span>{sourceCaption(work, works)}</span></span>
          <Select label={`${work.title}所属分编`} value={parts.find(part => part.sourceKeys.includes(workKey(work)))?.id || ''}
            options={[{ id: '', label: '请选择所属分编' }, ...parts.map(part => ({ id: part.id, label: part.label }))]}
            onChange={id => onChange(assignPart(value, workKey(work), id))}/>
        </label>)}
      </div>
      {error && <p className="form-note" role="status">{error}</p>}
    </>}
  </section>;
}
