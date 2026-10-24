import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../ui/Icon';
import { Select } from '../ui/Select';
import { optical, type DvdChapter } from '../optical/gateway';
import { time } from './gateway';
import type { PlaybackController } from './usePlayback';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => ({ id: String(rate), label: `${rate}×` }));
const chapterCache = new Map<string, DvdChapter[]>();

function useSmoothPosition(s: PlaybackController['snapshot'], active: boolean) {
  const [position, setPosition] = useState(0);
  const clock = useRef({ display: 0, last: 0, rate: 0, targetRate: 0, base: 0, baseAt: 0, playing: false, session: '' });
  useEffect(() => {
    if (!s) { setPosition(0); return; }
    const now = performance.now();
    const c = clock.current;
    const playing = active && !s.paused && (s.phase === 'playing' || s.phase === 'buffering');
    if (!c.last || c.session !== s.sessionId) {
      c.display = s.positionSeconds;
      c.rate = playing ? 1 : 0;
      c.session = s.sessionId;
    } else if (Math.abs(c.display - s.positionSeconds) > 1.8) {
      c.display = s.positionSeconds;
    }
    c.base = s.positionSeconds;
    c.baseAt = now;
    c.playing = playing;
    c.targetRate = playing ? 1 : 0;
    c.last = now;
    let frame = 0;
    const tick = () => {
      const at = performance.now();
      const dt = Math.min(0.05, Math.max(0, (at - c.last) / 1000));
      c.last = at;
      // Ease the clock rate in/out over 180ms on play/pause.
      const step = dt / 0.18;
      const difference = c.targetRate - c.rate;
      c.rate += Math.sign(difference) * Math.min(Math.abs(difference), step);
      c.display += dt * c.rate;
      const expected = c.base + (c.playing ? (at - c.baseAt) / 1000 : 0);
      const error = expected - c.display;
      if (Math.abs(error) > 1.5) c.display = expected;
      else c.display += error * Math.min(1, dt * 2.5);
      setPosition(c.display);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [s, active]);
  return position;
}

export function PlaybackControls({ player, onMenu, title, extended = false, showVolume = false, showTitle = true, fullscreen = false, onToggleFullscreen, onPrevious, onNext, canPrevious = true, canNext = true }: {
  player: PlaybackController; onMenu?(): void; title?: string | null; extended?: boolean; showVolume?: boolean; showTitle?: boolean; fullscreen?: boolean; onToggleFullscreen?(): void;
  onPrevious?(): void; onNext?(): void; canPrevious?: boolean; canNext?: boolean;
}) {
  const s = player.snapshot;
  const smoothPosition = useSmoothPosition(s, player.active);
  const [draft, setDraft] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [chapters, setChapters] = useState<DvdChapter[]>([]);
  const [hoveredChapter, setHoveredChapter] = useState(-1);
  const latest = useRef<number | null>(null), latestVolume = useRef<number | null>(null);
  const seekStart = useRef<number | null>(null), seekMoved = useRef(false);
  useEffect(() => {
    let live = true;
    setChapters([]);
    if (!s || s.source.playlist !== 'dvd-menu' || s.dvdMenu || !s.dvdTitle) return;
    const key = `${s.source.mediaToken}:${s.dvdTitle}`;
    const cached = chapterCache.get(key);
    if (cached) { setChapters(cached); return; }
    void optical.dvdChapters(s.source.mountPoint, s.source.mediaToken, s.dvdTitle)
      .then(value => { chapterCache.set(key, value); if (live) setChapters(value); })
      .catch(() => { /* 非标准 IFO 或光驱已变化时退回普通进度条。 */ });
    return () => { live = false; };
  }, [s?.sessionId, s?.source.playlist, s?.source.mountPoint, s?.source.mediaToken, s?.dvdTitle, s?.dvdMenu]);
  useEffect(() => { setDraft(null); latest.current = null; setVolume(null); setRate(null); latestVolume.current = null; setHoveredChapter(-1); seekStart.current = null; seekMoved.current = false; }, [s?.sessionId, s?.dvdTitle, s?.dvdMenu]);
  if (!s) return null;
  const duration = s.durationSeconds || 0;
  const position = draft ?? smoothPosition;
  function chapterAt(seconds: number) {
    let index = -1;
    for (let at = 0; at < chapters.length; at++) if (seconds >= chapters[at].startSeconds) index = at;
    return index;
  }
  const currentChapter = chapterAt(position);
  const chaptered = chapters.length > 1 && duration > 0;
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
    <div className="playback-seek-wrap">
      {chaptered && <div className="playback-segments" aria-hidden="true">
        {chapters.map((chapter, index) => {
          const start = Math.max(0, Math.min(100, chapter.startSeconds / duration * 100));
          const end = index + 1 < chapters.length ? Math.max(start, Math.min(100, chapters[index + 1].startSeconds / duration * 100)) : 100;
          return <span key={chapter.index} className={index === hoveredChapter ? 'active' : undefined} style={{ left: `${start}%`, width: `${end - start}%` }}/>;
        })}
      </div>}
      <input className="playback-seek" type="range" aria-label="播放进度" min="0" max={duration || 1} step="any"
        value={Math.min(position, duration)} disabled={!player.active || !s.seekable || !duration || loading || stopping || player.busy}
        aria-valuetext={`${time(position)} / ${time(duration)}`}
        style={{ '--progress': `${duration ? Math.min(100, position / duration * 100) : 0}%` } as CSSProperties}
        onChange={event => { const value = Number(event.target.value); latest.current = value; setDraft(value); }}
        onPointerDown={event => { seekStart.current = event.clientX; seekMoved.current = false; }}
        onPointerMove={event => {
          if (seekStart.current !== null && Math.abs(event.clientX - seekStart.current) > 3) seekMoved.current = true;
          if (!chaptered || !duration) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const index = chapterAt(Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration)));
          setHoveredChapter(current => current === index ? current : index);
        }}
        onPointerLeave={() => setHoveredChapter(-1)}
        onPointerUp={event => {
          const clicked = seekStart.current !== null && !seekMoved.current;
          seekStart.current = null;
          if (clicked && chaptered && duration) {
            const rect = event.currentTarget.getBoundingClientRect();
            const index = chapterAt(Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration)));
            if (index >= 0) {
              latest.current = null; setDraft(null);
              void player.control({ action: 'chapter', index: chapters[index].index });
              return;
            }
          }
          void commit();
        }}
        onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) void commit(); }}
        onPointerCancel={() => { seekStart.current = null; latest.current = null; setDraft(null); setHoveredChapter(-1); }} onBlur={() => { if (latest.current !== null) void commit(); }}/>
    </div>
    <div className="playback-times"><span>{time(position)}</span>{chaptered && <span>第 {currentChapter + 1} / {chapters.length} 章</span>}<span>{time(s.durationSeconds)}</span></div>
    {player.active && <div className="playback-actions">
      <div className="playback-transport">
        <button type="button" className="player-icon-button" aria-label="停止" title="停止" disabled={stopping || player.busy}
          onClick={() => void player.control({ action: 'stop' })}><Icon name="stop"/></button>
        {onPrevious && <button type="button" className="player-icon-button" aria-label="上一首" title="上一首"
          disabled={loading || stopping || player.busy || !canPrevious} onClick={onPrevious}><Icon name="previous"/></button>}
        <button type="button" className={`player-icon-button${loading || stopping ? ' is-spinning' : ''}`}
          aria-label={loading ? '读取中' : stopping ? '停止中' : s.paused ? '继续' : '暂停'}
          title={loading ? '读取中' : stopping ? '停止中' : s.paused ? '继续' : '暂停'}
          disabled={loading || stopping || player.busy} onClick={() => void player.control({ action: 'pause', paused: !s.paused })}>
          <Icon name={loading || stopping ? 'disc' : s.paused ? 'play' : 'pause'}/>
        </button>
        {onNext && <button type="button" className="player-icon-button" aria-label="下一首" title="下一首"
          disabled={loading || stopping || player.busy || !canNext} onClick={onNext}><Icon name="next"/></button>}
      </div>
      <div className="playback-options">
        {s.source.playlist === 'dvd-menu' && <button type="button" className="player-icon-button" aria-label="菜单" title="菜单"
          disabled={loading || stopping || player.busy} onClick={async () => { if (await player.control({ action: 'menu', direction: 'root' })) onMenu?.(); }}><Icon name="menu"/></button>}
        {(extended || showVolume) && <div className="playback-volume">
          <button type="button" className="player-icon-button" aria-label={`音量 ${shownVolume}%`} title={`音量 ${shownVolume}%`}>
            <Icon name={shownVolume > 0 ? 'volume' : 'mute'}/>
          </button>
          <div className="playback-volume-flyout" role="group" aria-label="音量">
            <input className="playback-volume-range" type="range" aria-label="音量" min="0" max="100" step="1" value={shownVolume}
              disabled={loading || stopping || player.busy} aria-valuetext={`${shownVolume}%`}
              style={{ '--volume': `${shownVolume}%` } as CSSProperties}
              onChange={event => { const value = Number(event.target.value); latestVolume.current = value; setVolume(value); }}
              onPointerUp={() => void commitVolume()} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) void commitVolume(); }}
              onPointerCancel={() => { latestVolume.current = null; setVolume(null); }} onBlur={() => { if (latestVolume.current !== null) void commitVolume(); }}/>
            <span>{shownVolume}</span>
          </div>
        </div>}
        {extended && <Select label="播放速度" value={String(shownRate)} options={RATES} disabled={loading || stopping || player.busy}
          onChange={id => void changeRate(Number(id))}/>}
        {!s.source.playlist.startsWith('cd-track:') && !s.source.playlist.startsWith('netease-song:') && <Select label="音轨" value={s.selectedAudio === null ? '' : String(s.selectedAudio)}
          options={s.audioTracks.map(track => ({ id: String(track.id), label: `${track.id} · ${track.title || track.language || track.codec || '音轨'}` }))}
          disabled={loading || stopping || player.busy || !s.audioTracks.length}
          onChange={id => void player.control({ action: 'audio', id: Number(id) })}/>}
        {onToggleFullscreen && <button type="button" className="player-icon-button" aria-label={fullscreen ? '退出全屏' : '全屏'} title={fullscreen ? '退出全屏' : '全屏'}
          disabled={stopping} onClick={onToggleFullscreen}><Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'}/></button>}
      </div>
    </div>}
    {!player.active && onToggleFullscreen && <div className="playback-actions">
      <div className="playback-options">
        <button type="button" className="player-icon-button" aria-label={fullscreen ? '退出全屏' : '全屏'} title={fullscreen ? '退出全屏' : '全屏'}
          onClick={onToggleFullscreen}><Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'}/></button>
      </div>
    </div>}
    {s.error && <p className="form-error" role="alert">{s.error}</p>}
  </section>;
}
