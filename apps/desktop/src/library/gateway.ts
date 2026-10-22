import { invoke, isTauri } from '@tauri-apps/api/core';
import type { LibraryGateway } from './types';

/** All storage access crosses this port; UI cannot issue SQL or filesystem calls. */
export const library: LibraryGateway = {
  move: (copyId,beforeId) => invoke('library_move', {copyId,beforeId}),
  content: editionId => invoke('library_content', { editionId }),
  backups: () => invoke('library_backups'),
  prepareRestore: path => invoke('library_prepare_restore', { path }),
  restore: token => invoke('library_restore', { token }),
  list: query => invoke('library_list', { query }),
  create: request => invoke('library_create', { request }),
  update: request => invoke('library_update', { request }),
  updateEdition: request => invoke('library_update_edition', { request }),
  model: (assetId, preview) => invoke('library_model', { assetId, preview }),
  cover: assetId => invoke('library_cover', { assetId }),
  backup: () => invoke('library_backup'),
};
export const desktopAvailable = isTauri;
export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message;
  return typeof error === 'string' ? error : '操作未完成，请重试。';
}
