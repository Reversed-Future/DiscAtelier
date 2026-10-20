/** Disposable, versioned display cache. Collection assets remain in SQLite. */
export interface RenderedPreview { blob: Blob; width: number; height: number }
export interface PreviewStorage {
  read(assetId: string): Promise<RenderedPreview | null>;
  write(assetId: string, value: RenderedPreview): Promise<void>;
}
// Increment whenever overview framing, lighting or rendering changes.
const revision = 'overview-2';
const databaseName = 'discatelier-model-previews';
const storeName = 'previews';
const maxEntries = 24;
const maxBytes = 32 * 1024 * 1024;
interface StoredPreview extends RenderedPreview { key: string; revision: string; savedAt: number }
let database: Promise<IDBDatabase> | undefined;
function open() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'key' });
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(Error('Preview cache unavailable')); };
  });
}
const keyFor = (assetId: string) => `${revision}:${assetId}`;
let writes = Promise.resolve();
export const previewStorage: PreviewStorage = {
  async read(assetId) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).get(keyFor(assetId));
      request.onsuccess = () => {
        const value: StoredPreview | undefined = request.result;
        resolve(value?.revision === revision && value.blob instanceof Blob ? value : null);
      };
      request.onerror = () => reject(request.error);
    });
  },
  write(assetId, value) {
    // Serialize transactions; trim only this cache's records, never collection data.
    const write = writes.catch(() => {}).then(async () => {
      if (value.blob.size > 4 * 1024 * 1024) return;
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        store.put({ ...value, key: keyFor(assetId), revision, savedAt: Date.now() } satisfies StoredPreview);
        const request = store.getAll();
        request.onsuccess = () => {
          const entries = (request.result as StoredPreview[]).sort((a, b) => b.savedAt - a.savedAt);
          let bytes = 0, count = 0;
          for (const entry of entries) {
            if (entry.revision !== revision || count >= maxEntries || bytes + entry.blob.size > maxBytes) store.delete(entry.key);
            else { count++; bytes += entry.blob.size; }
          }
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
    });
    writes = write;
    return write;
  },
};
