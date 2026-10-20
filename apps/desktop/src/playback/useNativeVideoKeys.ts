import { useEffect, useRef } from 'react';
import { playback } from './gateway';

// Native video receives its own focus. No keyboard hooks or global listeners.
export function useNativeVideoKeys(enabled: boolean, onKey: (key: string) => void) {
  const handler = useRef(onKey);
  handler.current = onKey;
  useEffect(() => {
    if (!enabled) return;
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const keys = await playback.nativeKeys();
        if (!disposed) keys.forEach(key => handler.current(key));
      } catch { /* The normal DOM shortcuts remain available. */ }
      if (!disposed) timer = setTimeout(poll, 50);
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [enabled]);
}
