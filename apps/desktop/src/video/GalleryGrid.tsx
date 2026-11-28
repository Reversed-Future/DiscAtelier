import { useState } from 'react';
import type { GalleryPicture } from './mergedPresentation';
import { VideoPicture, VideoPictureViewer } from './VideoPicture';
import { setContextActions } from '../ui/contextActions';
import { errorMessage } from '../library/gateway';

export function GalleryGrid({ pictures, onSetCover }: { pictures: GalleryPicture[]; onSetCover?(picture: GalleryPicture): Promise<void> }) {
  const [viewing, setViewing] = useState<GalleryPicture | null>(null);
  const [error, setError] = useState('');
  return <>
    <div className="video-gallery-grid unified-gallery">{pictures.map(picture =>
      <button className={picture.kind === 'poster' ? 'poster' : 'still'} type="button" key={picture.key} data-gallery-key={picture.key}
        onClick={() => setViewing(picture)} aria-label={`查看${picture.label}`}
        onContextMenu={event => setContextActions(event, [
          {label: '查看大图', run: () => setViewing(picture)},
          ...(onSetCover ? [{label: '设为封面', run: async () => {
            setError('');
            try { await onSetCover(picture); } catch (cause) { setError(errorMessage(cause)); }
          }}] : []),
        ])}>
        <VideoPicture key={picture.previewUrl} src={picture.previewUrl} alt={picture.label}/>
        <small>{picture.sources.join(' · ')} · {picture.label}</small>
      </button>)}</div>
    {!pictures.length && <p className="utility-copy">暂无图片。</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {viewing && <VideoPictureViewer url={viewing.url} title={`${viewing.sources.join(' · ')} · ${viewing.label}`} onClose={() => setViewing(null)}/>}
  </>;
}
