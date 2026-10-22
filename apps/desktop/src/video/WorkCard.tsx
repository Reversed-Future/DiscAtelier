import { workTitles } from './titles';
import { VideoIntroduction } from './VideoIntroduction';
import { VideoCharacters } from './VideoCharacters';
import { WorkFacts } from './WorkFacts';
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { posterUrl, sourceLabel, workLink, type VideoWork } from './gateway';
export function WorkCard({ work, compact = false, showPoster = true, showTitle = true, showSummary = true }: { work: VideoWork; compact?: boolean; showPoster?: boolean; showTitle?: boolean; showSummary?: boolean }) {
  const [error, setError] = useState('');
  const titles = workTitles(work);
  const poster = showPoster ? posterUrl(work) : '';
  return <section className={`video-work${compact ? ' compact' : ''}`}>
    {poster && <img src={poster} alt={`${work.title}作品海报`} loading="lazy" referrerPolicy="no-referrer"/>}
    <div>{showTitle && <><h4>{titles.title}</h4>{titles.subtitle && <p className="muted">{titles.subtitle}</p>}</>}
      {!compact && showSummary && <VideoIntroduction work={work}/>}
      {(compact || !work.facts?.length) && <p className="muted">{work.premiereDate ? `首映 / 首播：${work.premiereDate}` : ''}{work.episodeCount ? ` · 作品共 ${work.episodeCount} 集` : ''}</p>}
      {!compact && <><WorkFacts facts={(work.facts || []).filter(fact => fact.label !== '中文名')}/>{work.genres.length > 0 && <p className="muted">{work.genres.join(' · ')}</p>}
      </>}
      {!compact && showPoster && work.source === 'bangumi' && !!work.characters?.length && <details><summary>角色 · {work.characters.length}</summary><VideoCharacters work={work}/></details>}
      <button type="button" className="text-button video-source" onClick={() => void invoke('video_open_source', { url: workLink(work) }).catch(() => setError('无法打开来源网页。'))}>{sourceLabel(work.source)} ↗</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </section>;
}
