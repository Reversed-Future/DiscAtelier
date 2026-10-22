import type { EditionDraft } from '../library/types';
import { useStaticArtwork } from '../library/useStaticArtwork';
import { portraitCover } from '../library/coverShape';
export function Cover({ edition, assetId }: { edition: EditionDraft; assetId?: string | null }) {
  const artwork = useStaticArtwork('cover', assetId);
  if (artwork.url) return <div className="cover-art" data-portrait={portraitCover(edition)}><img src={artwork.url} alt={`${edition.title} 封面`} draggable={false}/></div>;
  if (artwork.loading) return <div className="cover-art artwork-pending" aria-hidden="true"/>;
  return <div className="cover-art empty-cover" data-portrait={portraitCover(edition)}>
    <span>{edition.media.map(medium => medium.carrierId.toUpperCase()).join(' · ')}</span>
    <strong>{edition.title}</strong>
    <small>{edition.creator || edition.editionLabel}</small>
  </div>;
}
