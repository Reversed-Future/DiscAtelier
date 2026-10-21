import { PlaybackControls } from './PlaybackControls';
import type { PlaybackController } from './usePlayback';
import { Icon } from '../ui/Icon';

export function StreamPlayer({ player }: { player: PlaybackController }) {
  return <section className="player-view audio-player" aria-label="网易云播放器">
    <header className="player-header"><button className="text-button" onClick={player.hide}><Icon name="back"/>返回</button><span>网易云</span></header>
    <div className="audio-body"><div className="audio-disc" aria-hidden="true"><span/></div></div>
    <footer className="player-footer"><PlaybackControls player={player}/>{player.error && <p className="form-error" role="alert">{player.error}</p>}</footer>
  </section>;
}
