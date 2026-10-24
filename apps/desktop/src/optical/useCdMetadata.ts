import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../library/gateway';
import { optical, type CdTrackMetadata } from './gateway';

const pending = new Map<string, Promise<CdTrackMetadata[]>>();
const cache = new Map<string, CdTrackMetadata[]>();
const sameTracks = (left: CdTrackMetadata[], right: CdTrackMetadata[]) => JSON.stringify(left) === JSON.stringify(right);
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
  const cached = cache.get(key);
  const [result, setResult] = useState<{ key: string; tracks: CdTrackMetadata[]; loading: boolean; error: string }>(() =>
    cached ? { key, tracks: cached, loading: false, error: '' } : { key: '', tracks: [], loading: false, error: '' });
  useEffect(() => {
    if (!mount || !token) return;
    let active = true;
    const known = cache.get(key);
    setResult(previous => ({
      key,
      tracks: known || (previous.key === key ? previous.tracks : []),
      loading: !known,
      error: '',
    }));
    void request(mount, token, revision > 0).then(tracks => {
      if (!active) return;
      cache.set(key, tracks);
      setResult(previous => previous.key === key && sameTracks(previous.tracks, tracks)
        ? { ...previous, loading: false, error: '' }
        : { key, tracks, loading: false, error: '' });
    }).catch(cause => {
      if (active) setResult(previous => ({ ...previous, key, loading: false, error: errorMessage(cause) }));
    });
    return () => { active = false; };
  }, [mount, token, key, revision]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  return { ...(result.key === key ? result : { tracks: [], loading: Boolean(mount && token), error: '' }), refresh };
}
