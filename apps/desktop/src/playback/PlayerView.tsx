import { useEffect, useRef, useState } from 'react';
import { PlaybackControls } from './PlaybackControls';
import type { PlaybackController } from './usePlayback';
import { playback } from './gateway';
import { useVideoSurface, type OverlayRect } from './useVideoSurface';
import { usePlayerChrome } from './usePlayerChrome';
import { useNativeVideoKeys } from './useNativeVideoKeys';
import { useLocalVideoQueue, type LocalVideoItem } from './useLocalVideoQueue';
import type { MenuDirection } from './gateway';
import { errorMessage } from '../library/gateway';
import { Icon } from '../ui/Icon';
import { playerExitDuration } from './usePlayerClose';

export function PlayerView({ player }: { player: PlaybackController }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [playlistOpen, setPlaylistOpen] = useState(false), [popoverOpen, setPopoverOpen] = useState(false), [volumeOpen, setVolumeOpen] = useState(false);
  const localVideo = useLocalVideoQueue(player.snapshot?.source);
  const localIndex = localVideo.currentIndex;
  const back = useRef<HTMLButtonElement>(null);
  const live = useRef({ player, fullscreen, closing, playlistOpen });
  live.current = { player, fullscreen, closing, playlistOpen };
  const chrome = usePlayerChrome(fullscreen);
  const menu = player.snapshot?.source.playlist === 'dvd-menu' || player.snapshot?.source.playlist === 'bd-menu';
  const overlayOpen = playlistOpen || popoverOpen || volumeOpen;
  function overlayRects(): OverlayRect[] {
    const rects: OverlayRect[] = [...document.querySelectorAll<HTMLElement>('[popover]:popover-open')].map(element => element.getBoundingClientRect());
    const playlist = document.querySelector<HTMLElement>('.player-playlist');
    if (playlist) rects.push(playlist.getBoundingClientRect());
    const volume = document.querySelector<HTMLElement>('.playback-volume-flyout');
    if (volume && getComputedStyle(volume).opacity !== '0') rects.push(volume.getBoundingClientRect());
    return rects;
  }
  const { surface, header, footer, error: surfaceError } = useVideoSurface(player.active && !closing, fullscreen, chrome.visible, menu, overlayOpen, overlayRects);
  useEffect(() => {
    const sync = () => setPopoverOpen(!!document.querySelector('[popover]:popover-open'));
    document.addEventListener('toggle', sync, true);
    return () => document.removeEventListener('toggle', sync, true);
  }, []);
  useEffect(() => { if (!localVideo.items.length || !player.active) setPlaylistOpen(false); }, [localVideo.items.length, player.active]);
  function playLocal(index: number) {
    const item = localVideo.items[index];
    if (!item) return;
    setPlaylistOpen(false);
    if (index === localIndex) return;
    void player.startLocal(item.copyId, item.path);
  }
  function playRelative(offset: number) { playLocal(localIndex + offset); }
  function episodeTitle(item: LocalVideoItem, index: number) {
    const detail = item.label.split(' · ').slice(1).join(' · ');
    return detail.replace(/^第 \d+ [章轨集](?: · )?/, '').trim() || detail || item.path.split(/[\\/]/).pop() || `第 ${item.episode ?? index + 1} 集`;
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
      if (live.current.playlistOpen) setPlaylistOpen(false);
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
        if (live.current.playlistOpen) { setPlaylistOpen(false); return; }
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
  return <section className="player-view" aria-label="内置播放器" aria-busy={closing} data-closing={closing} data-fullscreen={fullscreen} data-controls={chrome.visible}>
    <header className="player-header" ref={header} inert={!chrome.visible}>
      <button className="text-button" ref={back} onClick={() => void close()} disabled={closing || player.busy}><Icon name="back"/>返回</button>
      <strong className="player-heading">{player.snapshot?.title || '内置播放器'}</strong>
      {player.snapshot?.playbackMode === 'makeMkvFallback' && <span className="playback-mode" title="本地解密不足，已切换到 MakeMKV 兼容 DLL">正在使用兼容模式</span>}
    </header>
    <div className="player-picture" ref={surface} tabIndex={0} aria-label="视频画面">
      {!player.active && <span>{player.snapshot?.phase === 'failed' ? '无法播放' : '已停止'}</span>}
    </div>
    {playlistOpen && !!localVideo.items.length && <aside className="player-playlist" aria-label="播放列表">
      <header><strong>播放列表</strong><span>{localIndex >= 0 ? `${localIndex + 1} / ${localVideo.items.length}` : `${localVideo.items.length} 集`}</span><button type="button" className="player-icon-button" aria-label="关闭播放列表" title="关闭播放列表" onClick={() => setPlaylistOpen(false)}><Icon name="close"/></button></header>
      <div className="player-playlist-list">{localVideo.items.map((item, index) => <button type="button" key={item.path} aria-current={index === localIndex ? 'true' : undefined} onClick={() => playLocal(index)}>
        <span>{item.episode ?? index + 1}</span><strong title={item.path}>{episodeTitle(item, index)}</strong>
      </button>)}</div>
    </aside>}
    <footer className="player-footer" ref={footer} inert={!chrome.visible}>
      <PlaybackControls player={player} extended showTitle={false} fullscreen={fullscreen} onToggleFullscreen={() => void toggleFullscreen()} onMenu={() => surface.current?.focus()}
        navigation="episode" playlistOpen={playlistOpen}
        onPrevious={localVideo.items.length ? () => playRelative(-1) : undefined}
        onNext={localVideo.items.length ? () => playRelative(1) : undefined}
        canPrevious={localIndex > 0} canNext={localIndex >= 0 && localIndex < localVideo.items.length - 1}
        onTogglePlaylist={localVideo.items.length ? () => setPlaylistOpen(value => !value) : undefined} onVolumeOverlay={setVolumeOpen}/>
      {(error || surfaceError || player.error) && <p className="form-error" role="alert">{error || surfaceError || player.error}</p>}
    </footer>
  </section>;
}
