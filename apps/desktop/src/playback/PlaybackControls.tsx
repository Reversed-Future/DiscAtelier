import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../ui/Icon';
import { Select } from '../ui/Select';
import { optical, type DvdChapter } from '../optical/gateway';
import { time } from './gateway';
import { EqualizerQuick } from './EqualizerQuick';
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
  // Volume changes replace the snapshot object but do not change playback
  // position. Do not restart the smooth clock for those updates.
  }, [s?.sessionId, s?.positionSeconds, s?.paused, s?.phase, active]);
  return position;
}

export function PlaybackControls({ player, onMenu, title, extended = false, showVolume = false, showTitle = true, showEqualizer = false, fullscreen = false, onToggleFullscreen, onPrevious, onNext, canPrevious = true, canNext = true, repeat, onRepeat, navigation = 'track', onToggleEpisodes, episodesOpen = false, volumeLayout = 'horizontal' }: {
  player: PlaybackController; onMenu?(): void; title?: string | null; extended?: boolean; showVolume?: boolean; showTitle?: boolean; showEqualizer?: boolean; fullscreen?: boolean; onToggleFullscreen?(): void;
  onPrevious?(): void; onNext?(): void; canPrevious?: boolean; canNext?: boolean; repeat?: 'list' | 'one'; onRepeat?(): void;
  navigation?: 'track' | 'episode'; onToggleEpisodes?(): void; episodesOpen?: boolean;
  volumeLayout?: 'horizontal' | 'vertical';
}) {
  const s = player.snapshot;
  const equalizerAvailable = showEqualizer && !!s;
  const previousLabel = navigation === 'episode' ? '上一集' : '上一首', nextLabel = navigation === 'episode' ? '下一集' : '下一首';
  const smoothPosition = useSmoothPosition(s, player.active);
  const [draft, setDraft] = useState<number | null>(null);
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [chapters, setChapters] = useState<DvdChapter[]>([]);
  const [hoveredChapter, setHoveredChapter] = useState(-1);
  const latest = useRef<number | null>(null), latestVolume = useRef<number | null>(null);
  const lastVolume = useRef(100);
  const seekStart = useRef<number | null>(null), seekMoved = useRef(false);
  const actions = useRef<HTMLDivElement>(null), seek = useRef<HTMLDivElement>(null);
  const [popoverMax, setPopoverMax] = useState(60);
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
  useEffect(() => { setDraft(null); setPendingSeek(null); latest.current = null; setRate(null); latestVolume.current = null; setHoveredChapter(-1); seekStart.current = null; seekMoved.current = false; }, [s?.sessionId, s?.dvdTitle, s?.dvdMenu]);
  useEffect(() => { if (s?.volume && s.volume > 0) lastVolume.current = s.volume; }, [s?.volume]);
  useEffect(() => {
    if (pendingSeek === null) return;
    const actual = s?.positionSeconds;
    // Keep the slider at the clicked target until the backend has actually
    // seeked. Polling can still report the old position for a few hundred ms.
    if (actual !== undefined && Math.abs(actual - pendingSeek) < 0.75) {
      setPendingSeek(null);
      setDraft(null);
    }
  }, [s?.positionSeconds, pendingSeek]);
  useEffect(() => {
    if (pendingSeek === null) return;
    const timer = setTimeout(() => { setPendingSeek(null); setDraft(null); }, 2500);
    return () => clearTimeout(timer);
  }, [pendingSeek]);
  useLayoutEffect(() => {
    const measure = () => {
      const action = actions.current, track = seek.current;
      if (!action || !track) return;
      // Keep every upward popover below the progress bar, including during footer expansion.
      const value = Math.max(36, Math.round(action.getBoundingClientRect().top - track.getBoundingClientRect().top - 8));
      setPopoverMax(current => current === value ? current : value);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (actions.current) observer.observe(actions.current);
    if (seek.current) observer.observe(seek.current);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [s?.sessionId, s?.phase, showTitle, fullscreen, episodesOpen]);
  if (!s) return null;
  const menu = s.source.playlist === 'dvd-menu' || s.source.playlist === 'bd-menu';
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
    if (value === null) return;
    setDraft(value);
    setPendingSeek(value);
    if (!await player.control({ action: 'seek', seconds: value })) {
      setPendingSeek(null);
      setDraft(null);
    }
  }
  function seekSecondsAt(event: ReactPointerEvent<HTMLInputElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration));
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
  function toggleMute() {
    const next = shownVolume > 0 ? 0 : (lastVolume.current || 100);
    if (shownVolume > 0) lastVolume.current = shownVolume;
    setVolume(next);
    latestVolume.current = next;
    player.setVolume(next);
  }
  return <section className="playback-controls" aria-label="播放控制"
    style={{ '--playback-popover-max': `${popoverMax}px` } as CSSProperties}>
    {showTitle && <div className="playback-title"><strong>{title || s.title}</strong><span>{s.source.playlist === 'bd-menu' ? s.dvdMenu ? 'BD 菜单' : 'BD' : s.source.playlist === 'dvd-menu' ? s.dvdMenu ? 'DVD 菜单' : `DVD · ${s.dvdTitle}` : s.source.playlist.startsWith('cd-track:') ? 'CD' : s.source.playlist.startsWith('netease-song:') ? '网易云' : s.source.playlist}</span></div>}
    <div className="playback-seek-wrap" ref={seek}>
      {chaptered && <div className="playback-segments" aria-hidden="true">
        {chapters.map((chapter, index) => {
          const start = Math.max(0, Math.min(100, chapter.startSeconds / duration * 100));
          const end = index + 1 < chapters.length ? Math.max(start, Math.min(100, chapters[index + 1].startSeconds / duration * 100)) : 100;
          return <span key={chapter.index} className={index === hoveredChapter ? 'active' : undefined} style={{ left: `${start}%`, width: `${end - start}%` }}/>;
        })}
      </div>}
      <input className="playback-seek" type="range" aria-label="播放进度" min="0" max={duration || 1} step="any"
        value={Math.min(position, duration)} disabled={!player.active || !s.seekable || !duration}
        aria-valuetext={`${time(position)} / ${time(duration)}`}
        style={{ '--progress': `${duration ? Math.min(100, position / duration * 100) : 0}%` } as CSSProperties}
        onChange={event => { const value = Number(event.target.value); latest.current = value; setPendingSeek(null); setDraft(value); }}
        onPointerDown={event => { setPendingSeek(null); seekStart.current = event.clientX; seekMoved.current = false; }}
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
            const index = chapterAt(seekSecondsAt(event));
            if (index >= 0) {
              latest.current = null;
              setDraft(chapters[index].startSeconds);
              setPendingSeek(chapters[index].startSeconds);
              void player.control({ action: 'chapter', index: chapters[index].index });
              return;
            }
          }
          // Some WebView2 range implementations emit change after pointerup.
          // Derive the target from the pointer so commit never clears the
          // optimistic position before that change arrives.
          if (clicked) {
            const value = seekSecondsAt(event);
            latest.current = value;
            setDraft(value);
          }
          void commit();
        }}
        onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) void commit(); }}
        onPointerCancel={() => { seekStart.current = null; latest.current = null; setPendingSeek(null); setDraft(null); setHoveredChapter(-1); }} onBlur={() => { if (latest.current !== null) void commit(); }}/>
    </div>
    <div className="playback-times"><span>{time(position)}</span>{chaptered && <span>第 {currentChapter + 1} / {chapters.length} 章</span>}<span>{time(s.durationSeconds)}</span></div>
    {player.active && <div className="playback-actions" ref={actions}>
      <div className="playback-transport">
        <button type="button" className="player-icon-button" aria-label="停止" title="停止" disabled={stopping}
          onClick={() => void player.control({ action: 'stop' })}><Icon name="stop"/></button>
        {onPrevious && <button type="button" className="player-icon-button" aria-label={previousLabel} title={previousLabel}
          disabled={!canPrevious} onClick={onPrevious}><Icon name="previous"/></button>}
        <button type="button" className={`player-icon-button${loading || stopping ? ' is-spinning' : ''}`}
          aria-label={loading ? '读取中' : stopping ? '停止中' : s.paused ? '继续' : '暂停'}
          title={loading ? '读取中' : stopping ? '停止中' : s.paused ? '继续' : '暂停'}
          disabled={loading || stopping} onClick={() => void player.control({ action: 'pause', paused: !s.paused })}>
          <Icon name={loading || stopping ? 'disc' : s.paused ? 'play' : 'pause'}/>
        </button>
        {onNext && <button type="button" className="player-icon-button" aria-label={nextLabel} title={nextLabel}
          disabled={!canNext} onClick={onNext}><Icon name="next"/></button>}
      </div>
      <div className="playback-options">
        {menu && <button type="button" className="player-icon-button" aria-label="菜单" title="菜单"
          disabled={stopping} onClick={async () => { if (await player.control({ action: 'menu', direction: 'root' })) onMenu?.(); }}><Icon name="menu"/></button>}
        {(extended || showVolume) && <div className="playback-volume">
          <button type="button" className="player-icon-button playback-volume-toggle"
            aria-label={shownVolume > 0 ? `静音（当前音量 ${shownVolume}%）` : '取消静音'} title={shownVolume > 0 ? '静音' : '取消静音'}
            aria-pressed={shownVolume === 0} disabled={stopping} onClick={toggleMute}>
            <Icon name={shownVolume > 0 ? 'volume' : 'mute'}/>
          </button>
          <div className={`playback-volume-flyout${volumeLayout === 'vertical' ? ' is-vertical' : ''}`} role="group" aria-label="音量">
            <input className="playback-volume-range" type="range" aria-label="音量" min="0" max="100" step="1" value={shownVolume}
              disabled={stopping} aria-valuetext={`${shownVolume}%`}
              style={{ '--volume': `${shownVolume}%` } as CSSProperties}
              onChange={event => {
                const value = Number(event.target.value);
                latestVolume.current = value;
                if (value > 0) lastVolume.current = value;
                setVolume(value);
                player.setVolume(value);
              }}
              onPointerUp={() => void commitVolume()} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) void commitVolume(); }}
              onPointerCancel={() => { latestVolume.current = null; setVolume(null); }} onBlur={() => { if (latestVolume.current !== null) void commitVolume(); }}/>
            <span>{shownVolume}</span>
          </div>
        </div>}
        {extended && <Select label="播放速度" value={String(shownRate)} options={RATES} columns={3} placement="above"
          maxHeight={Math.max(popoverMax, 82)} disabled={stopping}
          onChange={id => void changeRate(Number(id))}/>}
        {extended && <Select label="音轨" value={s.selectedAudio === null ? '' : String(s.selectedAudio)}
          options={s.audioTracks.map(track => ({ id: String(track.id), label: `${track.id} · ${track.title || track.language || track.codec || '音轨'}` }))}
          columns={2} maxHeight={popoverMax} placement="above"
          disabled={stopping || !s.audioTracks.length}
          onChange={id => void player.control({ action: 'audio', id: Number(id) })}/>}
        {onToggleEpisodes && <button type="button" className="player-icon-button playback-episodes-toggle" aria-label="选集" title="选集"
          aria-pressed={episodesOpen} disabled={stopping} onClick={onToggleEpisodes}><Icon name="list"/></button>}
        {onToggleFullscreen && <button type="button" className="player-icon-button" aria-label={fullscreen ? '退出全屏' : '全屏'} title={fullscreen ? '退出全屏' : '全屏'}
          disabled={stopping} onClick={onToggleFullscreen}><Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'}/></button>}
        {equalizerAvailable && <EqualizerQuick onEdit={() => window.dispatchEvent(new CustomEvent('discatelier:open-settings', { detail: 'audio' }))}/>}
        {onRepeat && <button type="button" className="player-icon-button playback-repeat" aria-label={repeat === 'one' ? '单曲循环，切换为列表循环' : '列表循环，切换为单曲循环'}
          title={repeat === 'one' ? '单曲循环' : '列表循环'} disabled={stopping} onClick={onRepeat}><Icon name={repeat === 'one' ? 'repeatOne' : 'repeat'}/></button>}
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
