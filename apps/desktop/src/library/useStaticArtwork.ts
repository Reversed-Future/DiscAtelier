import { useEffect, useState } from 'react';
import { loadStaticArtwork, peekStaticArtwork, type ArtworkSource } from './static-artwork-cache';

export function useStaticArtwork(source: ArtworkSource, assetId?: string | null) {
  const [result, setResult] = useState<{ source: ArtworkSource; id: string; url: string; failed: boolean } | null>(null);
  const ready = assetId ? peekStaticArtwork(source, assetId) : undefined;
  useEffect(() => {
    if (!assetId) return;
    let active = true;
    void loadStaticArtwork(source, assetId).then(
      value => { if (active) setResult({ source, id: assetId, url: value.url, failed: false }); },
      () => { if (active) setResult({ source, id: assetId, url: '', failed: true }); },
    );
    return () => { active = false; };
  }, [source, assetId]);
  const current = result?.source === source && result.id === assetId ? result : null;
  return { url: ready?.url || current?.url || '', loading: !!assetId && !ready && !current, failed: current?.failed || false };
}
