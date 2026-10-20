import { useEffect, useRef, useState } from 'react';
import { desktopAvailable, errorMessage } from '../library/gateway';
import { isActive, playback, type Control, type Snapshot } from './gateway';

export function usePlayback() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const revision = useRef(0), pending = useRef(false), alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!desktopAvailable()) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const version = revision.current;
      let delay = 1000;
      try {
        const value = await playback.snapshot();
        if (!stopped && version === revision.current) setSnapshot(value);
        if (isActive(value?.phase)) delay = 400;
      } catch (cause) { if (!stopped) setError(errorMessage(cause)); }
      if (!stopped) timer = setTimeout(poll, delay);
    }
    void poll();
    return () => { stopped = true; alive.current = false; clearTimeout(timer); };
  }, []);
  async function execute(action: () => Promise<void>) {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError('');
    try { await action(); return true; }
    catch (cause) { if (alive.current) setError(errorMessage(cause)); return false; }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  return {
    snapshot, busy, error, open, show: () => setOpen(true), hide: () => setOpen(false), active: isActive(snapshot?.phase),
    start: (mount: string, token: string, playlist: string, resumeSeconds = 0, resumeTitle: number | null = null) => execute(async () => {
      revision.current++;
      const value = await playback.start(mount, token, playlist, resumeSeconds, resumeTitle);
      if (alive.current) { setSnapshot(value); setOpen(true); }
    }),
    control: (control: Control) => execute(async () => {
      if (snapshot) await playback.control(snapshot.sessionId, control);
    }),
  };
}
export type PlaybackController = ReturnType<typeof usePlayback>;
