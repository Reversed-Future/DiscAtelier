import { useEffect, useRef, useState } from 'react';
import { netease } from '../integrations/gateway';
import { errorMessage } from '../library/gateway';
import { isActive, type Control, type Snapshot } from './gateway';
import { emptyHistory, historyKey, nextSong, parseHistory, rememberAlbum, type QueueAlbum, type RepeatMode } from './musicQueue';

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
  const pending = useRef(false), handled = useRef('');
  const live = useRef(true);
  const latest = useRef({ engine, history }); latest.current = { engine, history };
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch { /* Playback remains usable without persistent UI history. */ } }, [history]);

  async function start(editionId: string, songId: number) {
    if (pending.current || latest.current.engine.busy) return false;
    pending.current = true; setBusy(true); setError('');
    try {
      const s = latest.current.engine.snapshot;
      if (s?.source.mountPoint === editionId && s.source.playlist === `netease-song:${songId}` && isActive(s.phase)) {
        return !s.paused || await latest.current.engine.control({ action: 'pause', paused: false });
      }
      // Refresh saved metadata on every selection; deleted/relinked albums cannot play stale URLs.
      const album = await netease.saved(editionId);
      if (!live.current) return false;
      if (!album?.tracks.some(track => track.id === songId)) throw new Error('这首歌已不在关联专辑中，请重新打开收藏资料。');
      const success = await latest.current.engine.start(editionId, songId);
      if (!live.current) return success;
      if (success) {
        const row: QueueAlbum = { editionId, albumId: album.albumId, title: album.title, artists: album.artists, tracks: album.tracks, lastSongId: songId };
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
    void netease.saved(snapshot.source.mountPoint).then(album => {
      if (!active || !album || String(album.albumId) !== snapshot.source.mediaToken || !album.tracks.some(t => t.id === id)) return;
      const row: QueueAlbum = { editionId: snapshot.source.mountPoint, albumId: album.albumId, title: album.title, artists: album.artists, tracks: album.tracks, lastSongId: id };
      setHistory(value => ({ ...value, albums: rememberAlbum(value.albums, row) }));
    }).catch(cause => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [snapshot?.sessionId]);
  const current = history.albums.find(album => album.editionId === snapshot?.source.mountPoint && String(album.albumId) === snapshot.source.mediaToken);
  const songId = snapshot?.source.playlist.startsWith('netease-song:') ? Number(snapshot.source.playlist.slice('netease-song:'.length)) : null;
  useEffect(() => {
    if (!snapshot || snapshot.phase !== 'ended' || !songId || !current || busy || engine.busy || handled.current === snapshot.sessionId) return;
    handled.current = snapshot.sessionId;
    const next = nextSong(current, songId, history.mode, 1, true);
    if (next !== null) void start(current.editionId, next);
  }, [snapshot, songId, current, history.mode, busy, engine.busy]);
  function step(direction: number) {
    if (!current || !songId) return;
    const next = nextSong(current, songId, history.mode, direction);
    if (next !== null) void start(current.editionId, next);
  }
  return { albums: history.albums, current, songId, mode: history.mode, busy, error, open, setOpen, start, step,
    setMode: (mode: RepeatMode) => setHistory(value => ({ ...value, mode })) };
}
export type MusicQueueController = ReturnType<typeof useMusicQueue>;
