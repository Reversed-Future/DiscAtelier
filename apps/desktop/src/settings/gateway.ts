import { Channel, invoke } from '@tauri-apps/api/core';
import { shareUpdateCheck } from './startupUpdates';

export interface UpdateStatus {
  currentVersion: string;
  configured: boolean;
  available: { version: string; notes: string; ready: boolean } | null;
}
export interface DownloadProgress { received: number; total: number | null }
export interface DataLocation { directory: string; database: string; backups: string }
export const settings = {
  location: () => invoke<DataLocation>('data_location'),
  openDirectory: () => invoke('data_open_directory'),
};
export const updates = {
  status: () => invoke<UpdateStatus>('update_status'),
  saveToken: (token: string) => invoke('update_save_token', { token }),
  forgetToken: () => invoke('update_forget_token'),
  check: shareUpdateCheck(() => invoke<UpdateStatus>('update_check')),
  download: (progress: (value: DownloadProgress) => void) => {
    const onProgress = new Channel<DownloadProgress>();
    onProgress.onmessage = progress;
    return invoke<UpdateStatus>('update_download', { onProgress });
  },
  install: () => invoke<void>('update_install'),
};
