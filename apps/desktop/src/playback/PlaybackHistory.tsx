import { useEffect, useState } from 'react';
import { errorMessage } from '../library/gateway';
import type { OpticalDrive } from '../optical/gateway';
import { playback, time, type PlaybackRecord } from './gateway';
import type { PlaybackController } from './usePlayback';

export function PlaybackHistory({ drives, player, onResume }: { drives: OpticalDrive[]; player: PlaybackController; onResume(): void }) {
  const [rows, setRows] = useState<PlaybackRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    playback.history().then(value => { if (active) { setRows(value); setLoaded(true); } })
      .catch(cause => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [player.snapshot?.phase]);
  return <div className="playback-history">
    {loaded && !rows.length && <p className="optical-empty">暂无记录</p>}
    {rows.map(row => {
      const cd = row.source.playlist.startsWith('cd-track:');
      const dvd = row.source.playlist === 'dvd-menu';
      const drive = drives.find(d => d.medium?.token === row.source.mediaToken && (dvd ? d.medium.kind === 'dvdVideo' : d.medium.playlists.includes(row.source.playlist)));
      return <article className="playback-history-row" key={row.sessionId}>
        <strong>{row.title}</strong>
        <div className="playback-history-meta"><time dateTime={row.startedAt}>{new Date(row.startedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time><span>{dvd ? row.dvdTitle !== null ? `DVD · ${row.dvdTitle}` : 'DVD' : row.source.playlist}</span></div>
        <div className="playback-history-bottom">
          <span>{time(row.positionSeconds)} / {time(row.durationSeconds)} · {cd ? '已听' : '已看'} {time(row.watchedSeconds)}
            {row.completed ? cd ? ' · 听完' : ' · 看完' : row.phase === 'interrupted' ? ' · 中断' : row.phase === 'failed' ? ' · 失败' : ''}</span>
          {drive && !player.active && <button className="text-button" disabled={player.busy} onClick={async () => {
            const resume = row.durationSeconds && row.positionSeconds >= row.durationSeconds - 1 ? 0 : row.positionSeconds;
            if (await player.start(drive.mountPoint, row.source.mediaToken, row.source.playlist, dvd && row.dvdTitle === null ? 0 : resume, row.dvdTitle)) onResume();
          }}>继续播放</button>}
        </div>
      </article>;
    })}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
