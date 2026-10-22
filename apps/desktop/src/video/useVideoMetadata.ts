import { useEffect, useState } from 'react';
import { errorMessage } from '../library/gateway';
import { video, type VideoMetadata } from './gateway';
export function useVideoMetadata(editionId: string, revision: number, enabled: boolean) {
  const [loaded, setLoaded] = useState<{editionId: string; revision: number; value: VideoMetadata | null} | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let live = true; setLoaded(null); setError('');
    if (enabled) void video.metadata(editionId).then(v => { if (live) setLoaded({ editionId, revision, value: v }); }).catch(e => { if (live) setError(errorMessage(e)); });
    return () => { live = false; };
  }, [editionId, revision, enabled]);
  return { value: enabled && loaded?.editionId === editionId && loaded.revision === revision ? loaded.value : null, error };
}
