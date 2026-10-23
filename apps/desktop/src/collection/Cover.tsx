import { useEffect, useRef, useState } from 'react';
import type { EditionDraft } from '../library/types';
import { useStaticArtwork } from '../library/useStaticArtwork';
import { peekStaticArtwork } from '../library/static-artwork-cache';
import { portraitCover } from '../library/coverShape';
export function Cover({ edition, assetId, preloadedUrl }: { edition: EditionDraft; assetId?: string | null; preloadedUrl?: string }) {
  const artwork = useStaticArtwork('cover', assetId);
  const source = artwork.url || preloadedUrl || '';
  const cached = assetId ? peekStaticArtwork('cover', assetId) : undefined;
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth > 0) setLoadedUrl(source);
  }, [source]);
  // The detail view renders a second Cover into the shared artwork portal.
  // If the shelf already decoded this asset, show it immediately instead of
  // replaying the loading scan/fade when the same image is mounted again.
  const loaded = !!source && (loadedUrl === source || cached?.url === source || preloadedUrl === source);
  if (source && failedUrl !== source) return <div className="cover-art" data-portrait={portraitCover(edition)} data-loaded={loaded}>
    <img ref={image} src={source} alt={`${edition.title} 封面`} draggable={false}
      onLoad={() => setLoadedUrl(source)} onError={() => setFailedUrl(source)}/>
  </div>;
  if (artwork.loading) return <div className="cover-art artwork-pending" aria-hidden="true"/>;
  return <div className="cover-art empty-cover" data-portrait={portraitCover(edition)}>
    <span>{edition.media.map(medium => medium.carrierId.toUpperCase()).join(' · ')}</span>
    <strong>{edition.title}</strong>
    <small>{edition.creator || edition.editionLabel}</small>
  </div>;
}
