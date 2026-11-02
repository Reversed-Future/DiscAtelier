import { useState } from 'react';
import type { VideoMetadata, VideoWork } from './gateway';
import { putVideoWork, primaryVideoWork, removeVideoWork, videoWorks, workKey } from './sources';
import { WorkPicker } from './WorkPicker';
import { LocalWorkDialog } from './LocalWorkDialog';
import { WorkCard } from './WorkCard';
import { VideoIntroduction } from './VideoIntroduction';

export function VideoSourcesEditor({ value, initialQuery, onChange, onFirstWork }: { value: VideoMetadata; initialQuery: string; onChange(value: VideoMetadata): void; onFirstWork(work: VideoWork): void }) {
  const [picker, setPicker] = useState(false), [local, setLocal] = useState(false);
  const works = videoWorks(value);
  return <>
    <div className="video-section-heading"><h3>关联来源</h3>
      <div className="video-heading-actions">
        <button type="button" className="text-button" disabled={works.length >= 8} onClick={() => setPicker(true)}>搜索 Bangumi / TMDB</button>
        <button type="button" className="text-button" disabled={works.length >= 8} onClick={() => setLocal(true)}>本地新建</button>
      </div>
    </div>
    {works.length ? <>
      {works.map(work => <div className="video-linked-work" key={workKey(work)}><WorkCard work={work} compact/>
        <div className="video-actions">{workKey(work) === workKey(value.work!) ? <span className="setting-hint">标题来源</span> : <button type="button" className="text-button" onClick={() => onChange(primaryVideoWork(value,workKey(work)))}>用作标题来源</button>}<button type="button" className="text-button" onClick={() => onChange(removeVideoWork(value,workKey(work)))}>取消此来源关联</button></div>
      </div>)}
      <VideoIntroduction works={works}/>
    </> : <p className="form-note">可以只填写实体资料。关联作品资料后，核对并保存。</p>}
    {picker && <WorkPicker initialQuery={initialQuery} existingWorks={works} onClose={() => setPicker(false)} onPick={work => {onChange(putVideoWork(value, work)); if (!value.work) onFirstWork(work); setPicker(false);}}/>}
    {local && <LocalWorkDialog onClose={() => setLocal(false)} onAdd={work => {onChange(putVideoWork(value, work)); if (!value.work) onFirstWork(work); setLocal(false);}}/>}
  </>;
}
