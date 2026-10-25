import { useState } from 'react';
import type { MergedEpisodeGroup } from './mergedEpisodes';
import { VideoPicture, VideoPictureViewer } from './VideoPicture';
import type { TrackPlayback } from '../metadata/TrackRow';
import { Icon } from '../ui/Icon';

export function EpisodeList({groups, localPlayback}: {groups: MergedEpisodeGroup[]; localPlayback?(number: string): TrackPlayback | undefined}) {
  const [picture, setPicture] = useState<{url:string;title:string}|null>(null);
  return <><div className="video-chapter-scroll">{groups.map(group => <section key={group.key}>
    {groups.length > 1 && !!group.label.trim() && <h4 className="video-episode-group">{group.label}</h4>}
    <ol className="video-chapter-list">{group.rows.map(row => {
      const action = localPlayback?.(row.number);
      return <li key={row.key}>
      <span>{row.number}</span><div className="video-episode-copy"><strong>{row.originalTitle || row.title || `第 ${row.number} 集`}</strong>
        {row.title && row.title !== row.originalTitle && <small>{row.title}</small>}
        <small>{[row.airDate, row.duration, row.sources.join(' · ')].filter(Boolean).join(' · ')}</small>
        {(row.summary || row.imageUrl) && <div className="video-episode-details">
          {row.imageUrl && <button type="button" aria-label={`查看第 ${row.number} 集图片`} onClick={() => setPicture({url:row.imageUrl!, title:row.originalTitle || row.title})}><VideoPicture src={row.imageUrl} alt={row.originalTitle || row.title}/></button>}
          {row.summary && <p>{row.summary}</p>}
        </div>}
      </div>
      {action && <button type="button" className="video-chapter-play" disabled={action.busy} aria-label={`播放本地文件 第 ${row.number} 集`} title="播放本地文件" aria-current={action.playing ? 'true' : undefined} onClick={action.play}><Icon name="play"/></button>}
    </li>; })}</ol>
  </section>)}</div>{picture && <VideoPictureViewer {...picture} onClose={() => setPicture(null)}/>}</>;
}
