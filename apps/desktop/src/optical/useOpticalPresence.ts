import { useEffect, useState } from 'react';
import { desktopAvailable } from '../library/gateway';
import { optical, type OpticalPresence } from './gateway';

let cachedPresence: OpticalPresence[] | null = null;
const samePresence = (left: OpticalPresence[], right: OpticalPresence[]) => JSON.stringify(left) === JSON.stringify(right);

/** Read-only drive association status. Polling stops when the caller is hidden. */
export function useOpticalPresence(active = true) {
  const [presence, setPresence] = useState<OpticalPresence[]>(() => cachedPresence || []);
  useEffect(() => {
    if (!active || !desktopAvailable()) return;
    let live = true;
    async function poll() {
      if (document.hidden) return;
      try {
        const value = await optical.presence();
        if (live && (!cachedPresence || !samePresence(cachedPresence, value))) {
          cachedPresence = value;
          setPresence(value);
        }
      } catch { /* A missing drive or locked library is not a library error. */ }
    }
    void poll();
    const timer = setInterval(() => void poll(), 15000);
    return () => { live = false; clearInterval(timer); };
  }, [active]);
  return presence;
}
