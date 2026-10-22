import type { VideoMetadata } from './gateway';
import { Select } from '../ui/Select';
import { videoWorks, workKey, sourceCaption } from './sources';
import { assignPart, partsError, partWorks } from './parts';

export function VideoPartsEditor({value,onChange}: {value:VideoMetadata;onChange(value:VideoMetadata):void}) {
  const parts = value.parts || [], works = videoWorks(value), error = partsError(value);
  return <section className="video-parts-editor">
    <div className="video-section-heading"><h3>分编卡片</h3>{parts.length ? <button type="button" className="text-button" onClick={() => onChange({...value,parts:[]})}>取消分编</button> : <button type="button" className="text-button" disabled={works.length < 2} onClick={() => onChange({...value,parts:[{id:crypto.randomUUID(),label:'前编',sourceKeys:works.map(workKey),coverSourceKey:workKey(works[0])},{id:crypto.randomUUID(),label:'后编',sourceKeys:[],coverSourceKey:''}]})}>设置前后编</button>}</div>
    <p className="form-note">一份实体、两张作品卡片，购入信息共用。更改在保存版本后生效。</p>
    {!!parts.length && <>
      <div className="form-row">{parts.map((part,index) => <div key={part.id} className="video-part-editor">
        <label>{index === 0 ? '第一张卡片' : '第二张卡片'}<input value={part.label} maxLength={60} onChange={e => onChange({...value,parts:parts.map(p => p.id === part.id ? {...p,label:e.target.value} : p)})}/></label>
        <label>封面来源<Select label={`${part.label}封面来源`} value={part.coverSourceKey} options={[{id:'',label:'请选择'},...partWorks(value,part).map(w => ({id:workKey(w),label:sourceCaption(w,works)}))]} onChange={coverSourceKey => onChange({...value,parts:parts.map(p => p.id === part.id ? {...p,coverSourceKey} : p)})}/></label>
      </div>)}</div>
      <button type="button" className="text-button" onClick={() => onChange({...value,parts:[...parts].reverse()})}>交换前后顺序</button>
      {works.map(work => <label className="video-part-assignment" key={workKey(work)}>{work.originalTitle || work.title} · {sourceCaption(work,works)}<Select label={`${work.title}所属分编`} value={parts.find(p => p.sourceKeys.includes(workKey(work)))?.id || ''} options={[{id:'',label:'请选择所属分编'},...parts.map(p => ({id:p.id,label:p.label}))]} onChange={id => onChange(assignPart(value,workKey(work),id))}/></label>)}
      {error && <p className="form-note" role="status">{error}</p>}
    </>}
  </section>;
}
