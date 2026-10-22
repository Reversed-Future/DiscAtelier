import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { errorMessage } from '../library/gateway';
import { optical, type OpticalDrive, type PlaybackDiagnostic } from './gateway';
import { PlaybackHistory } from '../playback/PlaybackHistory';
import type { PlaybackController } from '../playback/usePlayback';
import { CdDriveControls } from './CdDriveControls';

export function OpticalPanel({ onClose, player }: { onClose(): void; player: PlaybackController }) {
  const [drives, setDrives] = useState<OpticalDrive[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<{ mount: string; token: string; playlist: string; value: PlaybackDiagnostic } | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [details, setDetails] = useState(false);
  const [history, setHistory] = useState(false);
  const mounted = useRef(false), running = useRef(false);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    if (mounted.current) setBusy(true);
    try {
      const value = await optical.list();
      if (mounted.current) { setDrives(value); setError(''); setLoaded(true); }
    } catch (cause) { if (mounted.current) setError(errorMessage(cause)); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; void refresh();
    // Only while the panel is open. No overlapping queries or permanent spin-up.
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [refresh]);
  async function probe(drive: OpticalDrive, playlist: string) {
    if (running.current || !drive.medium) return;
    running.current = true; setBusy(true); setError(''); setReport(null); setDetails(false);
    try {
      const value = await optical.probe(drive.mountPoint, drive.medium.token, playlist);
      if (mounted.current) setReport({ mount: drive.mountPoint, token: drive.medium.token, playlist, value });
    } catch (cause) { if (mounted.current) setError(errorMessage(cause)); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  return <Modal title={history ? '播放历史' : '光驱'} onClose={onClose} className="optical-panel">
    <div className="optical-toolbar">
      <button className="text-button" onClick={() => setHistory(value => !value)}>{history ? '返回光驱' : '播放历史'}</button>
      {!history && <button className="text-button" disabled={busy} onClick={() => void refresh()}>{busy ? '读取中' : '刷新'}</button>}
    </div>
    {history ? <PlaybackHistory drives={drives} player={player} onResume={() => setHistory(false)}/> : <>
    {loaded && !drives.length && <p className="optical-empty">未连接光驱</p>}
    {drives.map(drive => {
      const medium = drive.medium;
      const selectionKey = `${drive.mountPoint}:${medium?.token || ''}`;
      const playlist = medium?.playlists.includes(selected[selectionKey]) ? selected[selectionKey] : medium?.playlists[0] || '';
      const diagnostic = report?.mount === drive.mountPoint && report.token === medium?.token && report.playlist === playlist ? report.value : null;
      return <section className="optical-drive" key={drive.mountPoint}>
        <div className="optical-heading"><strong>{drive.name}</strong><span>{drive.mountPoint}</span></div>
        <p>{drive.status === 'empty' ? '未放入光盘' : !medium ? '暂不可读取' : medium.kind === 'audioCd' ? `CD · ${medium.tracks.length} 首` : medium.kind === 'bluray' ? `BD · ${medium.label}` : medium.kind === 'dvdVideo' ? `DVD · ${medium.label}` : medium.label || '光盘'}</p>
        {medium?.kind === 'audioCd' && medium.playlists.length > 0 && <CdDriveControls key={selectionKey} mount={drive.mountPoint} medium={medium} playlist={playlist}
          busy={busy} player={player} onSelect={value => setSelected(current => ({ ...current, [selectionKey]: value }))}/>}
        {medium?.kind === 'dvdVideo'  && <div className="optical-actions">
          <button className="text-button" disabled={busy || player.active || player.busy} onClick={() => void player.start(drive.mountPoint, medium.token, 'dvd-menu')}>播放</button>
        </div>}
        {medium?.kind === 'bluray' && <>
          <dl className="optical-facts">
            <div><dt>播放列表</dt><dd>{medium.playlists.length}</dd></div>
            <div><dt>区域</dt><dd>未确认</dd></div>
          </dl>
          <div className="optical-actions">
            <Select label="播放列表" value={playlist} options={medium.playlists.map(name => ({ id: name, label: name }))} disabled={busy || player.active || player.busy}
              onChange={value => { setSelected(current => ({ ...current, [selectionKey]: value })); setDetails(false); }}/>
            <button className="text-button" disabled={busy || !playlist || player.active || player.busy} onClick={() => void player.start(drive.mountPoint, medium.token, playlist)}>播放</button>
            <button className="text-button" disabled={busy || !playlist || player.active || player.busy} onClick={() => void probe(drive, playlist)}>检查播放</button>
          </div>
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
    {player.active && <button className="text-button" onClick={player.show}>返回播放</button>}
    </>}
    {player.error && <p className="form-error" role="alert">{player.error}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </Modal>;
}
