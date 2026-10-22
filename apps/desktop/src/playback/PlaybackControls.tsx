import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Select } from '../ui/Select';
import { time } from './gateway';
import type { PlaybackController } from './usePlayback';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => ({ id: String(rate), label: `${rate}×` }));

export function PlaybackControls({ player, onMenu, title, extended = false, showTitle = true, fullscreen = false, onToggleFullscreen }: {
  player: PlaybackController; onMenu?(): void; title?: string | null; extended?: boolean; showTitle?: boolean; fullscreen?: boolean; onToggleFullscreen?(): void;
}) {
  const s = player.snapshot;
  const [draft, setDraft] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const latest = useRef<number | null>(null), latestVolume = useRef<number | null>(null);
  useEffect(() => { setDraft(null); latest.current = null; setVolume(null); setRate(null); latestVolume.current = null; }, [s?.sessionId, s?.dvdTitle, s?.dvdMenu]);
  if (!s) return null;
  const duration = s.durationSeconds || 0;
  const position = draft ?? s.positionSeconds;
  const shownVolume = volume ?? s.volume ?? 100;
  const shownRate = rate ?? s.rate ?? 1;
  const loading = s.phase === 'loading', stopping = s.phase === 'stopping';
  async function commit() {
    const value = latest.current;
    latest.current = null;
    if (value !== null) await player.control({ action: 'seek', seconds: value });
    setDraft(null);
  }
  async function commitVolume() {
    const value = latestVolume.current;
    latestVolume.current = null;
    if (value !== null && !await player.control({ action: 'volume', volume: value })) setVolume(null);
  }
  async function changeRate(value: number) {
    setRate(value);
    if (!await player.control({ action: 'rate', rate: value })) setRate(null);
  }
  return <section className="playback-controls" aria-label="播放控制">
    {showTitle && <div className="playback-title"><strong>{title || s.title}</strong><span>{s.source.playlist === 'dvd-menu' ? s.dvdMenu ? 'DVD' : `DVD · ${s.dvdTitle}` : s.source.playlist.startsWith('cd-track:') ? 'CD' : s.source.playlist.startsWith('netease-song:') ? '网易云' : s.source.playlist}</span></div>}
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
      {extended && <>
        <label className="playback-volume">
          <span>音量</span>
          <input className="playback-volume-range" type="range" aria-label="音量" min="0" max="100" step="1" value={shownVolume}
            disabled={loading || stopping || player.busy} aria-valuetext={`${shownVolume}%`}
            style={{ '--volume': `${shownVolume}%` } as CSSProperties}
            onChange={event => { const value = Number(event.target.value); latestVolume.current = value; setVolume(value); }}
            onPointerUp={() => void commitVolume()} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) void commitVolume(); }}
            onPointerCancel={() => { latestVolume.current = null; setVolume(null); }} onBlur={() => { if (latestVolume.current !== null) void commitVolume(); }}/>
          <span>{shownVolume}</span>
        </label>
        <Select label="播放速度" value={String(shownRate)} options={RATES} disabled={loading || stopping || player.busy}
          onChange={id => void changeRate(Number(id))}/>
      </>}
      {!s.source.playlist.startsWith('cd-track:') && !s.source.playlist.startsWith('netease-song:') && <Select label="音轨" value={s.selectedAudio === null ? '' : String(s.selectedAudio)}
        options={s.audioTracks.map(track => ({ id: String(track.id), label: `${track.id} · ${track.title || track.language || track.codec || '音轨'}` }))}
        disabled={loading || stopping || player.busy || !s.audioTracks.length}
        onChange={id => void player.control({ action: 'audio', id: Number(id) })}/>}
      {onToggleFullscreen && <button type="button" className="text-button" disabled={stopping} onClick={onToggleFullscreen}>{fullscreen ? '退出全屏' : '全屏'}</button>}
      <button className="text-button playback-stop" disabled={stopping || player.busy} onClick={() => void player.control({ action: 'stop' })}>停止</button>
    </div>}
    {!player.active && onToggleFullscreen && <div className="playback-actions">
      <button type="button" className="text-button" onClick={onToggleFullscreen}>{fullscreen ? '退出全屏' : '全屏'}</button>
    </div>}
    {s.error && <p className="form-error" role="alert">{s.error}</p>}
  </section>;
}
