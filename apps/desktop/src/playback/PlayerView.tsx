import { useEffect, useRef, useState } from 'react';
import { PlaybackControls } from './PlaybackControls';
import type { PlaybackController } from './usePlayback';
import { playback } from './gateway';
import { useVideoSurface } from './useVideoSurface';
import { usePlayerChrome } from './usePlayerChrome';
import { useNativeVideoKeys } from './useNativeVideoKeys';
import { PlayerEpisodes } from './PlayerEpisodes';
import { usePlayerEpisodes } from './usePlayerEpisodes';
import type { MenuDirection } from './gateway';
import { errorMessage } from '../library/gateway';
import { Icon } from '../ui/Icon';
import { playerExitDuration } from './usePlayerClose';

export function PlayerView({ player }: { player: PlaybackController }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const episodes = usePlayerEpisodes(player.snapshot?.source);
  const canEpisodes = episodes.items.length > 1;
  const episodesExpanded = episodesOpen && canEpisodes;
  const back = useRef<HTMLButtonElement>(null);
  const live = useRef({ player, fullscreen, closing, episodesOpen: episodesExpanded });
  live.current = { player, fullscreen, closing, episodesOpen: episodesExpanded };
  const chrome = usePlayerChrome(fullscreen, episodesExpanded);
  const menu = player.snapshot?.source.playlist === 'dvd-menu' || player.snapshot?.source.playlist === 'bd-menu';
  const { surface, header, footer, error: surfaceError } = useVideoSurface(player.active && !closing, fullscreen, chrome.visible, menu, episodesExpanded);
  useEffect(() => { if (!canEpisodes) setEpisodesOpen(false); }, [canEpisodes]);
  useEffect(() => { if (!player.active) setEpisodesOpen(false); }, [player.active]);
  function closeEpisodes() {
    setEpisodesOpen(false);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.playback-episodes-toggle')?.focus());
  }
  function playEpisode(index: number) {
    const item = episodes.items[index];
    if (!item || index === episodes.currentIndex) return;
    void player.startLocal(item.copyId, item.path);
  }
  function navigate(key: string) {
    const directions: Record<string, MenuDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'activate' };
    const current = live.current.player;
    const playlist = current.snapshot?.source.playlist;
    if ((playlist !== 'dvd-menu' && playlist !== 'bd-menu') || !directions[key]) return false;
    void current.control({ action: 'menu', direction: directions[key] });
    return true;
  }
  useNativeVideoKeys(menu && player.active && !closing, key => {
    chrome.wake();
    if (key === 'Escape') {
      if (live.current.episodesOpen) closeEpisodes();
      else if (live.current.fullscreen) void toggleFullscreen(); else void close();
    } else if (key === 'f') void toggleFullscreen();
    else if (key === ' ') void live.current.player.control({ action: 'pause', paused: !live.current.player.snapshot?.paused });
    else navigate(key);
  });
  async function toggleFullscreen() {
    try { await playback.fullscreen(!live.current.fullscreen); setFullscreen(value => !value); if (menu) surface.current?.focus(); }
    catch (cause) { setError(errorMessage(cause)); }
  }
  async function close() {
    const current = live.current;
    if (current.closing || current.player.busy) return;
    setEpisodesOpen(false);
    setClosing(true);
    if (current.player.active && current.player.snapshot?.phase !== 'loading' && !current.player.snapshot?.paused) {
      if (!await current.player.control({ action: 'pause', paused: true })) { setClosing(false); return; }
    } else if (current.player.snapshot?.phase === 'loading') {
      if (!await current.player.control({ action: 'stop' })) { setClosing(false); return; }
    }
    try {
      await new Promise(resolve => setTimeout(resolve, playerExitDuration()));
      await playback.viewport({ x: 0, y: 0, width: 0, height: 0, visible: false });
      if (current.fullscreen) await playback.fullscreen(false);
      current.player.hide();
    } catch (cause) { setError(errorMessage(cause)); setClosing(false); }
  }
  useEffect(() => {
    if (menu) surface.current?.focus(); else back.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[popover]:popover-open')) return;
      const { player: current, fullscreen: full } = live.current;
      const target = event.target as HTMLElement;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (live.current.episodesOpen) closeEpisodes();
        else if (full) void toggleFullscreen(); else void close();
      } else if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        if (target.closest('.player-picture') && navigate(event.key)) {
          event.preventDefault();
        } else if (event.code === 'Space') {
          event.preventDefault(); void current.control({ action: 'pause', paused: !current.snapshot?.paused });
        } else if (event.key === 'f' && !event.ctrlKey && !event.altKey) {
          event.preventDefault(); void toggleFullscreen();
        }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, []);
  return <section className="player-view" aria-label="内置播放器" aria-busy={closing} data-closing={closing} data-fullscreen={fullscreen} data-controls={chrome.visible}>
    <header className="player-header" ref={header} inert={!chrome.visible}>
      <button className="text-button" ref={back} onClick={() => void close()} disabled={closing || player.busy}><Icon name="back"/>返回</button>
      <strong className="player-heading">{player.snapshot?.title || '内置播放器'}</strong>
      {player.snapshot?.playbackMode === 'makeMkvFallback' && <span className="playback-mode" title="本地解密不足，已切换到 MakeMKV 兼容 DLL">正在使用兼容模式</span>}
    </header>
    <div className="player-picture" ref={surface} tabIndex={0} aria-label="视频画面">
      {!player.active && <span>{player.snapshot?.phase === 'failed' ? '无法播放' : '已停止'}</span>}
    </div>
    <footer className="player-footer video-footer" ref={footer} inert={!chrome.visible} data-expanded={episodesExpanded}>
      <div className="player-episodes-wrap">
        {episodesExpanded && <PlayerEpisodes items={episodes.items} currentIndex={episodes.currentIndex} loading={episodes.loading}
          onSelect={playEpisode} onClose={closeEpisodes}/>}
      </div>
      <div className="player-footer-inner">
        <PlaybackControls player={player} extended showTitle={false} fullscreen={fullscreen} onToggleFullscreen={() => void toggleFullscreen()} onMenu={() => surface.current?.focus()}
          navigation="episode" episodesOpen={episodesExpanded} onToggleEpisodes={canEpisodes ? () => setEpisodesOpen(value => !value) : undefined}
          onPrevious={canEpisodes ? () => playEpisode(episodes.currentIndex - 1) : undefined}
          onNext={canEpisodes ? () => playEpisode(episodes.currentIndex + 1) : undefined}
          canPrevious={episodes.currentIndex > 0} canNext={episodes.currentIndex >= 0 && episodes.currentIndex < episodes.items.length - 1}/>
        {(error || surfaceError || player.error) && <p className="form-error" role="alert">{error || surfaceError || player.error}</p>}
      </div>
    </footer>
  </section>;
}
