import { useEffect, useRef, useState } from 'react';
import { netease } from '../integrations/gateway';
import { errorMessage } from '../library/gateway';
import { isActive, type Control, type Snapshot } from './gateway';
import { emptyHistory, historyKey, nextSong, parseHistory, rememberAlbum, type RepeatMode } from './musicQueue';

import { collectionQueue } from './collectionQueue';

async function readQueue(editionId: string, songId: number) {
  const value = await netease.queueContext(editionId);
  const queue = collectionQueue(editionId, songId, value.albums, value.links, value.tracks, value.bindings);
  if (queue) {
    queue.title = value.title;
    await netease.rememberQueue(editionId, value.revision, queue.tracks.map(t => t.id));
  }
  return queue;
}

interface Engine {
  snapshot: Snapshot | null; busy: boolean;
  start(editionId: string, songId: number): Promise<boolean>;
  control(control: Control): Promise<boolean>;
}
export function useMusicQueue(engine: Engine) {
  const [history, setHistory] = useState(() => { try { return parseHistory(localStorage.getItem(historyKey)); } catch { return emptyHistory(); } });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false), advancing = useRef(false), handled = useRef('');
  const live = useRef(true);
  const latest = useRef({ engine, history }); latest.current = { engine, history };
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch { /* Playback remains usable without persistent UI history. */ } }, [history]);

  async function start(editionId: string, songId: number) {
    if (pending.current || latest.current.engine.busy) return false;
    pending.current = true; setBusy(true); setError('');
    try {
      // Refresh saved metadata on every selection; deleted/relinked albums cannot play stale URLs.
      const row = await readQueue(editionId, songId);
      if (!live.current) return false;
      if (!row) throw new Error('歌曲关联已改变，请重新打开收藏资料。');
      const s = latest.current.engine.snapshot;
      if (s?.source.mountPoint === editionId && s.source.playlist === `netease-song:${songId}` && String(row.albumId ?? row.editionId) === s.source.mediaToken && isActive(s.phase)) {
        setHistory(value => ({ ...value, albums: rememberAlbum(value.albums, row) }));
        return !s.paused || await latest.current.engine.control({ action: 'pause', paused: false });
      }
      const success = await latest.current.engine.start(editionId, songId);
      if (!live.current) return success;
      if (success) {
        setHistory(value => ({ ...value, albums: rememberAlbum(value.albums, row) }));
      } else setOpen(true);
      return success;
    } catch (cause) { if (live.current) { setError(errorMessage(cause)); setOpen(true); } return false; }
    finally { pending.current = false; if (live.current) setBusy(false); }
  }
  const snapshot = engine.snapshot;
  // Playback may also be started by the assistant's native tools. Adopt that
  // session into the same queue/history without issuing a second play request.
  useEffect(() => {
    if (!snapshot?.source.playlist.startsWith('netease-song:') || pending.current) return;
    const id = Number(snapshot.source.playlist.slice('netease-song:'.length));
    let active = true;
    void readQueue(snapshot.source.mountPoint, id).then(row => {
      if (!active || !row || String(row.albumId ?? row.editionId) !== snapshot.source.mediaToken) return;
      setHistory(value => ({ ...value, albums: rememberAlbum(value.albums, row) }));
    }).catch(cause => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [snapshot?.sessionId]);
  const current = history.albums.find(album => album.editionId === snapshot?.source.mountPoint && String(album.albumId ?? album.editionId) === snapshot.source.mediaToken);
  const songId = snapshot?.source.playlist.startsWith('netease-song:') ? Number(snapshot.source.playlist.slice('netease-song:'.length)) : null;
  useEffect(() => {
    if (!snapshot || snapshot.phase !== 'ended' || !songId || !current || busy || engine.busy || handled.current === snapshot.sessionId) return;
    handled.current = snapshot.sessionId;
    void advance(1, true);
  }, [snapshot, songId, current, history.mode, busy, engine.busy]);
  async function advance(direction: number, automatic = false) {
    if (!current || !songId || advancing.current || pending.current || latest.current.engine.busy) return;
    advancing.current = true; setBusy(true); setError('');
    const session = latest.current.engine.snapshot?.sessionId;
    try {
      // A disc assignment may have changed while this track was playing.
      const fresh = await readQueue(current.editionId, songId);
      if (!live.current || latest.current.engine.snapshot?.sessionId !== session) return;
      if (!fresh) throw new Error('歌曲关联已改变，请重新选择曲目。');
      const next = nextSong(fresh, songId, latest.current.history.mode, direction, automatic);
      if (next !== null) await start(fresh.editionId, next);
    } catch (cause) { if (live.current) { setError(errorMessage(cause)); setOpen(true); } }
    finally { advancing.current = false; if (live.current) setBusy(false); }
  }
  return { albums: history.albums, current, songId, mode: history.mode, busy, error, open, setOpen, start, step: (direction: number) => void advance(direction),
    setMode: (mode: RepeatMode) => setHistory(value => ({ ...value, mode })) };
}
export type MusicQueueController = ReturnType<typeof useMusicQueue>;
