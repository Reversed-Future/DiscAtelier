import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { VideoPicture } from '../video/VideoPicture';
import type { PlayerEpisode } from './episodeGallery';

export function PlayerEpisodes({ items, currentIndex, loading, onSelect, onClose }: {
  items: PlayerEpisode[];
  currentIndex: number;
  loading: boolean;
  onSelect(index: number): void;
  onClose(): void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const [edges, setEdges] = useState({ left: false, right: false });

  function updateEdges() {
    const element = scroller.current;
    if (!element) return;
    setEdges({
      left: element.scrollLeft > 2,
      right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2,
    });
  }

  function center(index: number, smooth: boolean) {
    const element = scroller.current, card = cards.current[index];
    if (!element || !card) return;
    element.scrollTo({
      left: Math.max(0, card.offsetLeft - (element.clientWidth - card.offsetWidth) / 2),
      behavior: smooth ? 'smooth' : 'auto',
    });
  }

  useEffect(() => {
    updateEdges();
    if (!items.length) return;
    center(Math.max(0, currentIndex), true);
  }, [currentIndex, items.length]);

  useEffect(() => {
    const card = cards.current[Math.max(0, currentIndex)];
    if (card) card.focus({ preventScroll: true });
    updateEdges();
  }, []);

  function step(direction: number) {
    const element = scroller.current, card = cards.current[Math.max(0, currentIndex)];
    const width = (card?.offsetWidth || 180) + 12;
    element?.scrollBy({ left: direction * width, behavior: 'smooth' });
  }

  function moveFocus(direction: number) {
    const active = cards.current.indexOf(document.activeElement as HTMLButtonElement);
    const start = active >= 0 ? active : Math.max(0, currentIndex);
    const next = Math.max(0, Math.min(items.length - 1, start + direction));
    const card = cards.current[next];
    if (!card) return;
    card.focus();
    card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  return <section className="player-episodes" aria-label="选集" aria-busy={loading}>
    <header className="player-episodes-header">
      <strong>选集</strong>
      <span>{items.length} 集{currentIndex >= 0 ? ` · 当前第 ${items[currentIndex]?.number ?? currentIndex + 1} 集` : ''}</span>
      <button type="button" className="player-icon-button" aria-label="关闭选集" title="关闭选集" onClick={onClose}><Icon name="close"/></button>
    </header>
    <div className="player-episodes-body">
      <button type="button" className="player-episodes-arrow" aria-label="向左切换选集" title="向左切换" disabled={!edges.left} onClick={() => step(-1)}><Icon name="previous"/></button>
      <div ref={scroller} className="player-episodes-scroller" onScroll={updateEdges} onKeyDown={event => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); moveFocus(-1); }
        else if (event.key === 'ArrowRight') { event.preventDefault(); moveFocus(1); }
      }}>
        {items.map((item, index) => <button type="button" key={item.key} ref={node => { cards.current[index] = node; }}
          className="player-episode-card" aria-current={index === currentIndex ? 'true' : undefined}
          aria-label={`播放第 ${item.number ?? index + 1} 集 ${item.title}`} onClick={() => onSelect(index)}>
          <span className="player-episode-still">
            <VideoPicture src={item.stillUrl} alt={item.title}/>
            <span className="player-episode-number">{item.badge}</span>
          </span>
          <span className="player-episode-copy">
            <strong title={item.title}>{item.title}</strong>
            <small title={item.meta || undefined}>{item.meta || ' '}</small>
          </span>
        </button>)}
      </div>
      <button type="button" className="player-episodes-arrow" aria-label="向右切换选集" title="向右切换" disabled={!edges.right} onClick={() => step(1)}><Icon name="next"/></button>
    </div>
  </section>;
}
