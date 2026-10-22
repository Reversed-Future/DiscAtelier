import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Select } from '../ui/Select';
import { time } from './gateway';
import type { PlaybackController } from './usePlayback';

export function PlaybackControls({ player, onMenu, title }: { player: PlaybackController; onMenu?(): void; title?: string | null }) {
  const s = player.snapshot;
  const [draft, setDraft] = useState<number | null>(null);
  const latest = useRef<number | null>(null);
  useEffect(() => { setDraft(null); latest.current = null; }, [s?.sessionId, s?.dvdTitle, s?.dvdMenu]);
  if (!s) return null;
  const duration = s.durationSeconds || 0;
  const position = draft ?? s.positionSeconds;
  const loading = s.phase === 'loading', stopping = s.phase === 'stopping';
  async function commit() {
    const value = latest.current;
    latest.current = null;
    if (value !== null) await player.control({ action: 'seek', seconds: value });
    setDraft(null);
  }
  return <section className="playback-controls" aria-label="播放控制">
    <div className="playback-title"><strong>{title || s.title}</strong><span>{s.source.playlist === 'dvd-menu' ? s.dvdMenu ? 'DVD' : `DVD · ${s.dvdTitle}` : s.source.playlist.startsWith('cd-track:') ? 'CD' : s.source.playlist.startsWith('netease-song:') ? '网易云' : s.source.playlist}</span></div>
    <input className="playback-seek" type="range" aria-label="播放进度" min="0" max={duration || 1} step="0.1"
      value={Math.min(position, duration)} disabled={!player.active || !s.seekable || !duration || loading || stopping || player.busy}
      aria-valuetext={`${time(position)} / ${time(duration)}`}
      style={{ '--progress': `${duration ? Math.min(100, position / duration * 100) : 0}%` } as CSSProperties}
      onChange={event => { const value = Number(event.target.value); latest.current = value; setDraft(value); }}
      onPointerUp={() => void commit()} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) void commit(); }}
      onPointerCancel={() => { latest.current = null; setDraft(null); }} onBlur={() => { if (latest.current !== null) void commit(); }}/>
    <div className="playback-times"><span>{time(position)}</span><span>{time(s.durationSeconds)}</span></div>
    {player.active && <div className="playback-actions">
      {s.source.playlist === 'dvd-menu' && <button className="text-button" disabled={loading || stopping || player.busy} onClick={async () => { if (await player.control({ action: 'menu', direction: 'root' })) onMenu?.(); }}>菜单</button>}
      <button className="text-button" disabled={loading || stopping || player.busy} onClick={() => void player.control({ action: 'pause', paused: !s.paused })}>
        {loading ? '读取中' : stopping ? '停止中' : s.paused ? '继续' : '暂停'}
      </button>
      {!s.source.playlist.startsWith('cd-track:') && !s.source.playlist.startsWith('netease-song:') && <Select label="音轨" value={s.selectedAudio === null ? '' : String(s.selectedAudio)}
        options={s.audioTracks.map(track => ({ id: String(track.id), label: `${track.id} · ${track.title || track.language || track.codec || '音轨'}` }))}
        disabled={loading || stopping || player.busy || !s.audioTracks.length}
        onChange={id => void player.control({ action: 'audio', id: Number(id) })}/>}
      <button className="text-button playback-stop" disabled={stopping || player.busy} onClick={() => void player.control({ action: 'stop' })}>停止</button>
    </div>}
    {s.error && <p className="form-error" role="alert">{s.error}</p>}
  </section>;
}
