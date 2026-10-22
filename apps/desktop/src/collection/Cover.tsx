import { useEffect, useRef, useState } from 'react';
import type { EditionDraft } from '../library/types';
import { useStaticArtwork } from '../library/useStaticArtwork';
import { portraitCover } from '../library/coverShape';
export function Cover({ edition, assetId }: { edition: EditionDraft; assetId?: string | null }) {
  const artwork = useStaticArtwork('cover', assetId);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth > 0) setLoadedUrl(artwork.url);
  }, [artwork.url]);
  const loaded = !!artwork.url && loadedUrl === artwork.url;
  if (artwork.url && failedUrl !== artwork.url) return <div className="cover-art" data-portrait={portraitCover(edition)} data-loaded={loaded}>
    <img ref={image} src={artwork.url} alt={`${edition.title} 封面`} draggable={false}
      onLoad={() => setLoadedUrl(artwork.url)} onError={() => setFailedUrl(artwork.url)}/>
  </div>;
  if (artwork.loading) return <div className="cover-art artwork-pending" aria-hidden="true"/>;
  return <div className="cover-art empty-cover" data-portrait={portraitCover(edition)}>
    <span>{edition.media.map(medium => medium.carrierId.toUpperCase()).join(' · ')}</span>
    <strong>{edition.title}</strong>
    <small>{edition.creator || edition.editionLabel}</small>
  </div>;
}
