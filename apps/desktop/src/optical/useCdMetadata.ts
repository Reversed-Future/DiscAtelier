import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../library/gateway';
import { optical, type CdTrackMetadata } from './gateway';

const pending = new Map<string, Promise<CdTrackMetadata[]>>();
function request(mount: string, token: string, refresh: boolean) {
  const key = JSON.stringify([mount, token]);
  let promise = pending.get(key);
  if (!promise) {
    promise = optical.cdMetadata(mount, token, refresh).finally(() => pending.delete(key));
    pending.set(key, promise);
  }
  return promise;
}

export function useCdMetadata(mount?: string, token?: string) {
  const key = JSON.stringify([mount, token]);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; tracks: CdTrackMetadata[]; loading: boolean; error: string }>({ key: '', tracks: [], loading: false, error: '' });
  useEffect(() => {
    if (!mount || !token) return;
    let active = true;
    setResult(previous => ({ key, tracks: previous.key === key ? previous.tracks : [], loading: true, error: '' }));
    void request(mount, token, revision > 0).then(tracks => {
      if (active) setResult({ key, tracks, loading: false, error: '' });
    }).catch(cause => {
      if (active) setResult(previous => ({ ...previous, key, loading: false, error: errorMessage(cause) }));
    });
    return () => { active = false; };
  }, [mount, token, key, revision]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  return { ...(result.key === key ? result : { tracks: [], loading: Boolean(mount && token), error: '' }), refresh };
}
