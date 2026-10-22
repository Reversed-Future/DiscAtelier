import { Channel, invoke } from '@tauri-apps/api/core';

export interface CdTrack { number: number; durationSeconds: number }
export interface CdTrackMetadata {
  number: number; title: string | null; artist: string | null; album: string | null;
  date: string | null; genre: string | null; trackTotal: number | null;
}
export interface OpticalMedium {
  label: string; fileSystem: string; token: string; kind: 'bluray' | 'dvdVideo' | 'audioCd' | 'other';
  tracks: CdTrack[]; playlists: string[]; aacsDirectory: boolean; bdplusDirectory: boolean; javaDirectory: boolean;
}
export interface OpticalDrive {
  mountPoint: string; name: string; status: 'empty' | 'ready' | 'unavailable';
  medium: OpticalMedium | null; error: string | null;
}
export interface PlaybackDiagnostic { status: string; message: string; details: string }
export interface KeydbStatus { configured: boolean; bytes: number; entries: number; sources: string[]; updatedAt: string | null }
export interface KeydbImport { status: KeydbStatus; replacedExisting: boolean; englishSupplemented: boolean }
export interface KeydbProgress { phase: string; message: string; percent: number | null; received: number; total: number | null }
export interface PlaybackSettings { mpvExecutable: string; makeMkvLibrary: string; vlcLibrary: string; makeMkvFallback: boolean }
export const optical = {
  list: () => invoke<OpticalDrive[]>('optical_list'),
  cdMetadata: (mountPoint: string, token: string, refresh = false) => invoke<CdTrackMetadata[]>('optical_cd_metadata', { mountPoint, token, refresh }),
  probe: (mountPoint: string, token: string, playlist: string) => invoke<PlaybackDiagnostic>('optical_probe', { mountPoint, token, playlist }),
  settings: () => invoke<PlaybackSettings>('playback_settings_get'),
  saveSettings: (settings: PlaybackSettings) => invoke<void>('playback_settings_save', { settings }),
  keydbStatus: () => invoke<KeydbStatus>('bluray_key_status'),
  importKeydb: (data: string) => invoke<KeydbImport>('bluray_key_import', { data }),
  downloadKeydb: (progress: (value: KeydbProgress) => void) => {
    const onProgress = new Channel<KeydbProgress>(); onProgress.onmessage = progress;
    return invoke<KeydbImport>('bluray_key_download', { onProgress });
  },
};
