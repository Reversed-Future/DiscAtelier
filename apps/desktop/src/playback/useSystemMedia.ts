import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { desktopAvailable, errorMessage } from '../library/gateway';
import type { Control, Snapshot } from './gateway';
import type { MusicQueueController } from './useMusicQueue';

export interface SystemMediaSource { sessionId: string; title: string; artist: string; album: string; previous?: () => void; next?: () => void }
interface MediaCommand { sessionId: string; action: 'play' | 'pause' | 'stop' | 'previous' | 'next' | 'seek'; seconds: number | null }
export function useSystemMedia(snapshot: Snapshot | null, busy: boolean, control: (value: Control) => Promise<boolean>, queue: MusicQueueController) {
  const source = useRef<SystemMediaSource | null>(null), pending = useRef(false), mounted = useRef(true);
  const [enabled, setEnabled] = useState(false), [error, setError] = useState('');
  const latest = useRef({ snapshot, busy, control, queue, enabled }); latest.current = { snapshot, busy, control, queue, enabled };
  useEffect(() => {
    mounted.current = true;
    if (!desktopAvailable()) return;
    let live = true;
    const refresh = () => { void invoke<boolean>('system_media_refresh').then(value => { if (live) { setEnabled(value); setError(''); } }).catch(cause => { if (live) setError(errorMessage(cause)); }); };
    refresh();
    const failed = (cause: unknown) => { if (live) setError(errorMessage(cause)); };
    const settings = listen('playback-settings-changed', refresh).catch(failed);
    const commands = listen<MediaCommand>('system-media-command', event => {
      const state = latest.current, s = state.snapshot, command = event.payload;
      if (!live || !state.enabled || state.busy || !s || command.sessionId !== s.sessionId) return;
      if (command.action === 'previous' || command.action === 'next') {
        if (s.source.playlist.startsWith('netease-song:')) state.queue.step(command.action === 'previous' ? -1 : 1);
        else if (source.current?.sessionId === s.sessionId) source.current[command.action]?.();
      } else if (command.action === 'play' || command.action === 'pause') void state.control({ action: 'pause', paused: command.action === 'pause' });
      else if (command.action === 'stop') void state.control({ action: 'stop' });
      else if (command.seconds !== null && Number.isFinite(command.seconds) && s.seekable) void state.control({ action: 'seek', seconds: Math.min(s.durationSeconds ?? command.seconds, Math.max(0, command.seconds)) });
    }).catch(failed);
    return () => { live = false; mounted.current = false; void settings.then(stop => stop?.()); void commands.then(stop => stop?.()); };
  }, []);
  useEffect(() => {
    if (!enabled || pending.current) return;
    const online = snapshot?.source.playlist.startsWith('netease-song:');
    const details = !online && source.current?.sessionId === snapshot?.sessionId ? source.current : null;
    const song = queue.current?.tracks.find(track => track.id === queue.songId);
    pending.current = true;
    void invoke('system_media_sync', { metadata: { sessionId: snapshot?.sessionId || '', title: details?.title || snapshot?.title || '', artist: details?.artist || (online ? song?.artists.join('，') || '' : ''), album: details?.album || (online ? queue.current?.title || '' : ''), previous: online ? !!queue.current : !!details?.previous, next: online ? !!queue.current : !!details?.next } })
      .then(() => { if (mounted.current) setError(''); }).catch(cause => { if (mounted.current) setError(errorMessage(cause)); }).finally(() => { pending.current = false; });
  }, [snapshot, enabled, queue.current]);
  return { error, source };
}
