import { PlaybackControls } from './PlaybackControls';
import type { PlaybackController } from './usePlayback';
import { usePlayerClose } from './usePlayerClose';
import { Icon } from '../ui/Icon';

export function StreamPlayer({ player }: { player: PlaybackController }) {
  const { closing, close } = usePlayerClose(player);
  return <section className="player-view audio-player" aria-label="网易云播放器" aria-busy={closing} data-closing={closing}>
    <header className="player-header"><button className="text-button" onClick={() => void close()} disabled={closing || player.busy}><Icon name="back"/>返回</button><span>网易云</span></header>
    <div className="audio-body"><div className="audio-disc" aria-hidden="true"><span/></div></div>
    <footer className="player-footer"><PlaybackControls player={player} showVolume/>{player.error && <p className="form-error" role="alert">{player.error}</p>}</footer>
  </section>;
}
