import { useEffect, useState } from 'react';
import type { LibraryCopy } from '../library/types';
import { Cover } from '../collection/Cover';
import { posterUrl, type VideoMetadata, type VideoPart } from './gateway';
import { partWorks } from './parts';
import { workKey } from './sources';

function PartImage({item,metadata,part}: {item:LibraryCopy;metadata:VideoMetadata;part:VideoPart}) {
  const works = partWorks(metadata,part), work = works.find(w => workKey(w) === part.coverSourceKey);
  const url = work ? posterUrl(work) : '', [failed,setFailed] = useState(''), [loaded,setLoaded] = useState('');
  return <><Cover edition={item.edition} assetId={item.coverAssetId}/>{url && failed !== url && <img className="video-part-poster" style={{opacity:loaded === url ? 1 : 0}} src={url} alt={`${part.label} · ${work?.originalTitle || work?.title}`} draggable={false} referrerPolicy="no-referrer" onLoad={() => setLoaded(url)} onError={() => setFailed(url)}/>}</>;
}
export function VideoPartCards({item,metadata,activeId,instant=false}: {item:LibraryCopy;metadata:VideoMetadata;activeId?:string;instant?:boolean}) {
  const parts = metadata.parts || [], active = parts.find(p => p.id === activeId) || parts[0];
  const [front,setFront] = useState(active?.id), [spread,setSpread] = useState(false);
  useEffect(() => {
    if (front === active?.id) {setSpread(false);return;}
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) {setFront(active?.id);setSpread(false);return;}
    setSpread(true);
    const timer = setTimeout(() => {setFront(active?.id);setSpread(false);},130);
    return () => clearTimeout(timer);
  },[active?.id,front,instant]);
  return <div className="video-part-cards" data-instant={instant} data-spread={spread}>
    {parts.map(part => <div className="video-part-card" data-front={part.id === front} key={part.id} aria-hidden={part.id !== active?.id}><PartImage item={item} metadata={metadata} part={part}/></div>)}
  </div>;
}
