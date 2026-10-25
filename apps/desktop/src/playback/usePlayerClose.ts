import { useEffect, useState } from 'react';
import type { PlaybackController } from './usePlayback';

/** Let the webview player fade before the native surface/view is removed. */
export function usePlayerClose(player: PlaybackController) {
  const [closing, setClosing] = useState(false);
  useEffect(() => { if (!player.open) setClosing(false); }, [player.open]);
  async function close() {
    if (closing || player.busy) return;
    setClosing(true);
    const delay = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    player.hide();
  }
  return { closing, close };
}
