import type { PreviewStorage, RenderedPreview } from './preview-store';

/** Bounded PNG blob cache; in-flight reads are shared across UI instances. */
export function createPreviewCache(storage: PreviewStorage, maxEntries = 8, maxBytes = 16 * 1024 * 1024) {
  const entries = new Map<string, RenderedPreview | null>();
  const pending = new Map<string, Promise<RenderedPreview | null>>();
  const listeners = new Map<string, Set<(value: RenderedPreview) => void>>();
  function remember(id: string, value: RenderedPreview | null) {
    entries.delete(id);
    if (value && value.blob.size > maxBytes) return;
    entries.set(id, value);
    let bytes = [...entries.values()].reduce((sum, entry) => sum + (entry?.blob.size || 0), 0);
    while (entries.size > maxEntries || bytes > maxBytes) {
      const oldest = entries.keys().next().value!;
      bytes -= entries.get(oldest)?.blob.size || 0; entries.delete(oldest);
    }
  }
  return {
    peek(id: string) { return entries.get(id) || null; },
    async get(id: string): Promise<RenderedPreview | null> {
      if (entries.has(id)) {
        const value = entries.get(id)!; remember(id, value); return value;
      }
      let task = pending.get(id);
      if (!task) {
        task = storage.read(id).catch(() => null).then(value => {
          // A newly captured frame wins over an older disk read.
          if (entries.get(id)) return entries.get(id)!;
          remember(id, value); return value;
        }).finally(() => pending.delete(id));
        pending.set(id, task);
      }
      return task;
    },
    async put(id: string, value: RenderedPreview) {
      const previous = entries.get(id);
      if (previous && previous.width >= value.width && previous.height >= value.height) return;
      remember(id, value);
      listeners.get(id)?.forEach(listener => listener(value));
      // Cache failure must not affect loading or collection operations.
      await storage.write(id, value).catch(() => {});
    },
    subscribe(id: string, listener: (value: RenderedPreview) => void) {
      let group = listeners.get(id);
      if (!group) { group = new Set(); listeners.set(id, group); }
      group.add(listener);
      return () => { group!.delete(listener); if (!group!.size) listeners.delete(id); };
    },
  };
}
