import { useState } from 'react';
import type { MergedEpisodeGroup } from './mergedEpisodes';
import { VideoPicture, VideoPictureViewer } from './VideoPicture';

export function EpisodeList({groups}: {groups: MergedEpisodeGroup[]}) {
  const [picture, setPicture] = useState<{url:string;title:string}|null>(null);
  return <><div className="video-chapter-scroll">{groups.map(group => <section key={group.key}>
    {groups.length > 1 && <h4 className="video-episode-group">{group.label}</h4>}
    <ol className="video-chapter-list">{group.rows.map(row => <li key={row.key}>
      <span>{row.number}</span><div className="video-episode-copy"><strong>{row.originalTitle || row.title || `第 ${row.number} 集`}</strong>
        {row.title && row.title !== row.originalTitle && <small>{row.title}</small>}
        <small>{[row.airDate, row.duration, row.sources.join(' · ')].filter(Boolean).join(' · ')}</small>
        {(row.summary || row.imageUrl) && <div className="video-episode-details">
          {row.imageUrl && <button type="button" aria-label={`查看第 ${row.number} 集图片`} onClick={() => setPicture({url:row.imageUrl!, title:row.originalTitle || row.title})}><VideoPicture src={row.imageUrl} alt={row.originalTitle || row.title}/></button>}
          {row.summary && <p>{row.summary}</p>}
        </div>}
      </div>
    </li>)}</ol>
  </section>)}</div>{picture && <VideoPictureViewer {...picture} onClose={() => setPicture(null)}/>}</>;
}
