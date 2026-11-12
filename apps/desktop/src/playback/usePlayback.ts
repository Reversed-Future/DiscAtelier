import { useEffect, useRef, useState } from 'react';
import { optical } from '../optical/gateway';
import { desktopAvailable, errorMessage } from '../library/gateway';
import { isActive, playback, type Control, type Snapshot } from './gateway';
import { useMusicQueue } from './useMusicQueue';
import { useSystemMedia } from './useSystemMedia';

const VOLUME_KEY = 'discatelier.playback.volume';
const clampVolume = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
function rememberedVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return 100;
    const value = Number(raw);
    return Number.isFinite(value) ? clampVolume(value) : 100;
  } catch { return 100; }
}
function rememberVolume(value: number) {
  try { localStorage.setItem(VOLUME_KEY, String(clampVolume(value))); } catch { /* storage may be unavailable */ }
}

export function usePlayback() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const advanced = useRef('');
  const revision = useRef(0), pending = useRef(false), alive = useRef(true);
  const preferredVolume = useRef(rememberedVolume());
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingVolume = useRef<{ sessionId: string; value: number } | null>(null);
  const snapshotRef = useRef<Snapshot | null>(snapshot);
  snapshotRef.current = snapshot;
  useEffect(() => () => { if (volumeTimer.current) clearTimeout(volumeTimer.current); }, []);
  useEffect(() => {
    const current = snapshot;
    if (!current?.sessionId || current.volume === preferredVolume.current) return;
    // New media sessions start at the backend default. Re-apply the user's
    // last volume so switching songs or discs does not jump back to 100%.
    let live = true;
    void playback.control(current.sessionId, { action: 'volume', volume: preferredVolume.current })
      .then(() => playback.snapshot())
      .then(value => { if (live && alive.current && value?.sessionId === current.sessionId) setSnapshot(value); })
      .catch(() => {});
    return () => { live = false; };
  }, [snapshot?.sessionId]);
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
    if (command.action === 'volume') {
      preferredVolume.current = clampVolume(command.volume);
      rememberVolume(command.volume);
    }
    const value = await playback.snapshot();
    if (alive.current) setSnapshot(value);
  });
  const setVolume = (value: number) => {
    const next = clampVolume(value);
    preferredVolume.current = next;
    rememberVolume(next);
    setSnapshot(current => current && current.volume !== next ? { ...current, volume: next } : current);
    const sessionId = snapshotRef.current?.sessionId;
    if (!sessionId) return;
    pendingVolume.current = { sessionId, value: next };
    if (volumeTimer.current) return;
    const flush = async () => {
      volumeTimer.current = undefined;
      const pending = pendingVolume.current;
      pendingVolume.current = null;
      if (pending) {
        try { await playback.control(pending.sessionId, { action: 'volume', volume: pending.value }); }
        catch { /* next poll will report the actual volume */ }
      }
      if (pendingVolume.current && !volumeTimer.current) volumeTimer.current = setTimeout(flush, 40);
    };
    volumeTimer.current = setTimeout(flush, 40);
  };
  const musicQueue = useMusicQueue({ snapshot, busy, control,
    start: (editionId: string, songId: number) => execute(async () => {
      revision.current++;
      const value = await playback.netease(editionId, songId);
      if (alive.current) { setSnapshot(value); }
    }),
  });
  const systemMedia = useSystemMedia(snapshot, busy || musicQueue.busy, control, musicQueue);
  return {
    snapshot, busy: busy || musicQueue.busy, error: musicQueue.error || error || systemMedia.error, open, systemMedia,
    show: () => { musicQueue.setOpen(false); setOpen(true); },
    hide: () => setOpen(false), active: isActive(snapshot?.phase), musicQueue,
    startNetease: musicQueue.start,
    start: (mount: string, token: string, playlist: string, resumeSeconds = 0, resumeTitle: number | null = null, open = true) => execute(async () => {
      revision.current++;
      const value = await playback.start(mount, token, playlist, resumeSeconds, resumeTitle);
      if (alive.current) { setSnapshot(value); setOpen(open); }
    }),
    startLocal: (copyId: string, path: string, open = true) => execute(async () => {
      revision.current++;
      const value = await playback.startLocal(copyId, path);
      if (alive.current) { setSnapshot(value); setOpen(open); }
    }),
    control, setVolume,
  };
}
export type PlaybackController = ReturnType<typeof usePlayback>;
