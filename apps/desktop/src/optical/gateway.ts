import { invoke } from '@tauri-apps/api/core';

export interface OpticalMedium {
  label: string; fileSystem: string; token: string; kind: 'bluray' | 'dvdVideo' | 'other';
  playlists: string[]; aacsDirectory: boolean; javaDirectory: boolean;
}
export interface OpticalDrive {
  mountPoint: string; name: string; status: 'empty' | 'ready' | 'unavailable';
  medium: OpticalMedium | null; error: string | null;
}
export interface PlaybackDiagnostic { status: string; message: string; details: string }
export interface PlaybackSettings { mpvExecutable: string; makeMkvLibrary: string; vlcLibrary: string }
export const optical = {
  list: () => invoke<OpticalDrive[]>('optical_list'),
  probe: (mountPoint: string, token: string, playlist: string) => invoke<PlaybackDiagnostic>('optical_probe', { mountPoint, token, playlist }),
  settings: () => invoke<PlaybackSettings>('playback_settings_get'),
  saveSettings: (settings: PlaybackSettings) => invoke<void>('playback_settings_save', { settings }),
};
