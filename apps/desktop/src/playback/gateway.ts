import { invoke } from '@tauri-apps/api/core';
export type Phase = 'loading' | 'playing' | 'paused' | 'buffering' | 'stopping' | 'stopped' | 'ended' | 'failed' | 'interrupted';
export interface Source { mountPoint: string; mediaToken: string; playlist: string; label: string }
export interface AudioTrack { id: number; title: string; language: string; codec: string; channels: number | null; selected: boolean }
export interface PlaybackRecord {
  sessionId: string; source: Source; title: string; startedAt: string; updatedAt: string; phase: Phase;
  positionSeconds: number; durationSeconds: number | null; watchedSeconds: number; completed: boolean; selectedAudio: number | null;
  dvdTitle: number | null;
}
export interface Snapshot extends PlaybackRecord {
  paused: boolean; seeking: boolean; seekable: boolean; audioTracks: AudioTrack[]; error: string | null; dvdMenu: boolean;
}
export type MenuDirection = 'activate' | 'up' | 'down' | 'left' | 'right' | 'root';
export type Control = { action: 'pause'; paused: boolean } | { action: 'seek'; seconds: number } | { action: 'audio'; id: number } | { action: 'stop' } | { action: 'menu'; direction: MenuDirection };
export const isActive = (phase?: Phase) => !!phase && ['loading', 'playing', 'paused', 'buffering', 'stopping'].includes(phase);
let viewportQueue: Promise<void> = Promise.resolve();
export const playback = {
  netease: (editionId: string, songId: number) => invoke<Snapshot>('netease_play', { editionId, songId }),
  viewport: (viewport: { x: number; y: number; width: number; height: number; visible: boolean; clipTop?: number; clipBottom?: number; interactive?: boolean }) => {
    const update = viewportQueue.then(() => invoke<void>('playback_viewport', { viewport }));
    viewportQueue = update.catch(() => {});
    return update;
  },
  fullscreen: (fullscreen: boolean) => invoke<void>('playback_fullscreen', { fullscreen }),
  pointer: () => invoke<[number, number] | null>('playback_pointer'),
  nativeKeys: () => invoke<string[]>('playback_native_keys'),
  snapshot: () => invoke<Snapshot | null>('playback_snapshot'),
  start: (mountPoint: string, token: string, playlist: string, resumeSeconds = 0, resumeTitle: number | null = null) =>
    invoke<Snapshot>('playback_start', { mountPoint, token, playlist, resumeSeconds, resumeTitle }),
  control: (sessionId: string, control: Control) => invoke<void>('playback_control', { sessionId, control }),
  history: () => invoke<PlaybackRecord[]>('playback_history'),
};
export function time(seconds: number | null) {
  if (seconds === null) return '—';
  const value = Math.max(0, Math.floor(seconds));
  const h = Math.floor(value / 3600), m = Math.floor(value % 3600 / 60), s = value % 60;
  return `${h ? `${h}:` : ''}${h ? String(m).padStart(2, '0') : m}:${String(s).padStart(2, '0')}`;
}
