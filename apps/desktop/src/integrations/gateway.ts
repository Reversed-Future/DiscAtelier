import { invoke } from '@tauri-apps/api/core';
export interface IntegrationSettings { neteaseMode: 'builtin' | 'custom'; neteaseBaseUrl: string; aiBaseUrl: string; aiModel: string }
export interface IntegrationStatus { settings: IntegrationSettings; hasKey: boolean }
export interface MusicSupplement {
  albumId: number; title: string; artists: string[]; description: string; company: string; publishedAt: number;
  tracks: { id: number; title: string; artists: string[]; disc: string; number: number; durationMs: number }[];
}
export interface AlbumResult { id: number; title: string; artists: string[] }
export const integrations = {
  settings: () => invoke<IntegrationStatus>('integration_settings_get'),
  save: (settings: IntegrationSettings, apiKey: string | null, forgetKey = false) => invoke<IntegrationStatus>('integration_settings_save', { settings, apiKey, forgetKey }),
};
export const netease = {
  search: (query: string) => invoke<AlbumResult[]>('netease_search', { query }),
  album: (id: number) => invoke<MusicSupplement>('netease_album', { id }),
  saved: (editionId: string) => invoke<MusicSupplement | null>('netease_saved', { editionId }),
  apply: (editionId: string, revision: number, id: number) => invoke<void>('netease_apply', { editionId, revision, id }),
};
