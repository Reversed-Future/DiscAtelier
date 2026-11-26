import { useEffect, useState } from 'react';
import { desktopAvailable } from '../library/gateway';
import { optical, type OpticalPresence } from './gateway';

let cachedPresence: OpticalPresence[] | null = null;
const samePresence = (left: OpticalPresence[], right: OpticalPresence[]) => JSON.stringify(left) === JSON.stringify(right);

/** Raw drive presence, including discs that are not associated with a copy yet. */
export function useOpticalInserted(active = true, interval = 3000) {
  const [inserted, setInserted] = useState(false);
  useEffect(() => {
    if (!active || !desktopAvailable()) return;
    let live = true;
    async function poll() {
      try {
        const drives = await optical.list();
        if (live) setInserted(drives.some(drive => !!drive.medium));
      } catch { /* A missing drive is not a library error. */ }
    }
    void poll();
    const timer = setInterval(() => void poll(), interval);
    return () => { live = false; clearInterval(timer); };
  }, [active, interval]);
  return inserted;
}

/** Read-only drive association status. Polling stops when the caller is hidden. */
export function useOpticalPresence(active = true, interval = 15000) {
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
    const timer = setInterval(() => void poll(), interval);
    return () => { live = false; clearInterval(timer); };
  }, [active, interval]);
  return presence;
}
