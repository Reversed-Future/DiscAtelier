import { useEffect, useRef, useState } from 'react';
import { playback } from './gateway';

export function usePlayerChrome(fullscreen: boolean) {
  const [visible, setVisible] = useState(true);
  const wake = useRef(() => setVisible(true));
  useEffect(() => {
    setVisible(true);
    if (!fullscreen) { wake.current = () => setVisible(true); return; }
    let disposed = false, pointerTimer: ReturnType<typeof setTimeout>, hideTimer: ReturnType<typeof setTimeout>;
    let previous: [number, number] | null = null, overControls = false;
    const arm = () => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (overControls || document.querySelector('[popover]:popover-open, .playback-seek:active')) { arm(); return; }
        const focus = document.activeElement as HTMLElement | null;
        if (focus?.closest('.player-header, .player-footer')) document.querySelector<HTMLElement>('.player-picture')?.focus();
        setVisible(false);
      }, 2000);
    };
    const show = () => { setVisible(true); arm(); };
    wake.current = show;
    const motion = (event: PointerEvent) => {
      overControls = !!(event.target as HTMLElement).closest('.player-header, .player-footer');
      show();
    };
    const keyboard = () => show();
    async function readPointer() {
      try {
        const point = await playback.pointer();
        if (disposed) return;
        if (point && (!previous || point[0] !== previous[0] || point[1] !== previous[1])) {
          const target = document.elementFromPoint(point[0]/devicePixelRatio,point[1]/devicePixelRatio);
          overControls = !!target?.closest('.player-header, .player-footer');
          show();
        }
        previous = point;
      } catch { /* DOM input remains available if the window closes during a read. */ }
      if (!disposed) pointerTimer = setTimeout(readPointer, 200);
    }
    document.addEventListener('pointermove', motion);
    document.addEventListener('pointerdown', motion);
    document.addEventListener('keydown', keyboard);
    arm(); void readPointer();
    return () => {
      disposed = true; clearTimeout(hideTimer); clearTimeout(pointerTimer);
      document.removeEventListener('pointermove', motion);
      document.removeEventListener('pointerdown', motion);
      document.removeEventListener('keydown', keyboard);
    };
  }, [fullscreen]);
  return { visible: !fullscreen || visible, wake: () => wake.current() };
}
