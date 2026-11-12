import { useEffect, useRef } from 'react';
import type { PlaybackController } from './usePlayback';

/** Space toggles pause in audio players instead of activating the focused control. */
export function useSpacePause(player: PlaybackController, enabled = true) {
  const live = useRef({ player, enabled });
  live.current = { player, enabled };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!live.current.enabled || event.code !== 'Space' || event.repeat || event.defaultPrevented
        || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      event.preventDefault();
      const current = live.current.player;
      if (!current.active || current.busy) return;
      void current.control({ action: 'pause', paused: !current.snapshot?.paused });
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
}
