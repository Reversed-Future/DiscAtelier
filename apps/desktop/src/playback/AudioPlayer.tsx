import { useEffect, useState } from 'react';
import { optical, type CdTrack } from '../optical/gateway';
import { errorMessage } from '../library/gateway';
import { PlaybackControls } from './PlaybackControls';
import { time } from './gateway';
import type { PlaybackController } from './usePlayback';
import { Icon } from '../ui/Icon';

export function AudioPlayer({ player }: { player: PlaybackController }) {
  const [tracks, setTracks] = useState<CdTrack[]>([]);
  const [error, setError] = useState('');
  const source = player.snapshot?.source;
  useEffect(() => {
    let active = true;
    void optical.list().then(drives => {
      if (active) setTracks(drives.find(d => d.mountPoint === source?.mountPoint && d.medium?.token === source.mediaToken)?.medium?.tracks || []);
    }).catch(cause => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [source?.mountPoint, source?.mediaToken]);
  const current = tracks.findIndex(t => `cd-track:${t.number}` === source?.playlist);
  function play(index: number) {
    if (source && tracks[index]) void player.start(source.mountPoint, source.mediaToken, `cd-track:${tracks[index].number}`);
  }
  return <section className="player-view audio-player" aria-label="CD 播放器">
    <header className="player-header"><button className="text-button" onClick={player.hide}><Icon name="back"/>返回</button><span>CD</span></header>
    <div className="audio-body">
      <div className="audio-disc" aria-hidden="true"><span/></div>
      <div className="audio-track-list" aria-label="光盘曲目">{tracks.map((track, index) =>
        <button key={track.number} aria-current={index === current ? 'true' : undefined} disabled={player.busy}
          onClick={() => play(index)}><span>{String(track.number).padStart(2, '0')}</span><strong>曲目 {track.number}</strong><time>{time(track.durationSeconds)}</time></button>)}
      </div>
    </div>
    <footer className="player-footer">
      <div className="audio-navigation"><button className="text-button" disabled={player.busy || current <= 0} onClick={() => play(current - 1)}>上一首</button><button className="text-button" disabled={player.busy || current < 0 || current >= tracks.length - 1} onClick={() => play(current + 1)}>下一首</button></div>
      <PlaybackControls player={player}/>
      {(error || player.error) && <p className="form-error" role="alert">{error || player.error}</p>}
    </footer>
  </section>;
}
