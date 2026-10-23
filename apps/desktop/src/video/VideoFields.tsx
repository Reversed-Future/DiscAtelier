import { VideoPartsEditor } from './VideoPartsEditor';
import { CoverField } from '../forms/CoverField';
import { video } from './gateway';
import { useState } from 'react';
import { DatePicker } from '../ui/DatePicker';
import type { CoverChange, EditionDraft } from '../library/types';
import type { VideoMetadata } from './gateway';
import { VideoSourcesEditor } from './VideoSourcesEditor';
import { videoWorks, workKey, sourceCaption } from './sources';
import { Select } from '../ui/Select';
import { PackagingImages } from './PackagingImages';
export function VideoFields({ value, onChange, edition, onEdition, onCover, cover, assetId, onBusy }: { cover: CoverChange; assetId?: string | null; onBusy(value: boolean): void; value: VideoMetadata; onChange(value: VideoMetadata): void; edition: EditionDraft; onEdition(value: EditionDraft): void; onCover(value: CoverChange): void }) {
  const [pictures, setPictures] = useState(false), [coverSource, setCoverSource] = useState('');
  const works = videoWorks(value), coverWork = works.find(w => workKey(w) === coverSource) || works[0];
  return <><section className="video-draft">
    <VideoSourcesEditor value={value} initialQuery={edition.title} onChange={onChange} onFirstWork={work => { if (!edition.title.trim()) onEdition({...edition, title: work.title}); }}/>
    <button type="button" className="text-button" onClick={() => setPictures(true)}>识别包装</button>
    {!value.parts?.length && <div className="video-cover-choice"><h3>封面</h3>{works.length > 1 && <Select label="封面资料来源" value={workKey(coverWork)} options={works.map(w => ({id: workKey(w), label: sourceCaption(w, works)}))} onChange={setCoverSource}/>}<CoverField edition={edition} assetId={assetId} value={cover} onChange={onCover} onBusy={onBusy} remoteCover={coverWork ? { label: '使用作品封面', load: () => video.cover(coverWork) } : undefined}/></div>}
    <VideoPartsEditor value={value} onChange={onChange}/>
    <h3>实体版本</h3><div className="form-row"><label>地区<input value={value.physical.territory} maxLength={200} onChange={e => onChange({ ...value, physical: { ...value.physical, territory: e.target.value } })}/></label><label>卷号<input placeholder="如：第 1 卷" value={value.physical.volume} maxLength={200} onChange={e => onChange({ ...value, physical: { ...value.physical, volume: e.target.value } })}/></label></div>
    <div className="date-field"><span>本版发行日期</span><DatePicker label="本版发行日期" value={value.physical.releaseDate} onChange={releaseDate => onChange({ ...value, physical: { ...value.physical, releaseDate } })}/></div>
    <label>本版收录内容<textarea rows={2} value={value.physical.includedContent} maxLength={4000} placeholder="如：第 1–2 集、无字幕片头；按包装填写" onChange={e => onChange({ ...value, physical: { ...value.physical, includedContent: e.target.value } })}/></label>
    <label>包装与附属物<textarea rows={2} value={value.physical.packaging} maxLength={2000} placeholder="如：三方背盒、小册子" onChange={e => onChange({ ...value, physical: { ...value.physical, packaging: e.target.value } })}/></label>
  </section> {pictures && <PackagingImages edition={edition} metadata={value} onClose={() => setPictures(false)} onCover={onCover} onApply={(edition, metadata) => { onEdition(edition); onChange(metadata); }}/>}</>;
}
