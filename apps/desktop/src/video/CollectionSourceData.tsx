import { useState, type ReactNode } from 'react';
import type { LibraryCopy } from '../library/types';
import { errorMessage } from '../library/gateway';
import { video, type VideoMetadata, type VideoWork } from './gateway';
import { putVideoWork, videoWorks, workKey } from './sources';
import { useSourceData, type SourceDataKind } from './useSourceData';

export function CollectionSourceData({item, metadata, kind, enabled = true, onSaved, onBusy, children, sourceKeys}: {
  sourceKeys?:string[]; item:LibraryCopy; metadata:VideoMetadata; kind:SourceDataKind; enabled?:boolean;
  onSaved():Promise<void>; onBusy(value:boolean):void; children(works:VideoWork[]):ReactNode;
}) {
  const data = useSourceData(videoWorks(metadata).filter(w => !sourceKeys || sourceKeys.includes(workKey(w))),kind,enabled), [saving,setSaving] = useState(false), [error,setError] = useState('');
  const label = {chapters:'章节', images:'图库', characters:'角色资料'}[kind];
  async function save() {
    if (saving || data.busy || !data.drafts.length) return;
    setSaving(true); setError(''); onBusy(true);
    try {
      const next = data.drafts.reduce(putVideoWork,metadata);
      await video.update({requestId:crypto.randomUUID(),editionId:item.editionId,expectedRevision:item.editionRevision,edition:item.edition,cover:{action:'keep'},model:{action:'keep'}},next);
      await onSaved(); data.reset();
    } catch (cause) {setError(errorMessage(cause));}
    finally {setSaving(false); onBusy(false);}
  }
  return <section className={`video-source-data ${kind === 'chapters' ? 'video-chapters' : ''}`} aria-busy={data.busy || saving}>
    <div className="video-section-heading">
      <span className="setting-hint">{data.drafts.length ? `${label}预览 · 尚未保存` : label}</span>
      <div className="video-heading-actions">
        {!!data.drafts.length && !saving && <>
          <button type="button" className="text-button" disabled={data.busy} onClick={() => void save()}>{`确认保存这些${label}`}</button>
          <button type="button" className="text-button" disabled={data.busy} onClick={data.reset}>取消</button>
        </>}
        {saving && <span className="setting-hint">保存中…</span>}
        {data.supported && <button type="button" className="text-button" disabled={data.busy || saving} onClick={() => void data.refresh()}>{data.busy ? '读取中…' : `刷新${label}`}</button>}
      </div>
    </div>
    {children(data.works)}
    {(data.error || error) && <p className="form-error" role="alert">{data.error || error}</p>}
  </section>;
}
