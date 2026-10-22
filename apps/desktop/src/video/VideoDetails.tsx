import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { sourceLabel, workLink, type VideoMetadata } from './gateway';
import { videoWorks, workKey } from './sources';
import { mergedFacts } from './mergedPresentation';
import { WorkFacts } from './WorkFacts';
export function VideoDetails({ value }: { value: VideoMetadata | null }) {
  const [error,setError] = useState('');
  if (!value) return null;
  const p = value.physical, fields = [['地区', p.territory], ['本版发行', p.releaseDate], ['卷号', p.volume], ['本版收录', p.includedContent], ['包装', p.packaging]].filter(([, v]) => v);
  const works = videoWorks(value), facts = mergedFacts(works), genres = [...new Set(works.flatMap(w => w.genres))];
  const dates = [...new Set(works.map(w => w.premiereDate).filter(Boolean))], counts = [...new Set(works.map(w => w.episodeCount).filter(Boolean))];
  // Keep provider facts and derived fields in one metadata grid, including its row gap.
  if (!facts.some(f => f.label === '放送开始') && dates.length) facts.push({label:'首映 / 首播',values:[{text:dates.join(' / '),url:''}]});
  if (!facts.some(f => f.label === '话数') && counts.length) facts.push({label:'话数',values:[{text:counts.join(' / '),url:''}]});
  if (genres.length) facts.push({label:'类型',values:[{text:genres.join(' · '),url:''}]});
  return <section className="video-details">{fields.length > 0 && <dl className="metadata">{fields.map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
    {!!works.length && <><h3>作品资料</h3><WorkFacts facts={facts}/>
      <div className="video-actions">{works.map(work => <button key={workKey(work)} type="button" className="text-button video-source" onClick={() => void invoke('video_open_source',{url:workLink(work)}).catch(() => setError('无法打开来源网页。'))}>{sourceLabel(work.source)} ↗</button>)}</div>
    </>}{error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
