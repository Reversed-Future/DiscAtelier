import { useEffect } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { desktopAvailable } from '../library/gateway';

export function useZoom() {
  useEffect(() => {
    let requested = 1;
    let applied = 1;
    let applying = false;
    const levels = [0.75, 1, 1.25, 1.5, 1.75, 2];
    const apply = async () => {
      if (applying) return;
      applying = true;
      try {
        while (applied !== requested) {
          const next = requested;
          await getCurrentWebview().setZoom(next);
          applied = next;
        }
      } catch {
        requested = applied;
      } finally { applying = false; }
    };
    const handle = (event: KeyboardEvent) => {
      if (!desktopAvailable() || !(event.ctrlKey || event.metaKey) || !['+', '=', '-', '0'].includes(event.key)) return;
      event.preventDefault();
      requested = event.key === '0' ? 1 : levels[Math.max(0, Math.min(levels.length - 1, levels.indexOf(requested) + (event.key === '-' ? -1 : 1)))];
      void apply();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, []);
}
