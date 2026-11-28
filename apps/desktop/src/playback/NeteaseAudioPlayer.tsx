import { useEffect, useState } from 'react';
import { library } from '../library/gateway';
import { useStaticArtwork } from '../library/useStaticArtwork';
import { Icon } from '../ui/Icon';
import { AudioContentTabs } from './AudioContentTabs';
import { QueueTrackButton } from './QueueTrackButton';
import { PlaybackControls } from './PlaybackControls';
import type { PlaybackController } from './usePlayback';
import { time } from './gateway';
import { usePlayerClose } from './usePlayerClose';
import { useSpacePause } from './useSpacePause';

export function NeteaseAudioPlayer({ player }: { player: PlaybackController }) {
  useSpacePause(player);
  const { closing, close } = usePlayerClose(player);
  const queue = player.musicQueue, album = queue.current;
  const [cover, setCover] = useState<{ editionId: string; id: string | null } | null>(null);
  useEffect(() => {
    if (!album) return;
    let live = true;
    void library.list({ categoryId: 'music', status: null, query: '' }).then(page => {
      if (live) setCover({ editionId: album.editionId, id: page.copies.find(copy => copy.editionId === album.editionId)?.coverAssetId || null });
    }).catch(() => {});
    return () => { live = false; };
  }, [album?.editionId]);
  const artwork = useStaticArtwork('cover', cover?.editionId === album?.editionId ? cover?.id || null : null);
  return <section className="player-view audio-player" aria-label="网易云音乐播放器" data-enter="soft" data-closing={closing} aria-busy={closing}>
    <header className="player-header"><button className="text-button" onClick={close} disabled={closing || player.busy}><Icon name="back"/>返回</button></header>
    <div className="audio-body">
      <div className={`audio-disc${artwork.url ? ' has-artwork' : ''}`} aria-hidden="true">{artwork.url && <img className="audio-disc-artwork" src={artwork.url} alt="" data-loaded="true" draggable={false}/>}<span/></div>
      <div className="audio-cd-content">
        <div className="local-audio-meta"><h2>{album?.title || player.snapshot?.title}</h2><p>{album?.artists.join('，')}</p></div>
        <AudioContentTabs player={player} songId={queue.songId}>
          <div className="audio-track-list" aria-label="网易云曲目">{album?.tracks.map((track, index) =>
            <QueueTrackButton key={track.id} number={index + 1} title={track.title} current={track.id === queue.songId}
              duration={time(track.durationMs / 1000)} onPlay={() => void queue.start(album.editionId, track.id)}/>)}</div>
          <div className="cd-metadata-status">{album ? `${album.tracks.length} 首` : '正在读取曲目…'}</div>
        </AudioContentTabs>
      </div>
    </div>
    <footer className="player-footer"><PlaybackControls player={player} showVolume showEqualizer volumeLayout="vertical" onPrevious={() => queue.step(-1)} onNext={() => queue.step(1)} canPrevious={!!album} canNext={!!album} repeat={queue.mode} onRepeat={() => queue.setMode(queue.mode === 'list' ? 'one' : 'list')}/>{player.error && <p className="form-error" role="alert">{player.error}</p>}</footer>
  </section>;
}
