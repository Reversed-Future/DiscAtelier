import { invoke } from '@tauri-apps/api/core';
export interface IntegrationSettings { neteaseMode: 'builtin' | 'custom'; neteaseBaseUrl: string; aiBaseUrl: string; aiModel: string }
export interface IntegrationStatus { settings: IntegrationSettings; hasKey: boolean }
export interface MusicSupplement {
  albumId: number; title: string; artists: string[]; description: string; company: string; publishedAt: number;
  tracks: { id: number; title: string; artists: string[]; disc: string; number: number; durationMs: number }[];
  links: { position: string; title: string; songId: number }[];
}
export interface AlbumResult { id: number; title: string; artists: string[]; coverUrl: string | null }
export interface AlbumSearchPage { items: AlbumResult[]; total: number; offset: number; limit: number }
export const integrations = {
  settings: () => invoke<IntegrationStatus>('integration_settings_get'),
  save: (settings: IntegrationSettings, apiKey: string | null, forgetKey = false) => invoke<IntegrationStatus>('integration_settings_save', { settings, apiKey, forgetKey }),
};
export const netease = {
  search: (query: string, offset = 0) => invoke<AlbumSearchPage>('netease_search', { query, offset }),
  album: (id: number) => invoke<MusicSupplement>('netease_album', { id }),
  albumCover: (id: number) => invoke<string>('netease_album_cover', { id }),
  songAlbum: (id: number) => invoke<MusicSupplement>('netease_song_album', { id }),
  saved: (editionId: string) => invoke<MusicSupplement | null>('netease_saved', { editionId }),
  apply: (editionId: string, revision: number, id: number) => invoke<void>('netease_apply', { editionId, revision, id }),
  link: (editionId: string, revision: number, position: string, title: string, songId: number | null) => invoke<void>('netease_link_track', { editionId, revision, position, title, songId }),
};
