import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../ui/Icon';
import { enter } from '../ui/motion';
import { PlaybackControls } from './PlaybackControls';
import { time } from './gateway';
import type { PlaybackController } from './usePlayback';
import { usePlaybackLayer } from './usePlaybackLayer';

export function MusicDock({ player }: { player: PlaybackController }) {
  const host = usePlaybackLayer();
  const queue = player.musicQueue;
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const album = queue.albums.find(row => row.editionId === selected) || queue.current || queue.albums[0];
  const online = !!player.snapshot?.source.playlist.startsWith('netease-song:');
  const local = player.snapshot?.source.mediaToken === 'local-audio';
  useEffect(() => { if (queue.current) setSelected(queue.current.editionId); }, [queue.current?.editionId]);
  useEffect(() => { list.current?.scrollTo(0, 0); enter(list.current, 0); }, [album?.editionId, host]);
  useEffect(() => {
    if (!queue.open) return;
    const pointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) queue.setOpen(false); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); queue.setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', pointer, true); document.removeEventListener('keydown', key, true); };
  }, [queue.open]);
  if (local || player.open || (!queue.albums.length && !online && !queue.open && !queue.busy)) return null;
  return createPortal(<div className="music-dock" ref={root}>
    <section className="music-dock-panel" id="music-queue" role="region" aria-label="播放列表" data-open={queue.open} inert={!queue.open}>
      <header className="music-dock-heading"><h3>播放列表</h3><div className="local-dock-heading-actions">{online && <button className="icon-button" aria-label="打开播放界面" title="打开播放界面" onClick={player.show}><Icon name="disc"/></button>}<button className="icon-button" aria-label="收起播放列表" onClick={() => { queue.setOpen(false); trigger.current?.focus(); }}><Icon name="close"/></button></div></header>
      <nav className="music-album-tabs" aria-label="最近播放的专辑">{queue.albums.map(row => <button key={row.editionId} title={row.title} aria-pressed={row.editionId === album?.editionId} onClick={() => setSelected(row.editionId)}>{row.title}</button>)}</nav>
      <div ref={list} className="music-queue-scroll" aria-busy={queue.busy}>
        {album?.tracks.map((track, index) => <button key={track.id} className="music-queue-track" disabled={player.busy}
          aria-current={online && queue.current?.editionId === album.editionId && queue.songId === track.id ? 'true' : undefined}
          onClick={() => void queue.start(album.editionId, track.id)}>
          <span>{String(index + 1).padStart(2, '0')}</span><strong>{track.title}</strong><time>{time(track.durationMs / 1000)}</time>
        </button>)}
        {!album && <p className="setting-hint">{queue.busy ? '读取中' : '暂无曲目'}</p>}
      </div>
      <footer className="music-dock-footer">
        {online && <PlaybackControls player={player} showVolume onPrevious={() => queue.step(-1)} onNext={() => queue.step(1)}
          canPrevious={!!queue.current} canNext={!!queue.current} repeat={queue.mode}
          onRepeat={() => queue.setMode(queue.mode === 'list' ? 'one' : 'list')}/>}
        {player.error && <p className="form-error" role="alert">{player.error}</p>}
      </footer>
    </section>
    <button ref={trigger} className="music-dock-trigger" aria-label={online ? `播放列表 · ${player.snapshot?.title}` : '播放列表'} aria-expanded={queue.open} aria-controls="music-queue" onClick={() => queue.setOpen(!queue.open)}>
      <Icon name="list"/><span className="music-dock-indicator" data-playing={online && player.active && !player.snapshot?.paused} data-busy={queue.busy}/>
    </button>
  </div>, host);
}
