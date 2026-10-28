import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { PlaybackController } from '../playback/usePlayback';
import { desktopAvailable, errorMessage } from '../library/gateway';
import { Modal } from '../ui/Modal';
import { shell, type CloseAction, type TrayAction } from './gateway';
import './shell.css';

export function DesktopShell({ player, onSettings }: { player: PlaybackController; onSettings(): void }) {
  const [open, setOpen] = useState(false), [remember, setRemember] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const latest = useRef({ player, onSettings }); latest.current = { player, onSettings };
  const pending = useRef(false);
  useEffect(() => {
    if (!desktopAvailable()) return;
    let live = true;
    const close = listen('window-close-request', () => { if (live) { setOpen(true); setError(''); } });
    const actions = listen<{ action: TrayAction; sessionId: string }>('tray-command', ({ payload }) => {
      if (!live) return;
      const { player: p, onSettings: settings } = latest.current;
      if (payload.action === 'settings') { settings(); return; }
      if (payload.action === 'player') { if (p.active) p.show(); return; }
      const s = p.snapshot;
      if (!s || !p.active || p.busy || pending.current || s.sessionId !== payload.sessionId) return;
      const online = s.source.playlist.startsWith('netease-song:');
      const source = p.systemMedia.source.current?.sessionId === s.sessionId ? p.systemMedia.source.current : null;
      if (payload.action === 'toggle') {
        pending.current = true;
        void p.control({ action: 'pause', paused: !s.paused }).finally(() => { pending.current = false; });
      } else if (payload.action === 'previous' || payload.action === 'next') {
        if (online) p.musicQueue.step(payload.action === 'previous' ? -1 : 1);
        else source?.[payload.action]?.();
      } else if (payload.action === 'repeat') {
        if (online) p.musicQueue.setMode(p.musicQueue.mode === 'list' ? 'one' : 'list');
        else source?.setRepeat?.(source.repeat === 'one' ? 'list' : 'one');
      }
    });
    const report = (cause: unknown) => { if (live) setError(errorMessage(cause)); };
    void close.catch(report); void actions.catch(report);
    return () => { live = false; void close.then(stop => stop()).catch(() => {}); void actions.then(stop => stop()).catch(() => {}); };
  }, []);
  useEffect(() => {
    if (!desktopAvailable()) return;
    const s = player.snapshot, online = s?.source.playlist.startsWith('netease-song:');
    const source = player.systemMedia.source.current?.sessionId === s?.sessionId ? player.systemMedia.source.current : null;
    const song = player.musicQueue.current?.tracks.find(track => track.id === player.musicQueue.songId);
    void shell.sync({ sessionId: s?.sessionId || '', title: online ? song?.title || s?.title || '' : source?.title || s?.title || '', artist: online ? song?.artists.join('，') || '' : source?.artist || '', active: player.active, paused: !!s?.paused, busy: player.busy,
      previous: online ? !!player.musicQueue.current : !!source?.previous, next: online ? !!player.musicQueue.current : !!source?.next,
      repeat: online ? player.musicQueue.mode : source?.repeat || null }).catch(cause => setError(errorMessage(cause)));
  }, [player.snapshot, player.busy, player.musicQueue.mode, player.musicQueue.current]);
  async function finish(action: CloseAction) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await shell.close(action, remember); setOpen(false); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setBusy(false); }
  }
  if (!open) return null;
  return <Modal title="关闭 DiscAtelier" onClose={() => setOpen(false)} busy={busy} className="close-choice">
    <p>最小化到托盘后，音乐会继续播放。退出应用会停止播放并关闭后台服务。</p>
    <label className="close-remember"><input type="checkbox" checked={remember} disabled={busy} onChange={event => setRemember(event.target.checked)}/>记住我的选择</label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="confirm-actions"><button className="text-button" disabled={busy} onClick={() => void finish('quit')}>退出应用</button><button className="solid-button" autoFocus disabled={busy} onClick={() => void finish('tray')}>最小化到托盘</button></div>
  </Modal>;
}
