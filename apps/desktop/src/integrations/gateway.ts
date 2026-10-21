import { invoke } from '@tauri-apps/api/core';
export interface IntegrationSettings { neteaseMode: 'builtin' | 'custom'; neteaseBaseUrl: string; aiBaseUrl: string; aiModel: string }
export interface IntegrationStatus { settings: IntegrationSettings; hasKey: boolean }
export interface MusicSupplement {
  albumId: number; title: string; artists: string[]; description: string; company: string; publishedAt: number;
  tracks: { id: number; title: string; artists: string[]; disc: string; number: number; durationMs: number }[];
  links: { position: string; title: string; songId: number }[];
}
export type NeteaseSong = MusicSupplement['tracks'][number];
export interface LinkedMusicAlbum { album: MusicSupplement; legacyPositions: boolean }
export interface DiscAlbumLink { discKey: string; albumId: number }
export interface SongLink { position: string; title: string; song: NeteaseSong }
export interface AlbumResult { id: number; title: string; artists: string[]; coverUrl: string | null }
export interface AlbumSearchPage { items: AlbumResult[]; total: number; offset: number; limit: number }
export const integrations = {
  settings: () => invoke<IntegrationStatus>('integration_settings_get'),
  save: (settings: IntegrationSettings, apiKey: string | null, forgetKey = false) => invoke<IntegrationStatus>('integration_settings_save', { settings, apiKey, forgetKey }),
};
export interface MusicQueueContext { title: string; revision: number; albums: LinkedMusicAlbum[]; links: SongLink[]; bindings: DiscAlbumLink[]; tracks: import('../metadata/gateway').ReleaseTrack[] }
export const netease = {
  queueContext: (editionId: string) => invoke<MusicQueueContext>('netease_queue_context', { editionId }),
  rememberQueue: (editionId: string, revision: number, ids: number[]) => invoke<void>('netease_queue_remember', { editionId, revision, ids }),
  discAlbums: (editionId: string) => invoke<DiscAlbumLink[]>('netease_disc_albums', { editionId }),
  bindDisc: (editionId: string, revision: number, discKey: string, albumId: number | null) => invoke<void>('netease_bind_disc', { editionId, revision, discKey, albumId }),
  albums: (editionId: string) => invoke<LinkedMusicAlbum[]>('netease_albums', { editionId }),
  reorder: (editionId: string, revision: number, ids: number[]) => invoke<void>('netease_reorder_albums', { editionId, revision, ids }),
  remove: (editionId: string, revision: number, id: number) => invoke<void>('netease_remove_album', { editionId, revision, id }),
  song: (id: number) => invoke<NeteaseSong>('netease_song_detail', { id }),
  links: (editionId: string) => invoke<SongLink[]>('netease_track_links', { editionId }),
  createCopy: (request: import('../library/types').CreateCopy, albumId: number) => invoke<string>('netease_create_copy', { request, albumId }),
  search: (query: string, offset = 0) => invoke<AlbumSearchPage>('netease_search', { query, offset }),
  album: (id: number) => invoke<MusicSupplement>('netease_album', { id }),
  albumCover: (id: number) => invoke<string>('netease_album_cover', { id }),
  songAlbum: (id: number) => invoke<MusicSupplement>('netease_song_album', { id }),
  saved: (editionId: string) => invoke<MusicSupplement | null>('netease_saved', { editionId }),
  apply: (editionId: string, revision: number, id: number) => invoke<void>('netease_apply', { editionId, revision, id }),
  link: (editionId: string, revision: number, position: string, title: string, songId: number | null) => invoke<void>('netease_link_track', { editionId, revision, position, title, songId }),
};
