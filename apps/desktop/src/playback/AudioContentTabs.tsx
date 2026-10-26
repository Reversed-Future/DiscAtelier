import { useState, type ReactNode } from 'react';
import { LyricsPanel } from './LyricsPanel';
import type { PlaybackController } from './usePlayback';

export function AudioContentTabs({ children, player, songId, resolving = false }: { children: ReactNode; player: PlaybackController; songId: number | null; resolving?: boolean }) {
  const [tab, setTab] = useState<'tracks' | 'lyrics'>('tracks');
  return <><nav className="detail-tabs audio-content-tabs" aria-label="播放内容">
    <button className={tab === 'tracks' ? 'active' : ''} onClick={() => setTab('tracks')}>曲目</button>
    <button className={tab === 'lyrics' ? 'active' : ''} onClick={() => setTab('lyrics')}>歌词</button>
  </nav><div className="audio-content-pane" key={tab}>{tab === 'tracks' ? children : <LyricsPanel player={player} songId={songId} resolving={resolving}/>}</div></>;
}
