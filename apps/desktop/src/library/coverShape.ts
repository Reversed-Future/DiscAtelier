import type { EditionDraft } from './types';
// Physical video cases use a portrait sleeve; music cases remain square.
export function portraitCover(edition: EditionDraft): boolean {
  return edition.categoryId === 'video' && edition.media.some(m => m.carrierId === 'bd' || m.carrierId === 'dvd');
}
