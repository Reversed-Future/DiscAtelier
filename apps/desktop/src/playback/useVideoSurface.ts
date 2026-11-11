import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { playback } from './gateway';
import { errorMessage } from '../library/gateway';

// The video is native. Only its rectangle crosses IPC; no decoded pixels do.
export function useVideoSurface(visible: boolean, fullscreen: boolean, chromeVisible: boolean, interactive = false) {
  const surface = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null), footer = useRef<HTMLElement>(null);
  const [error, setError] = useState('');
  const current = useRef({ visible, fullscreen, interactive });
  current.current = { visible, fullscreen, interactive };
  const refresh = useRef(() => {});
  useLayoutEffect(() => { refresh.current(); }, [visible, fullscreen, chromeVisible, interactive]);
  useEffect(() => {
    let disposed = false, running = false, dirty = false, frame = 0, until = 0, last = '';
    async function update() {
      if (running) { dirty = true; return; }
      if (disposed || !surface.current) return;
      const rect = surface.current.getBoundingClientRect(), scale = window.devicePixelRatio;
      const top = header.current?.getBoundingClientRect(), bottom = footer.current?.getBoundingClientRect();
      const viewport = { x: Math.round(rect.x * scale), y: Math.round(rect.y * scale),
        width: Math.round(rect.width * scale), height: Math.round(rect.height * scale), visible: current.current.visible, interactive: current.current.interactive,
        clipTop: current.current.fullscreen && top ? Math.max(0, Math.round((top.bottom-rect.top)*scale)) : 0,
        clipBottom: current.current.fullscreen && bottom ? Math.max(0, Math.round((rect.bottom-bottom.top)*scale)) : 0 };
      const key = JSON.stringify(viewport);
      if (key === last) return;
      running = true;
      try {
        await playback.viewport(viewport);
        last = key;
        if (!disposed) setError('');
      } catch (cause) { if (!disposed) setError(errorMessage(cause)); }
      finally {
        running = false;
        if (!disposed && dirty) { dirty = false; void update(); }
      }
    }
    const tick = () => {
      void update();
      frame = performance.now() < until ? requestAnimationFrame(tick) : 0;
    };
    // Follow the short control-bar transform only, never a permanent render loop.
    const schedule = () => {
      until = performance.now() + 240;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    refresh.current = schedule;
    const observer = new ResizeObserver(schedule);
    if (surface.current) observer.observe(surface.current);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    schedule();
    return () => {
      refresh.current = () => {};
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      void playback.viewport({ x: 0, y: 0, width: 0, height: 0, visible: false }).catch(() => {});
    };
  }, []);
  return { surface, header, footer, error };
}
