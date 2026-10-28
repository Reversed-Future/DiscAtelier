import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LyricsPanel } from './LyricsPanel';
import type { PlaybackController } from './usePlayback';

export function AudioContentTabs({ children, player, songId, resolving = false }: { children: ReactNode; player: PlaybackController; songId: number | null; resolving?: boolean }) {
  const [tab, setTab] = useState<'tracks' | 'lyrics'>('tracks');
  const pane = useRef<HTMLDivElement>(null);
  const followed = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (tab !== 'tracks') { followed.current = null; return; }
    const active = pane.current?.querySelector<HTMLElement>('.audio-track-list [aria-current="true"]');
    const list = active?.closest<HTMLElement>('.audio-track-list');
    if (!active || !list) return;
    if (followed.current === active) return;
    followed.current = active;
    const row = active.getBoundingClientRect(), viewport = list.getBoundingClientRect();
    if (row.top < viewport.top || row.bottom > viewport.bottom) list.scrollTop += row.top - viewport.top - (viewport.height - row.height) / 2;
  }, [tab, player.snapshot?.sessionId, children]);
  return <><nav className="detail-tabs audio-content-tabs" aria-label="播放内容">
    <button className={tab === 'tracks' ? 'active' : ''} onClick={() => setTab('tracks')}>曲目</button>
    <button className={tab === 'lyrics' ? 'active' : ''} onClick={() => setTab('lyrics')}>歌词</button>
  </nav><div ref={pane} className="audio-content-pane" key={tab}>{tab === 'tracks' ? children : <LyricsPanel player={player} songId={songId} resolving={resolving}/>}</div></>;
}
