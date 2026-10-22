/** v1 IPC contract; mirrored by crates/contracts and crates/domain. */
export interface Descriptor { id: string; label: string }
export interface MediumDraft { carrierId: string; label: string }
export interface EditionDraft {
  categoryId: string; title: string; creator: string; editionLabel: string;
  barcode: string; catalogNumber: string; media: MediumDraft[];
}
export interface CopyDraft {
  status: string; acquiredAt: string; amountMinor: number | null; currency: string;
  seller: string; purchaseUrl: string; storageLocation: string; notes: string;
}
export interface LibraryCopy {
  id: string; editionId: string; revision: number; addedAt: string;
  editionRevision: number; editionCopyCount: number; coverAssetId: string | null;
  modelAssetId: string | null; modelTitle: string | null;
  edition: EditionDraft; copy: CopyDraft;
  source: EditionSource | null;
}
export interface EditionSource { providerId: string; externalId: string; fetchedAt: string }
export interface LibraryQuery { categoryId: string; status: string | null; query: string }
export interface LibrarySnapshot {
  copies: LibraryCopy[]; categories: Descriptor[]; carriers: Descriptor[];
  amounts: Record<string, string>; ownedCount: number; mediumCount: number; unpricedCount: number;
}
export interface CreateCopy {
  requestId: string; edition: EditionDraft | null; existingEditionId: string | null; copy: CopyDraft;
  cover: string | null; model: string | null; modelToken?: string | null;
}
export type CoverChange = { action: 'keep' } | { action: 'remove' } | { action: 'replace'; dataUrl: string };
export interface UpdateEdition { requestId: string; editionId: string; expectedRevision: number; edition: EditionDraft; cover: CoverChange; model: { action: 'keep' } | { action: 'remove' } | { action: 'replace'; text: string } | { action: 'prepared'; token: string } }
export interface UpdateCopy { requestId: string; id: string; expectedRevision: number; copy: CopyDraft }
export interface DeleteCopy { requestId: string; id: string; expectedRevision: number }
export interface LibraryGateway {
  move(copyId: string, beforeId: string | null): Promise<void>;
  content(editionId: string): Promise<import('../metadata/gateway').EditionContent | null>;
  backups(): Promise<BackupEntry[]>;
  prepareRestore(path: string): Promise<RestorePreview>;
  restore(token: string): Promise<string>;
  list(query: LibraryQuery): Promise<LibrarySnapshot>;
  create(request: CreateCopy): Promise<string>;
  update(request: UpdateCopy): Promise<string>;
  delete(request: DeleteCopy): Promise<string>;
  updateEdition(request: UpdateEdition): Promise<string>;
  model(assetId: string, preview: boolean): Promise<string>;
  cover(assetId: string): Promise<string>;
  backup(): Promise<string>;
}
export interface BackupEntry { path: string; name: string; byteLength: number }
export interface RestorePreview { token: string; copies: number; editions: number; assets: number; models: number }
export const statuses: Descriptor[] = [
  { id: 'owned', label: '已购入' }, { id: 'wanted', label: '想购入' }, { id: 'transit', label: '在途' },
];
export const currencies: Descriptor[] = ['CNY', 'HKD', 'JPY'].map(id => ({ id, label: id }));
export const emptyCopy = (): CopyDraft => ({
  status: 'owned', acquiredAt: '', amountMinor: null, currency: 'CNY',
  seller: '', purchaseUrl: '', storageLocation: '', notes: '',
});
