import { useEffect, useState } from 'react';
import { time } from '../playback/gateway';
import type { PlaybackController } from '../playback/usePlayback';
import { optical, type CdTrackMetadata } from './gateway';

interface TrackResult {
  mount: string;
  token: string;
  playlist: string;
  number: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
}

const cache = new Map<string, CdTrackMetadata[]>();
const pending = new Map<string, Promise<CdTrackMetadata[]>>();

function readTracks(mount: string, token: string) {
  const key = `${mount}:${token}`;
  const known = cache.get(key);
  if (known) return Promise.resolve(known);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = optical.cdMetadata(mount, token).then(tracks => {
    cache.set(key, tracks);
    return tracks;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

/** Current audio-CDs can be searched by song title, artist or album. */
export function CdTrackSearch({ query, player }: { query: string; player: PlaybackController }) {
  const [results, setResults] = useState<TrackResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const text = query.trim().toLocaleLowerCase();
    if (!text) {
      setResults([]); setLoading(false); setError('');
      return;
    }
    let active = true;
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      void optical.list().then(async drives => {
        const found: TrackResult[] = [];
        for (const drive of drives) {
          const medium = drive.medium;
          if (!medium || medium.kind !== 'audioCd') continue;
          let metadata: CdTrackMetadata[] = [];
          try { metadata = await readTracks(drive.mountPoint, medium.token); }
          catch { /* Still search the physical track numbers below. */ }
          for (const physical of medium.tracks) {
            const info = metadata.find(track => track.number === physical.number);
            const title = info?.title || `曲目 ${physical.number}`;
            const fields = [title, info?.artist || '', info?.album || ''];
            if (!fields.some(field => field.toLocaleLowerCase().includes(text))) continue;
            const playlist = medium.playlists.find(value => value === `cd-track:${physical.number}`);
            if (!playlist) continue;
            found.push({
              mount: drive.mountPoint, token: medium.token, playlist, number: physical.number,
              title, artist: info?.artist || '', album: info?.album || '', duration: physical.durationSeconds,
            });
          }
        }
        if (!active) return;
        setResults(found.slice(0, 12));
        setLoading(false);
      }).catch(cause => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      });
    }, 320);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  if (!query.trim() || (!loading && !results.length && !error)) return null;

  return <div className="cd-track-results" role="region" aria-label="CD 歌曲搜索结果">
    <div className="cd-track-results-heading"><span>CD 歌曲</span>{loading && <small>正在读取…</small>}</div>
    {!!results.length && <div className="cd-track-results-list">
      {results.map(result => <button type="button" key={`${result.mount}:${result.token}:${result.playlist}`}
        className="cd-track-result" onClick={() => void player.start(result.mount, result.token, result.playlist)}>
        <span className="cd-track-result-number">{result.number}</span>
        <span className="cd-track-result-text"><strong>{result.title}</strong>
          <small>{[result.artist, result.album].filter(Boolean).join(' · ') || 'CD'}</small></span>
        <time>{time(result.duration)}</time>
      </button>)}
    </div>}
    {!loading && !results.length && !error && <p className="cd-track-results-empty">没有匹配的 CD 歌曲。</p>}
    {error && <p className="cd-track-results-error" role="alert">{error}</p>}
  </div>;
}
