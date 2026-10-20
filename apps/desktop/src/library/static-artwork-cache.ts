import { library } from './gateway';

export type ArtworkSource = 'cover' | 'model-preview';
interface DecodedArtwork { url: string; image: HTMLImageElement; bytes: number }
const ready = new Map<string, DecodedArtwork>();
const pending = new Map<string, Promise<DecodedArtwork>>();
const maxEntries = 12;
const maxBytes = 64 * 1024 * 1024;
const keyFor = (source: ArtworkSource, assetId: string) => `${source}:${assetId}`;

/** Share decoded static images across the carousel slot and its moving portal. */
export function peekStaticArtwork(source: ArtworkSource, assetId: string) {
  const key = keyFor(source, assetId), value = ready.get(key);
  if (value) { ready.delete(key); ready.set(key, value); }
  return value;
}

export function loadStaticArtwork(source: ArtworkSource, assetId: string): Promise<DecodedArtwork> {
  const existing = peekStaticArtwork(source, assetId);
  if (existing) return Promise.resolve(existing);
  const key = keyFor(source, assetId), inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const request = (async () => {
    const url = await (source === 'cover' ? library.cover(assetId) : library.model(assetId, true));
    const image = new Image(); image.src = url;
    await image.decode();
    const value = { url, image, bytes: url.length * 2 + image.naturalWidth * image.naturalHeight * 4 };
    // Keep the decoded image alive; cached URL promises alone still flash on remount.
    if (value.bytes <= maxBytes) {
      ready.set(key, value);
      let bytes = [...ready.values()].reduce((sum, entry) => sum + entry.bytes, 0);
      while (ready.size > maxEntries || bytes > maxBytes) {
        const oldest = ready.keys().next().value!;
        bytes -= ready.get(oldest)!.bytes; ready.delete(oldest);
      }
    }
    return value;
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
