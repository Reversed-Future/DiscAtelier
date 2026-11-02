import { useState } from 'react';
import type { GalleryPicture } from './mergedPresentation';
import { VideoPicture, VideoPictureViewer } from './VideoPicture';
import { ContextMenu } from '../ui/ContextMenu';

export function GalleryGrid({ pictures, onSetCover }: { pictures: GalleryPicture[]; onSetCover?(picture: GalleryPicture): Promise<void> }) {
  const [viewing, setViewing] = useState<GalleryPicture | null>(null);
  const [error, setError] = useState('');
  return <>
    <div className="video-gallery-grid unified-gallery">{pictures.map(picture =>
      <button className={picture.kind === 'poster' ? 'poster' : 'still'} type="button" key={picture.key} data-gallery-key={picture.key}
        onClick={() => setViewing(picture)} aria-label={`查看${picture.label}`}>
        <VideoPicture key={picture.previewUrl} src={picture.previewUrl} alt={picture.label}/>
        <small>{picture.sources.join(' · ')} · {picture.label}</small>
      </button>)}</div>
    {!pictures.length && <p className="utility-copy">暂无图片。</p>}
    {onSetCover && <ContextMenu onError={setError} actions={target => {
      const key = target.closest('[data-gallery-key]')?.getAttribute('data-gallery-key');
      const picture = pictures.find(row => row.key === key);
      return picture ? [{ label: '设为封面', run: () => onSetCover(picture) }] : [];
    }}/>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {viewing && <VideoPictureViewer url={viewing.url} title={`${viewing.sources.join(' · ')} · ${viewing.label}`} onClose={() => setViewing(null)}/>}
  </>;
}
