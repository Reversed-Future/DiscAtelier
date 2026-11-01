import { invoke, isTauri } from '@tauri-apps/api/core';
import type { LibraryGateway } from './types';

/** All storage access crosses this port; UI cannot issue SQL or filesystem calls. */
export const library: LibraryGateway = {
  move: (copyId,beforeId) => invoke('library_move', {copyId,beforeId}),
  content: editionId => invoke('library_content', { editionId }),
  saveContent: (editionId, content) => invoke('library_content_save', { editionId, content }),
  backups: () => invoke('library_backups'),
  prepareRestore: path => invoke('library_prepare_restore', { path }),
  restore: token => invoke('library_restore', { token }),
  list: query => invoke('library_list', { query }),
  create: request => invoke('library_create', { request }),
  update: request => invoke('library_update', { request }),
  delete: request => invoke('library_delete', { request }),
  updateEdition: (request, content) => invoke('library_update_edition', { request, content: content ?? null }),
  model: (assetId, preview) => invoke('library_model', { assetId, preview }),
  cover: assetId => invoke('library_cover', { assetId }),
  backup: () => invoke('library_backup'),
};
export const desktopAvailable = isTauri;
export function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const value = error as { message?: unknown; error?: unknown };
    if (typeof value.message === 'string' && value.message) return value.message;
    // Tauri and a few native bridges wrap the AppError one level deeper.
    if (value.error !== undefined && value.error !== error) return errorMessage(value.error);
  }
  return '操作未完成，请重试。';
}
