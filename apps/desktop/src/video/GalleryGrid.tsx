import { useState } from 'react';
import type { GalleryPicture } from './mergedPresentation';
import { VideoPicture, VideoPictureViewer } from './VideoPicture';

export function GalleryGrid({pictures}: {pictures:GalleryPicture[]}) {
  const [viewing,setViewing] = useState<GalleryPicture|null>(null);
  return <><div className="video-gallery-grid unified-gallery">{pictures.map(picture => <button className={picture.kind === 'poster' ? 'poster' : 'still'} type="button" key={picture.key} onClick={() => setViewing(picture)} aria-label={`查看${picture.label}`}>
    <VideoPicture key={picture.previewUrl} src={picture.previewUrl} alt={picture.label}/><small>{picture.sources.join(' · ')} · {picture.label}</small>
  </button>)}</div>{!pictures.length && <p className="utility-copy">暂无图片。</p>}{viewing && <VideoPictureViewer url={viewing.url} title={`${viewing.sources.join(' · ')} · ${viewing.label}`} onClose={() => setViewing(null)}/>}</>;
}
