import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { desktopAvailable, errorMessage } from '../library/gateway';
import { useFloatingLayer } from './useFloatingLayer';

/** One native window controller, moved into the active dialog's top layer. */
export function WindowChrome() {
  const host = useFloatingLayer();
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!desktopAvailable()) return;
    const window = getCurrentWindow();
    let disposed = false, sequence = 0;
    async function refresh() {
      const request = ++sequence;
      try {
        const [maximized, fullscreen] = await Promise.all([window.isMaximized(), window.isFullscreen()]);
        if (!disposed && request === sequence) { setMaximized(maximized); setFullscreen(fullscreen); }
      } catch (cause) { if (!disposed) setError(errorMessage(cause)); }
    }
    const unlisten = window.onResized(() => void refresh());
    void unlisten.catch(cause => { if (!disposed) setError(errorMessage(cause)); });
    void refresh();
    return () => { disposed = true; void unlisten.then(stop => stop()).catch(() => {}); };
  }, []);
  useEffect(() => {
    if (!desktopAvailable() || fullscreen) return;
    const drag = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return;
      if (!event.target.closest('[data-window-drag]') || event.target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]')) return;
      event.preventDefault();
      const window = getCurrentWindow();
      void (event.detail === 2 ? window.toggleMaximize() : window.startDragging()).catch(cause => setError(errorMessage(cause)));
    };
    document.addEventListener('mousedown', drag);
    return () => document.removeEventListener('mousedown', drag);
  }, [fullscreen]);
  async function operate(action: 'minimize' | 'maximize' | 'close') {
    setError('');
    try {
      const window = getCurrentWindow();
      if (action === 'minimize') await window.minimize();
      else if (action === 'maximize') { await window.toggleMaximize(); setMaximized(await window.isMaximized()); }
      // close() emits CloseRequested, retaining playback and sidecar shutdown.
      else await window.close();
    } catch (cause) { setError(errorMessage(cause)); }
  }
  if (!desktopAvailable() || fullscreen) return null;
  return createPortal(<div className="window-chrome" aria-label="窗口控制">
    <div className="window-drag-region" data-window-drag="true">
      {error && <span className="window-error" role="alert">{error}</span>}
    </div>
    <button type="button" title="最小化" aria-label="最小化窗口" onClick={() => void operate('minimize')}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6.5h10"/></svg>
    </button>
    <button type="button" title={maximized ? '还原' : '最大化'} aria-label={maximized ? '还原窗口' : '最大化窗口'} onClick={() => void operate('maximize')}>
      <svg viewBox="0 0 12 12" aria-hidden="true">{maximized ? <path d="M3.5 3.5v-2h7v7h-2 M1.5 3.5h7v7h-7z"/> : <path d="M1.5 1.5h9v9h-9z"/>}</svg>
    </button>
    <button type="button" className="window-close" title="关闭 DiscAtelier" aria-label="关闭 DiscAtelier" onClick={() => void operate('close')}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m1.5 1.5 9 9m0-9-9 9"/></svg>
    </button>
  </div>, host);
}
