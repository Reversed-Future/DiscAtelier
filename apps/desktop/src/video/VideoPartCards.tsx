import { useState, type CSSProperties } from 'react';
import type { LibraryCopy } from '../library/types';
import { posterUrl, type VideoMetadata, type VideoPart, type VideoWork } from './gateway';
import { partWorks } from './parts';
import { workKey } from './sources';

function PartFallback({ item, part, work }: { item: LibraryCopy; part: VideoPart; work?: VideoWork }) {
  return <div className="video-part-fallback">
    <span>{part.label}</span>
    <strong>{work?.originalTitle || work?.title || item.edition.title}</strong>
    <small>{work ? '暂无单独封面' : '未关联封面来源'}</small>
  </div>;
}
function PartImage({item,metadata,part}: {item:LibraryCopy;metadata:VideoMetadata;part:VideoPart}) {
  const works = partWorks(metadata,part), work = works.find(w => workKey(w) === part.coverSourceKey) || works[0];
  const url = work ? posterUrl(work) : '', [failed,setFailed] = useState(false), [loaded,setLoaded] = useState(false);
  if (!url || failed) return <PartFallback item={item} part={part} work={work}/>;
  return <>
    {!loaded && <PartFallback item={item} part={part} work={work}/>}
    <img className="video-part-poster" style={{opacity:loaded ? 1 : 0}} src={url} alt={`${part.label} · ${work?.originalTitle || work?.title}`} draggable={false} referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} onError={() => setFailed(true)}/>
  </>;
}
export function VideoPartCards({item,metadata,activeId,instant=false}: {item:LibraryCopy;metadata:VideoMetadata;activeId?:string;instant?:boolean}) {
  const parts = metadata.parts || [], active = parts.find(p => p.id === activeId) || parts[0];
  const front = Math.max(0, parts.findIndex(p => p.id === active?.id));
  return <div className="video-part-cards" data-instant={instant}>
    <div className="video-part-flipper" style={{ '--turn': `${-180 * front}deg` } as CSSProperties}>
      {parts.map((part, index) => <div className="video-part-card" data-side={index === 0 ? 'front' : 'back'} key={part.id} aria-hidden={part.id !== active?.id}><PartImage item={item} metadata={metadata} part={part}/></div>)}
    </div>
  </div>;
}
