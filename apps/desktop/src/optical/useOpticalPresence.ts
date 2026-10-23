import { useEffect, useState } from 'react';
import { desktopAvailable } from '../library/gateway';
import { optical, type OpticalPresence } from './gateway';

/** Read-only drive association status. Polling stops when the caller is hidden. */
export function useOpticalPresence(active = true) {
  const [presence, setPresence] = useState<OpticalPresence[]>([]);
  useEffect(() => {
    if (!active || !desktopAvailable()) return;
    let live = true;
    async function poll() {
      if (document.hidden) return;
      try {
        const value = await optical.presence();
        if (live) setPresence(value);
      } catch { /* A missing drive or locked library is not a library error. */ }
    }
    void poll();
    const timer = setInterval(() => void poll(), 15000);
    return () => { live = false; clearInterval(timer); };
  }, [active]);
  return presence;
}
