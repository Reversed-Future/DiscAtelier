import { useState } from 'react';
import type { MergedEpisodeGroup } from './mergedEpisodes';
import { VideoPicture, VideoPictureViewer } from './VideoPicture';
import type { TrackPlayback } from '../metadata/TrackRow';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { copyAction, setContextActions } from '../ui/contextActions';

export function EpisodeList({groups, localPlayback}: {groups: MergedEpisodeGroup[]; localPlayback?(number: string): TrackPlayback | undefined}) {
  const [picture, setPicture] = useState<{url:string;title:string}|null>(null);
  const [synopsis, setSynopsis] = useState<{title:string;text:string}|null>(null);
  return <><div className="video-chapter-scroll">{groups.map(group => <section key={group.key}>
    {groups.length > 1 && !!group.label.trim() && <h4 className="video-episode-group">{group.label}</h4>}
    <ol className="video-chapter-list">{group.rows.map(row => {
      const action = localPlayback?.(row.number);
      const title = row.originalTitle || row.title || `第 ${row.number} 集`;
      const {summary, imageUrl} = row;
      return <li key={row.key} onContextMenu={event => setContextActions(event, [
        ...(action && !action.busy ? [{label: action.playing ? '播放 / 暂停' : '播放本地文件', run: action.play}] : []),
        ...(summary ? [{label: '查看本集简介', run: () => setSynopsis({title, text: summary})}] : []),
        ...(imageUrl ? [{label: '查看剧照', run: () => setPicture({url: imageUrl, title})}] : []),
        copyAction('复制分集标题', title),
      ])}>
      <span>{row.number}</span><div className="video-episode-copy">
        <div className="video-episode-title"><strong>{title}</strong>
          {action && <button type="button" className="video-chapter-play" disabled={action.busy} aria-label={`播放本地文件 第 ${row.number} 集`} title="播放本地文件" aria-current={action.playing ? 'true' : undefined} onClick={action.play}><Icon name="play"/></button>}
        </div>
        {row.title && row.title !== row.originalTitle && <small>{row.title}</small>}
        <small>{[row.airDate, row.duration, row.sources.join(' · ')].filter(Boolean).join(' · ')}</small>
        {(row.summary || row.imageUrl) && <div className="video-episode-details">
          {row.imageUrl && <button type="button" aria-label={`查看第 ${row.number} 集图片`} onClick={() => setPicture({url:row.imageUrl!, title:row.originalTitle || row.title})}><VideoPicture src={row.imageUrl} alt={row.originalTitle || row.title}/></button>}
          {row.summary && <p>{row.summary}</p>}
        </div>}
      </div>
    </li>; })}</ol>
  </section>)}</div>{picture && <VideoPictureViewer {...picture} onClose={() => setPicture(null)}/>}
    {synopsis && <Modal title={synopsis.title} onClose={() => setSynopsis(null)} wide><div className="video-episode-details"><p>{synopsis.text}</p></div></Modal>}</>;
}
