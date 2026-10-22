import type { EditionDraft } from '../library/types';
import type { PackagingField, PackagingKey, VideoMetadata } from './gateway';
export const packagingLabels: Record<PackagingKey, string> = { title: '名称', creator: '作者', editionLabel: '版本', barcode: '条码', catalogNumber: '品番', territory: '地区', releaseDate: '本版发行日期', volume: '卷号', includedContent: '本版收录内容', packaging: '包装与附属物', discCount: '盘片数量', carrier: '载体' };
export function applyPackaging(edition: EditionDraft, metadata: VideoMetadata, fields: PackagingField[]) {
  const next = { ...edition, media: edition.media.map(m => ({ ...m })) }, video = { ...metadata, physical: { ...metadata.physical } };
  for (const field of fields) {
    switch (field.key) {
      case 'title': case 'creator': case 'editionLabel': case 'barcode': case 'catalogNumber': next[field.key] = field.value; break;
      case 'territory': case 'releaseDate': case 'volume': case 'includedContent': case 'packaging': video.physical[field.key] = field.value; break;
    }
  }
  const count = fields.find(f => f.key === 'discCount'), carrier = fields.find(f => f.key === 'carrier');
  if (count) next.media = Array.from({ length: Number(count.value) }, (_, i) => next.media[i] || { carrierId: carrier?.value || '', label: '' });
  if (carrier) next.media = next.media.map(m => ({ ...m, carrierId: carrier.value }));
  return { edition: next, metadata: video };
}
export function currentPackaging(edition: EditionDraft, metadata: VideoMetadata, key: PackagingKey): string {
  switch (key) {
    case 'title': case 'creator': case 'editionLabel': case 'barcode': case 'catalogNumber': return edition[key];
    case 'discCount': return String(edition.media.length);
    case 'carrier': return edition.media.map(m => m.carrierId).join(' / ');
    default: return metadata.physical[key];
  }
}
