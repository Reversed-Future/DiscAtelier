import { statuses } from '../library/types';
import { useStaticArtwork } from '../library/useStaticArtwork';
import type { CollectionCard } from './replyCards';

function ReplyCard({ card }: { card: CollectionCard }) {
  const { url } = useStaticArtwork('cover', card.coverAssetId);
  const status = statuses.find(value => value.id === card.status)?.label;
  return <li className="assistant-collection-card">
    {url && <img src={url} alt={card.title + ' 封面'}/>}
    <div><strong>{card.title}</strong>
      {card.creator && <span>{card.creator}</span>}
      {(card.editionLabel || status) && <small>{[card.editionLabel, status].filter(Boolean).join(' · ')}</small>}
    </div>
  </li>;
}

export function CollectionReplyCards({ cards }: { cards: CollectionCard[] }) {
  return <ul className="assistant-collection-cards" aria-label="回复中引用的收藏">
    {cards.map(card => <ReplyCard key={card.id} card={card}/>)}
  </ul>;
}
