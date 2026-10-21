import { invoke } from '@tauri-apps/api/core';
import type { CopyDraft, EditionDraft, EditionSource, LibraryCopy } from '../library/types';
export interface ImportPreview { token: string; edition: EditionDraft; source: EditionSource; existing: LibraryCopy | null; cover: string | null }
export interface ImportCopyRequest {
  neteaseAlbumId?: number | null;
  requestId: string; token: string; edition: EditionDraft; copy: CopyDraft; cover: string | null; model: string | null; modelToken?: string | null;
  existingEditionId: string | null; expectedRevision: number | null;
}
export interface MetadataSearch { mode: string; query: string; page: number }
export interface SearchResult { id: number; title: string; thumb: string; cover_image: string; country: string; year: string; catno: string; format: string[]; type: string }
export interface MetadataResults { results: SearchResult[]; pagination: { page: number; pages: number; items: number } }
export interface ReleaseCredit { name: string; anv: string; role: string; tracks: string }
export interface ReleaseCompany { name: string; entity_type_name: string; catno: string }
export interface ReleaseTrack { title: string; position: string; duration: string; type_: string; sub_tracks?: ReleaseTrack[]; extraartists?: ReleaseCredit[] }
export interface EditionContent { genres: string[]; styles: string[]; tracks: ReleaseTrack[]; credits: ReleaseCredit[]; companies: ReleaseCompany[]; notes: string; detailsLoaded: boolean }
export interface MetadataRelease {
  extraartists: ReleaseCredit[]; companies: ReleaseCompany[]; notes: string;
  genres: string[]; styles: string[];
  id: number; title: string; country: string; released: string;
  artists: { name: string; anv: string; join: string }[];
  formats: { name: string; qty: string; descriptions: string[]; text: string }[];
  labels: { name: string; catno: string }[];
  identifiers: { type: string; value: string; description: string }[];
  tracklist: ReleaseTrack[];
  images: { type: string; uri: string; uri150: string }[];
}
export const discogs = {
  completeContent: (editionId: string, id: number) => invoke<EditionContent>('discogs_complete_content', { editionId, id }),
  prepareImport: (id: number, categoryId: string) => invoke<ImportPreview>('discogs_prepare_import', { id, categoryId }),
  importCopy: (request: ImportCopyRequest) => invoke<string>('discogs_import', { request }),
  openRelease: (id: number) => invoke<void>('discogs_open_release', { id }),
  configured: () => invoke<boolean>('discogs_configured'),
  saveToken: (token: string) => invoke<void>('discogs_save_token', { token }),
  forgetToken: () => invoke<void>('discogs_forget_token'),
  search: (request: MetadataSearch) => invoke<MetadataResults>('discogs_search', { request }),
  release: (id: number) => invoke<MetadataRelease>('discogs_release', { id }),
};
