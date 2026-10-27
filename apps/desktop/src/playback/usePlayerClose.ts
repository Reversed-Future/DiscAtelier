import { useEffect, useRef, useState } from 'react';
import type { PlaybackController } from './usePlayback';

export const playerExitDuration = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 125 : 220;

/** Let the webview player fade before the native surface/view is removed. */
export function usePlayerClose(player: PlaybackController) {
  const [closing, setClosing] = useState(false);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    pending.current = false; setClosing(false);
    return () => { clearTimeout(timer.current); };
  }, [player.open]);
  function close() {
    if (pending.current || player.busy || !player.open) return;
    pending.current = true;
    setClosing(true);
    timer.current = setTimeout(() => player.hide(), playerExitDuration());
  }
  return { closing, close };
}
