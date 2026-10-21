export interface ManagedBackup {
  name: string; byteLength: number; modifiedAt: string; stamp: string; incomplete: boolean;
}
export interface BackupInventory { entries: ManagedBackup[]; totalBytes: number; otherBytes: number }

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const unit = bytes >= 1024 ** 3 ? 3 : bytes >= 1024 ** 2 ? 2 : 1;
  return `${(bytes / 1024 ** unit).toFixed(1)} ${['B', 'KiB', 'MiB', 'GiB'][unit]}`;
}

// Stop on the first failure. Successful deletions must never be presented as undone.
export async function deleteSelectedBackups(entries: ManagedBackup[], remove: (entry: ManagedBackup) => Promise<void>) {
  const deleted: string[] = [];
  for (const entry of entries) {
    try { await remove(entry); deleted.push(entry.name); }
    catch (cause) { return { deleted, failed: entry.name, cause }; }
  }
  return { deleted, failed: null, cause: null };
}
