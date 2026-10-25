import { useEffect, useRef, useState } from 'react';
import { optical } from '../optical/gateway';
import { desktopAvailable, errorMessage } from '../library/gateway';
import { isActive, playback, type Control, type Snapshot } from './gateway';
import { useMusicQueue } from './useMusicQueue';

export function usePlayback() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const advanced = useRef('');
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
        if (!stopped && version === revision.current && !pending.current && value?.phase === 'ended' && value.source.playlist.startsWith('cd-track:') && advanced.current !== value.sessionId) {
          advanced.current = value.sessionId;
          const drives = await optical.list();
          if (stopped) return;
          const medium = drives.find(d => d.mountPoint === value.source.mountPoint && d.medium?.token === value.source.mediaToken)?.medium;
          const index = medium?.playlists.indexOf(value.source.playlist) ?? -1;
          if (version === revision.current && !pending.current && medium && index >= 0 && index + 1 < medium.playlists.length) {
            await execute(async () => {
              revision.current++;
              const next = await playback.start(value.source.mountPoint, value.source.mediaToken, medium.playlists[index + 1]);
              if (!stopped) setSnapshot(next);
            });
          }
        }
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
  const control = (command: Control) => execute(async () => {
    if (!snapshot) return;
    revision.current++;
    await playback.control(snapshot.sessionId, command);
    const value = await playback.snapshot();
    if (alive.current) setSnapshot(value);
  });
  const musicQueue = useMusicQueue({ snapshot, busy, control,
    start: (editionId: string, songId: number) => execute(async () => {
      revision.current++;
      const value = await playback.netease(editionId, songId);
      if (alive.current) { setSnapshot(value); setOpen(false); }
    }),
  });
  return {
    snapshot, busy: busy || musicQueue.busy, error: musicQueue.error || error, open,
    show: () => snapshot?.source.playlist.startsWith('netease-song:') ? musicQueue.setOpen(true) : setOpen(true),
    hide: () => setOpen(false), active: isActive(snapshot?.phase), musicQueue,
    startNetease: musicQueue.start,
    start: (mount: string, token: string, playlist: string, resumeSeconds = 0, resumeTitle: number | null = null) => execute(async () => {
      revision.current++;
      const value = await playback.start(mount, token, playlist, resumeSeconds, resumeTitle);
      if (alive.current) { setSnapshot(value); setOpen(true); }
    }),
    startLocal: (copyId: string, path: string) => execute(async () => {
      revision.current++;
      const value = await playback.startLocal(copyId, path);
      if (alive.current) { setSnapshot(value); setOpen(true); }
    }),
    control,
  };
}
export type PlaybackController = ReturnType<typeof usePlayback>;
