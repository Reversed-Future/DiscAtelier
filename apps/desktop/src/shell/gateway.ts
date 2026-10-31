import { invoke } from '@tauri-apps/api/core';
export type CloseAction = 'ask' | 'tray' | 'quit';
export type TrayAction = 'show' | 'player' | 'settings' | 'quit' | 'dismiss' | 'toggle' | 'previous' | 'next' | 'repeat';
export interface TrayState { sessionId: string; title: string; artist: string; active: boolean; paused: boolean; busy: boolean; previous: boolean; next: boolean; repeat: 'list' | 'one' | null }
export const emptyTray: TrayState = { sessionId: '', title: '', artist: '', active: false, paused: false, busy: false, previous: false, next: false, repeat: null };
export const shell = {
  preference: () => invoke<CloseAction>('window_close_preference'),
  savePreference: (action: CloseAction) => invoke<void>('window_save_close_preference', { action }),
  close: (action: CloseAction, remember: boolean) => invoke<void>('window_finish_close', { action, remember }),
  sync: (value: TrayState) => invoke<void>('tray_sync', { value }),
  snapshot: () => invoke<TrayState>('tray_snapshot'),
  resize: (height: number) => invoke<void>('tray_resize', { height }),
  action: (action: TrayAction, sessionId = '') => invoke<void>('tray_action', { action, sessionId }),
};
