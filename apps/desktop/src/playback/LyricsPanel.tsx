import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { errorMessage } from '../library/gateway';
import type { PlaybackController } from './usePlayback';
import { activeLyric, lyricLines, type Lyrics } from './lyrics';
import '../styles/lyrics.css';

const cache = new Map<number, Lyrics>();
export function LyricsPanel({ songId, player, resolving = false }: { songId: number | null; player: PlaybackController; resolving?: boolean }) {
  const [result, setResult] = useState<{ id: number; value: Lyrics } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const list = useRef<HTMLDivElement>(null), browsing = useRef(0);
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    setError(''); setResult(null); setFollowing(true); browsing.current = 0;
    if (!songId) return;
    let live = true;
    const saved = cache.get(songId);
    if (saved) { setResult({ id: songId, value: saved }); return; }
    void invoke<Lyrics>('netease_lyrics', { id: songId }).then(value => {
      if (cache.size >= 30) cache.delete(cache.keys().next().value!);
      cache.set(songId, value);
      if (live) setResult({ id: songId, value });
    }).catch(cause => { if (live) setError(errorMessage(cause)); });
    return () => { live = false; };
  }, [songId, retry]);
  const parsed = useMemo(() => result?.id === songId ? lyricLines(result.value) : { lines: [], plain: [] }, [result, songId]);
  const index = activeLyric(parsed.lines, player.snapshot?.positionSeconds || 0);
  useEffect(() => {
    if (performance.now() < browsing.current) return;
    setFollowing(true);
    const root = list.current, line = root?.querySelector<HTMLElement>('[aria-current="true"]');
    if (root && line) root.scrollTo({ top: root.scrollTop + line.getBoundingClientRect().top - root.getBoundingClientRect().top - root.clientHeight / 2 + line.clientHeight / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [index, following, songId]);
  const loading = resolving || (!!songId && result?.id !== songId && !error);
  return <div className="lyrics-panel">
    <div className="lyrics-scroll" ref={list} aria-label="歌词" onWheel={() => { browsing.current = performance.now() + 6000; setFollowing(false); }} onTouchMove={() => { browsing.current = performance.now() + 6000; setFollowing(false); }}>
      {loading ? <p className="setting-hint" role="status">正在读取歌词…</p> : error ? <p className="setting-hint" role="status">{error} <button className="text-button" onClick={() => setRetry(v => v + 1)}>重试</button></p>
        : !songId ? <p className="setting-hint">这首歌尚未关联网易云资料</p>
        : parsed.lines.length ? parsed.lines.map((line, i) => <button key={`${line.seconds}:${i}`} className="lyric-line" aria-current={index === i ? 'true' : undefined} disabled={!player.active || !player.snapshot?.seekable || player.busy}
          onClick={() => void player.control({ action: 'seek', seconds: line.seconds })}><span>{line.text || '♪'}</span>{line.translation && line.translation !== line.text && <small>{line.translation}</small>}</button>)
        : parsed.plain.length ? parsed.plain.map((line, i) => <p className="lyric-line" key={i}>{line}</p>) : <p className="setting-hint">暂无歌词</p>}
    </div>
    <div className="lyrics-caption"><span>网易云歌词</span>{!following && <button className="text-button" onClick={() => { browsing.current = 0; setFollowing(true); }}>回到当前</button>}</div>
  </div>;
}
