import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { errorMessage } from '../library/gateway';
import { optical, type MenuRecognition, type MusicBrainzRelease, type OpticalCandidate, type OpticalDrive, type OpticalMedium, type OpticalPresence, type PlaybackDiagnostic } from './gateway';
import { PlaybackHistory } from '../playback/PlaybackHistory';
import type { PlaybackController } from '../playback/usePlayback';
import { CdDriveControls } from './CdDriveControls';
import { MenuRecognitionStatus } from './MenuRecognitionStatus';
import { MenuRecognitionResult } from './MenuRecognitionResult';
import { OpticalAssociationEditor } from './OpticalAssociationEditor';
import { integrations } from '../integrations/gateway';
import { formatDuration, loadBlurayPlaylists, longestPlaylist, playlistOptionLabel, type BlurayPlaylist } from './blurayPlaylists';

type DiscLookup = 'loading' | 'ready' | 'error';
const excludedTitleMatches = new Set<string>();
let cachedDrives: OpticalDrive[] | null = null;
let cachedPresence: OpticalPresence[] | null = null;
let cachedSuggestions: Record<string, OpticalCandidate[]> = {};
let cachedDiscReleases: Record<string, MusicBrainzRelease[]> = {};
let cachedDiscLookup: Record<string, DiscLookup> = {};
let cachedLoaded = false;
// Survives closing and reopening the panel, so one inserted disc is not sent
// to the AI repeatedly.
const autoRecognized = new Set<string>();
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export function OpticalPanel({ onClose, player }: { onClose(): void; player: PlaybackController }) {
  const [drives, setDrives] = useState<OpticalDrive[]>(() => cachedDrives || []);
  const [presence, setPresence] = useState<OpticalPresence[]>(() => cachedPresence || []);
  const [suggestions, setSuggestions] = useState<Record<string, OpticalCandidate[]>>(() => cachedSuggestions);
  const suggestionsRef = useRef<Record<string, OpticalCandidate[]>>(cachedSuggestions);
  const [associate, setAssociate] = useState<{ drive: OpticalDrive; medium: OpticalMedium; label: string } | null>(null);
  const [recognized, setRecognized] = useState<MenuRecognition | null>(null);
  const [recognitionTarget, setRecognitionTarget] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [recognitionProgress, setRecognitionProgress] = useState('');
  const [recognitionError, setRecognitionError] = useState('');
  const [discReleases, setDiscReleases] = useState<Record<string, MusicBrainzRelease[]>>(() => cachedDiscReleases);
  const [discLookup, setDiscLookup] = useState<Record<string, DiscLookup>>(() => cachedDiscLookup);
  const discQueried = useRef(new Set(Object.entries(cachedDiscReleases).filter(([, value]) => value.length).map(([key]) => key)));
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(cachedLoaded);
  const [error, setError] = useState('');
  const [report, setReport] = useState<{ mount: string; token: string; playlist: string; value: PlaybackDiagnostic } | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [details, setDetails] = useState(false);
  const [history, setHistory] = useState(false);
  const [playlistRows, setPlaylistRows] = useState<Record<string, BlurayPlaylist[]>>({});
  const [aiReady, setAiReady] = useState(false);
  const [autoRecognize, setAutoRecognize] = useState(true);
  const mounted = useRef(false), running = useRef(false);
  const titlesChecked = useRef(new Set<string>());
  const playlistQueried = useRef(new Set<string>());
  useEffect(() => {
    let live = true;
    void integrations.settings().then(status => {
      if (!live) return;
      setAiReady(!!status.settings.aiBaseUrl.trim() && !!status.settings.aiModel.trim());
      setAutoRecognize(status.settings.autoRecognizeMenu ?? true);
    }).catch(() => { /* 未配置 AI 时只提供手动识别。 */ });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    for (const drive of drives) {
      const medium = drive.medium;
      if (!medium || medium.kind !== 'bluray') continue;
      const key = `${drive.mountPoint}:${medium.token}`;
      if (playlistQueried.current.has(key)) continue;
      playlistQueried.current.add(key);
      void loadBlurayPlaylists(drive.mountPoint, medium.token).then(rows => {
        if (!mounted.current) return;
        setPlaylistRows(current => ({ ...current, [medium.token]: rows }));
      }).catch(() => {
        if (!mounted.current) return;
        setPlaylistRows(current => ({ ...current, [medium.token]: [] }));
      });
    }
  }, [drives]);
  useEffect(() => {
    // The first file on a disc is often a logo or a short segment. Start on the
    // longest playlist unless the user already made an explicit choice.
    for (const drive of drives) {
      const medium = drive.medium;
      if (!medium || medium.kind !== 'bluray') continue;
      const main = longestPlaylist(playlistRows[medium.token] || []);
      if (!main) continue;
      const key = `${drive.mountPoint}:${medium.token}`;
      setSelected(current => current[key] && medium.playlists.includes(current[key])
        ? current
        : current[key] === main.playlist ? current : { ...current, [key]: main.playlist });
    }
  }, [drives, playlistRows]);
  useEffect(() => {
    if (running.current || !loaded || history || !aiReady || !autoRecognize || recognizing || busy || player.active || player.busy) return;
    for (const drive of drives) {
      const medium = drive.medium;
      if (!medium || (medium.kind !== 'dvdVideo' && medium.kind !== 'bluray')) continue;
      if (presence.some(value => value.mediaToken === medium.token)) continue;
      if (autoRecognized.has(medium.token)) continue;
      autoRecognized.add(medium.token);
      void recognizeMenu(drive, medium, true);
      break;
    }
  }, [drives, presence, loaded, history, aiReady, autoRecognize, recognizing, busy, player.active, player.busy]);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    if (mounted.current) setBusy(true);
    try {
      const value = await optical.list();
      let links: OpticalPresence[] = [];
      const tokens = value.flatMap(({ medium }) => medium?.discTitle && !titlesChecked.current.has(medium.token)
        && !excludedTitleMatches.has(medium.token) ? [medium.token] : []);
      try {
        links = await optical.presence(tokens);
        tokens.forEach(token => titlesChecked.current.add(token));
      } catch { /* 收藏库不可用时仍显示光驱。 */ }
      const suggested = { ...suggestionsRef.current };
      for (const drive of value) {
        if (!drive.medium || suggested[drive.medium.token]) continue;
        try { suggested[drive.medium.token] = await optical.candidates(drive.medium.label, '', drive.medium.discTitle); }
        catch { /* 单个光驱识别失败不影响其他光驱。 */ }
      }
      suggestionsRef.current = suggested;
      if (!same(cachedDrives, value)) { cachedDrives = value; if (mounted.current) setDrives(value); }
      if (!same(cachedPresence, links)) { cachedPresence = links; if (mounted.current) setPresence(links); }
      if (!same(cachedSuggestions, suggested)) { cachedSuggestions = suggested; if (mounted.current) setSuggestions(suggested); }
      cachedLoaded = true;
      if (mounted.current) { setError(''); setLoaded(true); }
    } catch (cause) { if (mounted.current) setError(errorMessage(cause)); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; void refresh();
    // Only while the panel is open. No overlapping queries or permanent spin-up.
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [refresh]);
  useEffect(() => {
    for (const drive of drives) {
      const medium = drive.medium;
      const discId = medium?.kind === 'audioCd' ? medium.discId : null;
      if (!medium || !discId || discQueried.current.has(discId)) continue;
      discQueried.current.add(discId);
      if (cachedDiscLookup[discId] !== 'loading') {
        cachedDiscLookup = { ...cachedDiscLookup, [discId]: 'loading' };
        if (mounted.current) setDiscLookup(current => ({ ...current, [discId]: 'loading' }));
      }
      void optical.musicbrainz(discId).then(releases => {
        if (!mounted.current) return;
        const nextReleases = { ...cachedDiscReleases, [discId]: releases };
        if (!same(cachedDiscReleases, nextReleases)) {
          cachedDiscReleases = nextReleases;
          setDiscReleases(nextReleases);
        }
        if (cachedDiscLookup[discId] !== 'ready') {
          cachedDiscLookup = { ...cachedDiscLookup, [discId]: 'ready' };
          setDiscLookup(current => ({ ...current, [discId]: 'ready' }));
        }
        const release = releases[0];
        if (!release) return;
        void optical.candidates(release.title, '').then(rows => {
          if (!mounted.current) return;
          const nextSuggestions = { ...cachedSuggestions, [medium.token]: rows };
          if (!same(cachedSuggestions, nextSuggestions)) {
            cachedSuggestions = nextSuggestions;
            suggestionsRef.current = nextSuggestions;
            setSuggestions(nextSuggestions);
          }
        }).catch(() => { /* 本地候选失败时仍可手动搜索关联。 */ });
      }).catch(() => {
        discQueried.current.delete(discId);
        if (!mounted.current) return;
        cachedDiscLookup = { ...cachedDiscLookup, [discId]: 'error' };
        setDiscLookup(current => ({ ...current, [discId]: 'error' }));
      });
    }
  }, [drives]);
  function openAssociate(drive: OpticalDrive, medium: OpticalMedium, label = medium.discTitle || medium.label) {
    setAssociate({ drive, medium, label });
  }
  async function recognizeMenu(drive: OpticalDrive, medium: OpticalMedium, automatic = false) {
    if (running.current || recognizing || busy || !medium || player.active || player.busy) return;
    running.current = true;
    setRecognitionTarget(`${drive.mountPoint}:${medium.token}`); setRecognized(null);
    setRecognizing(true); setCapturing(true); setRecognitionError('');
    setRecognitionProgress(automatic ? '已检测到视频光盘，正在自动识别菜单…' : '正在准备菜单识别…');
    try {
      const result = await optical.menuRecognize(drive.mountPoint, medium.token, medium.label, medium.kind === 'dvdVideo' ? 'dvd' : 'bluray', message => {
        if (!mounted.current) return;
        // The capture session releases the drive before the AI request starts.
        if (message.startsWith('截图已完成')) setCapturing(false);
        setRecognitionProgress(message);
      });
      if (mounted.current) setRecognized(result);
    } catch (cause) {
      if (mounted.current) setRecognitionError(errorMessage(cause));
    } finally {
      running.current = false;
      if (mounted.current) { setRecognizing(false); setCapturing(false); await refresh(); }
    }
  }
  async function unbind(medium: OpticalMedium) {
    setBusy(true); setError('');
    try { await optical.unbind(medium.token); excludedTitleMatches.add(medium.token); autoRecognized.add(medium.token); setRecognized(value => value ? { ...value, associationMessage: '已取消关联，可重新选择收藏及 Disc。' } : value); await refresh(); }
    catch (cause) { if (mounted.current) setError(errorMessage(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function probe(drive: OpticalDrive, playlist: string) {
    if (running.current || !drive.medium) return;
    running.current = true; setBusy(true); setError(''); setReport(null); setDetails(false);
    try {
      const value = await optical.probe(drive.mountPoint, drive.medium.token, playlist);
      if (mounted.current) setReport({ mount: drive.mountPoint, token: drive.medium.token, playlist, value });
    } catch (cause) { if (mounted.current) setError(errorMessage(cause)); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  async function eject(drive: OpticalDrive) {
    if (recognizing || busy || player.active || player.busy) return;
    setBusy(true); setError('');
    try {
      await optical.eject(drive.mountPoint);
      await new Promise(resolve => setTimeout(resolve, 900));
      if (mounted.current) await refresh();
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return <Modal title={history ? '播放历史' : '光驱'} onClose={onClose} className="optical-panel">
    <div className="optical-toolbar">
      <div className="optical-toolbar-group">
        {player.active && <button className="solid-button" onClick={player.show}>返回播放</button>}
      </div>
      <div className="optical-toolbar-group">
        <button className="text-button" onClick={() => setHistory(value => !value)}>{history ? '返回光驱' : '播放历史'}</button>
        {!history && <button className="text-button" disabled={busy || recognizing} onClick={() => void refresh()}>{busy ? '读取中' : '刷新'}</button>}
      </div>
    </div>
    {history ? <PlaybackHistory drives={drives} player={player} onResume={() => setHistory(false)}/> : <>
    {loaded && !drives.length && <p className="optical-empty">未连接光驱</p>}
    {drives.map(drive => {
      const medium = drive.medium;
      const selectionKey = `${drive.mountPoint}:${medium?.token || ''}`;
      const blurayRows = medium?.kind === 'bluray' ? playlistRows[medium.token] : undefined;
      const mainPlaylist = blurayRows ? longestPlaylist(blurayRows) : null;
      const fallbackPlaylist = mainPlaylist?.playlist || medium?.playlists[0] || '';
      const playlist = medium?.playlists.includes(selected[selectionKey]) ? selected[selectionKey] : fallbackPlaylist;
      const playlistInfo = blurayRows?.find(row => row.playlist === playlist) ?? mainPlaylist;
      const playlistOptions = medium?.kind === 'bluray'
        ? medium.playlists.map(name => {
            const row = blurayRows?.find(value => value.playlist === name);
            return { id: name, label: row ? playlistOptionLabel(row) : name };
          })
        : [];
      const diagnostic = report?.mount === drive.mountPoint && report.token === medium?.token && report.playlist === playlist ? report.value : null;
      const linked = medium ? presence.find(value => value.mediaToken === medium.token) : undefined;
      const suggested = medium ? suggestions[medium.token]?.[0] : undefined;
      const discId = medium?.kind === 'audioCd' ? medium.discId : null;
      const release = discId ? discReleases[discId]?.[0] : undefined;
      const lookup = discId ? discLookup[discId] : undefined;
      const targeted = recognitionTarget === selectionKey;
      const recognizeLabel = recognizing && targeted ? '识别中…' : targeted && (recognized || recognitionError) ? '重新识别' : '识别菜单';
      return <section className="optical-drive" key={drive.mountPoint}>
        <div className="optical-heading">
          <strong>{drive.name}</strong>
          <div className="optical-heading-right">
            <span>{drive.mountPoint}</span>
            <button type="button" className="text-button optical-eject" disabled={recognizing || busy || player.active || player.busy}
              title={player.active ? '请先停止播放再弹出光驱' : '弹出光驱托盘'} onClick={() => void eject(drive)}>
              <Icon name="eject"/>弹出
            </button>
          </div>
        </div>
        <p className="optical-medium">{drive.status === 'empty' ? '未放入光盘' : !medium ? '暂不可读取' : medium.kind === 'audioCd'
          ? <>CD · {release ? <><strong>{release.title}</strong>{release.artist ? ` · ${release.artist}` : ''}</> : `${medium.tracks.length} 首`}</>
          : medium.kind === 'bluray' ? `BD · ${medium.discTitle && medium.discTitle !== medium.label ? `${medium.discTitle}${medium.label ? ` [${medium.label}]` : ''}` : medium.label}` : medium.kind === 'dvdVideo' ? `DVD · ${medium.label}` : medium.label || '光盘'}</p>
        {medium && <div className="optical-link">
          <span title={discId ? `MusicBrainz CD ID ${discId}` : undefined}>{linked
            ? <>已关联：<strong>{linked.title}{linked.discLabel ? ` · ${linked.discLabel}` : ''}</strong>{linked.playing ? ' · 正在播放' : ''}</>
            : suggested && suggested.matchKind !== 'creator' && suggested.score >= 65
                ? <>识别为：<strong>{suggested.title}</strong> · 未关联</>
                : release ? <>MusicBrainz 已识别 · 未关联</>
                  : lookup === 'loading' ? 'MusicBrainz 识别中…'
                    : lookup === 'error' ? 'MusicBrainz 查询失败'
                      : '未关联收藏'}</span>
          <div className="optical-link-actions">
            <button type="button" className="text-button" disabled={busy || recognizing} onClick={() => openAssociate(drive, medium, release?.title)}>{linked ? '更换关联' : '关联库'}</button>
            {linked && <button type="button" className="text-button" disabled={busy || recognizing} onClick={() => void unbind(medium)}>取消关联</button>}
          </div>
        </div>}
        {medium?.kind === 'audioCd' && medium.playlists.length > 0 && <CdDriveControls key={selectionKey} mount={drive.mountPoint} medium={medium} playlist={playlist}
          busy={busy} player={player} onSelect={value => setSelected(current => ({ ...current, [selectionKey]: value }))}/>}
        {medium?.kind === 'dvdVideo' && <div className="optical-actions">
          <button className="solid-button" disabled={recognizing || busy || player.active || player.busy} onClick={() => void player.start(drive.mountPoint, medium.token, 'dvd-menu')}>播放</button>
          <button className="text-button" disabled={busy || recognizing || player.active || player.busy} onClick={() => void recognizeMenu(drive, medium)}>{recognizeLabel}</button>
        </div>}
        {medium?.kind === 'bluray' && <>
          <dl className="optical-facts">
            <div><dt>播放列表</dt><dd>{medium.playlists.length}</dd></div>
            <div><dt>分段</dt><dd>{playlistInfo ? playlistInfo.segments.length : blurayRows ? '—' : '读取中'}</dd></div>
            <div><dt>时长</dt><dd>{playlistInfo ? formatDuration(playlistInfo.durationSeconds) : '—'}</dd></div>
            <div><dt>区域</dt><dd title="只读检测，不修改光驱区域">未确认</dd></div>
            <div><dt>AACS</dt><dd>{medium.aacsDirectory ? '检测到' : '未检测到'}</dd></div>
            <div><dt>BD+</dt><dd>{medium.bdplusDirectory ? '检测到' : '未检测到'}</dd></div>
            <div><dt>BD-J</dt><dd title="BD-J 菜单需要可用的 Java 运行时">{medium.javaDirectory ? '检测到' : '未检测到'}</dd></div>
          </dl>
          <div className="optical-actions">
            <button className="solid-button" disabled={capturing || busy || player.active || player.busy} onClick={() => void player.start(drive.mountPoint, medium.token, 'bd-menu')}>菜单播放</button>
            <Select label="播放列表" value={playlist} options={playlistOptions} disabled={busy || player.active || player.busy}
              onChange={value => { setSelected(current => ({ ...current, [selectionKey]: value })); setDetails(false); }}/>
            <button type="button" className="text-button" disabled={!playlist || capturing || busy || player.active || player.busy}
              onClick={() => void player.start(drive.mountPoint, medium.token, playlist)}>直接播放</button>
            <button className="text-button" disabled={busy || recognizing || player.active || player.busy} onClick={() => void recognizeMenu(drive, medium)}>{recognizeLabel}</button>
            <button className="text-button" disabled={recognizing || busy || !playlist || player.active || player.busy} onClick={() => void probe(drive, playlist)}>检查播放</button>
          </div>
        </>}
        {recognitionTarget === selectionKey && <>
          <MenuRecognitionStatus active={recognizing} message={recognitionProgress} error={recognitionError}/>
          {recognized && medium && <MenuRecognitionResult value={recognized} disabled={busy || recognizing}
            onCorrect={() => openAssociate(drive, medium, recognized.title)}/>}
        </>}
        {drive.error && <p className="form-error" role="alert">{drive.error}</p>}
        {diagnostic && <div className="optical-diagnostic">
          <p role="status">{diagnostic.message}</p>
          <button className="text-button" onClick={() => setDetails(value => !value)} aria-expanded={details}>诊断记录</button>
          <div className="optical-log" data-open={details} aria-hidden={!details}>
            <div><pre>{diagnostic.details}</pre></div>
          </div>
        </div>}
      </section>;
    })}
    </>}
    {player.error && <p className="form-error" role="alert">{player.error}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {associate && <OpticalAssociationEditor medium={associate.medium} label={associate.label}
      recognition={recognitionTarget === `${associate.drive.mountPoint}:${associate.medium.token}` ? recognized : null}
      onClose={() => setAssociate(null)} onSaved={async () => {
        setAssociate(null);
        setRecognized(value => value ? { ...value, associationMessage: '关联已更正。' } : value);
        await refresh();
      }}/>}
  </Modal>;
}
