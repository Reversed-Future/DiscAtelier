import { useState } from 'react';
import type { VideoMetadata, VideoWork } from './gateway';
import { putVideoWork, primaryVideoWork, removeVideoWork, videoWorks, workKey } from './sources';
import { WorkPicker } from './WorkPicker';
import { WorkCard } from './WorkCard';
import { VideoIntroduction } from './VideoIntroduction';

export function VideoSourcesEditor({ value, initialQuery, onChange, onFirstWork }: { value: VideoMetadata; initialQuery: string; onChange(value: VideoMetadata): void; onFirstWork(work: VideoWork): void }) {
  const [picker, setPicker] = useState(false);
  const works = videoWorks(value);
  return <>
    <div className="video-section-heading"><h3>作品资料</h3><button type="button" className="text-button" disabled={works.length >= 8} onClick={() => setPicker(true)}>{works.length ? '合并其他来源' : '查找作品 / 粘贴链接'}</button></div>
    {works.length ? <>
      {works.map(work => <div className="video-linked-work" key={workKey(work)}><WorkCard work={work} compact/>
        <div className="video-actions">{workKey(work) === workKey(value.work!) ? <span className="setting-hint">标题来源</span> : <button type="button" className="text-button" onClick={() => onChange(primaryVideoWork(value,workKey(work)))}>用作标题来源</button>}<button type="button" className="text-button" onClick={() => onChange(removeVideoWork(value,workKey(work)))}>取消此来源关联</button></div>
      </div>)}
      <VideoIntroduction works={works}/>
    </> : <p className="form-note">可以只填写实体资料。关联作品资料后，核对并保存。</p>}
    {picker && <WorkPicker initialQuery={initialQuery} existingWorks={works} onClose={() => setPicker(false)} onPick={work => {onChange(putVideoWork(value, work)); if (!value.work) onFirstWork(work); setPicker(false);}}/>}
  </>;
}
