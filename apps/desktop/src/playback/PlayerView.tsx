import { useEffect, useRef, useState } from 'react';
import { PlaybackControls } from './PlaybackControls';
import type { PlaybackController } from './usePlayback';
import { playback } from './gateway';
import { useVideoSurface } from './useVideoSurface';
import { usePlayerChrome } from './usePlayerChrome';
import { useNativeVideoKeys } from './useNativeVideoKeys';
import type { MenuDirection } from './gateway';
import { errorMessage } from '../library/gateway';
import { Icon } from '../ui/Icon';

export function PlayerView({ player }: { player: PlaybackController }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const back = useRef<HTMLButtonElement>(null);
  const live = useRef({ player, fullscreen, closing });
  live.current = { player, fullscreen, closing };
  const chrome = usePlayerChrome(fullscreen);
  const dvd = player.snapshot?.source.playlist === 'dvd-menu';
  const { surface, header, footer, error: surfaceError } = useVideoSurface(player.active && !closing, fullscreen, chrome.visible, dvd);
  function navigate(key: string) {
    const directions: Record<string, MenuDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'activate' };
    const current = live.current.player;
    if (current.snapshot?.source.playlist !== 'dvd-menu' || !directions[key]) return false;
    void current.control({ action: 'menu', direction: directions[key] });
    return true;
  }
  useNativeVideoKeys(dvd && player.active && !closing, key => {
    chrome.wake();
    if (key === 'Escape') {
      if (live.current.fullscreen) void toggleFullscreen(); else void close();
    } else if (key === 'f') void toggleFullscreen();
    else if (key === ' ') void live.current.player.control({ action: 'pause', paused: !live.current.player.snapshot?.paused });
    else navigate(key);
  });
  async function toggleFullscreen() {
    try { await playback.fullscreen(!live.current.fullscreen); setFullscreen(value => !value); if (dvd) surface.current?.focus(); }
    catch (cause) { setError(errorMessage(cause)); }
  }
  async function close() {
    const current = live.current;
    if (current.closing || current.player.busy) return;
    setClosing(true);
    if (current.player.active && current.player.snapshot?.phase !== 'loading' && !current.player.snapshot?.paused) {
      if (!await current.player.control({ action: 'pause', paused: true })) { setClosing(false); return; }
    } else if (current.player.snapshot?.phase === 'loading') {
      if (!await current.player.control({ action: 'stop' })) { setClosing(false); return; }
    }
    try {
      await playback.viewport({ x: 0, y: 0, width: 0, height: 0, visible: false });
      if (current.fullscreen) await playback.fullscreen(false);
      current.player.hide();
    } catch (cause) { setError(errorMessage(cause)); setClosing(false); }
  }
  useEffect(() => {
    if (dvd) surface.current?.focus(); else back.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[popover]:popover-open')) return;
      const { player: current, fullscreen: full } = live.current;
      const target = event.target as HTMLElement;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (full) void toggleFullscreen(); else void close();
      } else if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        if (target.closest('.player-picture') && navigate(event.key)) {
          event.preventDefault();
        } else if (event.code === 'Space' && target.tagName !== 'BUTTON') {
          event.preventDefault(); void current.control({ action: 'pause', paused: !current.snapshot?.paused });
        } else if (event.key === 'f' && !event.ctrlKey && !event.altKey) {
          event.preventDefault(); void toggleFullscreen();
        }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, []);
  return <section className="player-view" aria-label="内置播放器" aria-busy={closing} data-fullscreen={fullscreen} data-controls={chrome.visible}>
    <header className="player-header" ref={header} inert={!chrome.visible}>
      <button className="text-button" ref={back} onClick={() => void close()} disabled={closing || player.busy}><Icon name="back"/>返回</button>
      <button className="text-button" onClick={() => void toggleFullscreen()}>{fullscreen ? '退出全屏' : '全屏'}</button>
    </header>
    <div className="player-picture" ref={surface} tabIndex={0} aria-label="视频画面">
      {!player.active && <span>{player.snapshot?.phase === 'failed' ? '无法播放' : '已停止'}</span>}
    </div>
    <footer className="player-footer" ref={footer} inert={!chrome.visible}>
      <PlaybackControls player={player} onMenu={() => surface.current?.focus()}/>
      {(error || surfaceError || player.error) && <p className="form-error" role="alert">{error || surfaceError || player.error}</p>}
    </footer>
  </section>;
}
