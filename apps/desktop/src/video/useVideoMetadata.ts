import { useEffect, useState } from 'react';
import { errorMessage } from '../library/gateway';
import { video, type VideoMetadata } from './gateway';

const cache = new Map<string, VideoMetadata | null>();
const keyFor = (editionId: string, revision: number) => `${editionId}:${revision}`;

export function prefetchVideoMetadata(editionId: string, revision: number) {
  if (!editionId || cache.has(keyFor(editionId, revision))) return;
  const key = keyFor(editionId, revision);
  void video.metadata(editionId).then(value => cache.set(key, value)).catch(() => {});
}

export function useVideoMetadata(editionId: string, revision: number, enabled: boolean) {
  const key = keyFor(editionId, revision);
  const cached = enabled ? cache.get(key) : undefined;
  const [loaded, setLoaded] = useState<{editionId: string; revision: number; value: VideoMetadata | null} | null>(
    () => cached === undefined ? null : { editionId, revision, value: cached },
  );
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    if (!enabled) { setLoaded(null); return; }
    const known = cache.get(key);
    if (known !== undefined) {
      setLoaded(current => current?.editionId === editionId && current.revision === revision
        ? current
        : { editionId, revision, value: known });
      return;
    }
    setLoaded(null);
    void video.metadata(editionId).then(value => {
      cache.set(key, value);
      if (live) setLoaded({ editionId, revision, value });
    }).catch(cause => { if (live) setError(errorMessage(cause)); });
    return () => { live = false; };
  }, [editionId, revision, enabled, key]);
  return { value: enabled && loaded?.editionId === editionId && loaded.revision === revision ? loaded.value : null, error };
}
