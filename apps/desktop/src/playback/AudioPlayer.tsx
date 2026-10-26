import { useEffect, useRef, useState } from 'react';
import { optical, type CdTrack } from '../optical/gateway';
import { library, errorMessage } from '../library/gateway';
import { PlaybackControls } from './PlaybackControls';
import { time } from './gateway';
import type { PlaybackController } from './usePlayback';
import { Icon } from '../ui/Icon';
import { useCdMetadata } from '../optical/useCdMetadata';
import { useOpticalPresence } from '../optical/useOpticalPresence';
import { useStaticArtwork } from '../library/useStaticArtwork';
import { usePlayerClose } from './usePlayerClose';
import type { LibraryCopy } from '../library/types';
import { AudioContentTabs } from './AudioContentTabs';
import { useLinkedLyricSong } from './useLinkedLyricSong';
import { useSystemMediaSource } from './useSystemMediaSource';

export function AudioPlayer({ player }: { player: PlaybackController }) {
  const [tracks, setTracks] = useState<CdTrack[]>([]);
  const [error, setError] = useState('');
  const { closing, close } = usePlayerClose(player);
  const source = player.snapshot?.source;
  const metadata = useCdMetadata(source?.mountPoint, source?.mediaToken);
  const presence = useOpticalPresence().find(value => value.mediaToken === source?.mediaToken);
  const [linkedCopy, setLinkedCopy] = useState<LibraryCopy | null>(null);
  useEffect(() => {
    let active = true;
    if (!presence) { setLinkedCopy(null); return; }
    void library.list({ categoryId: 'music', status: null, query: '' }).then(page => {
      if (active) setLinkedCopy(page.copies.find(copy => copy.id === presence.copyId) || null);
    }).catch(() => { if (active) setLinkedCopy(null); });
    return () => { active = false; };
  }, [presence?.copyId]);
  const artwork = useStaticArtwork('cover', linkedCopy?.coverAssetId || null);
  const [artworkLoaded, setArtworkLoaded] = useState('');
  const [imageReady, setImageReady] = useState('');
  const artworkImage = useRef<HTMLImageElement>(null);
  const artworkStarted = useRef(0);
  const coverLoading = !!linkedCopy?.coverAssetId && !artwork.failed && (!artwork.url || artworkLoaded !== artwork.url);
  useEffect(() => {
    artworkStarted.current = performance.now();
    setImageReady('');
    setArtworkLoaded('');
  }, [artwork.url]);
  useEffect(() => {
    const image = artworkImage.current;
    if (artwork.url && image?.complete && image.naturalWidth > 0) setImageReady(artwork.url);
  }, [artwork.url]);
  useEffect(() => {
    if (!artwork.url || imageReady !== artwork.url) return;
    const remaining = Math.max(0, 360 - (performance.now() - artworkStarted.current));
    const timer = setTimeout(() => setArtworkLoaded(artwork.url), remaining);
    return () => clearTimeout(timer);
  }, [artwork.url, imageReady]);
  useEffect(() => {
    let active = true;
    setTracks([]); setError('');
    void optical.list().then(drives => {
      if (active) setTracks(drives.find(d => d.mountPoint === source?.mountPoint && d.medium?.token === source.mediaToken)?.medium?.tracks || []);
    }).catch(cause => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [source?.mountPoint, source?.mediaToken]);
  const current = tracks.findIndex(t => `cd-track:${t.number}` === source?.playlist);
  const currentMetadata = metadata.tracks.find(track => track.number === tracks[current]?.number);
  const lyric = useLinkedLyricSong(linkedCopy?.editionId, tracks[current]?.number, presence?.discKey ?? null);
  function play(index: number) {
    if (source && tracks[index]) void player.start(source.mountPoint, source.mediaToken, `cd-track:${tracks[index].number}`, 0, null, player.open);
  }
  useSystemMediaSource(player, { title: currentMetadata?.title || player.snapshot?.title || '', artist: currentMetadata?.artist || '', album: currentMetadata?.album || '', previous: current > 0 ? () => play(current - 1) : undefined, next: current >= 0 && current < tracks.length - 1 ? () => play(current + 1) : undefined });
  if (!player.open) return null;
  return <section className="player-view audio-player" aria-label="CD 播放器" aria-busy={closing} data-closing={closing} data-enter="soft">
    <header className="player-header"><button className="text-button" onClick={() => void close()} disabled={closing || player.busy}><Icon name="back"/>返回</button></header>
    <div className="audio-body">
      <div className={`audio-disc${artwork.url ? ' has-artwork' : ''}${coverLoading ? ' is-loading' : ''}`} aria-hidden="true">
        {artwork.url && <img ref={artworkImage} className="audio-disc-artwork" src={artwork.url} alt="" draggable={false}
          data-loaded={artworkLoaded === artwork.url} onLoad={() => setImageReady(artwork.url)}/>}
        <span/>
      </div>
      <div className="audio-cd-content">
      <div className="local-audio-meta">
        <h2>{currentMetadata?.album || linkedCopy?.edition.title || '未知专辑'}</h2>
        <p>{currentMetadata?.artist || linkedCopy?.edition.creator}</p>
        {(currentMetadata?.date || currentMetadata?.genre) && <p>{[currentMetadata?.date, currentMetadata?.genre].filter(Boolean).join(' · ')}</p>}
      </div>
      <AudioContentTabs player={player} {...lyric}><div className="audio-track-list" aria-label="光盘曲目">{tracks.map((track, index) =>
        <button key={track.number} aria-current={index === current ? 'true' : undefined} disabled={player.busy}
          onClick={() => play(index)}><span>{String(track.number).padStart(2, '0')}</span><strong>{metadata.tracks.find(item => item.number === track.number)?.title || `曲目 ${track.number}`}</strong><time>{time(track.durationSeconds)}</time></button>)}
      </div>
      <div className="cd-metadata-status"><span>{tracks[current]?.number || 0} / {currentMetadata?.trackTotal || tracks.length} 首</span>{metadata.loading ? <span role="status">正在识别曲目资料…</span> : <button className="text-button" onClick={metadata.refresh}>重新识别</button>}
        {metadata.error && <span role="status">{metadata.error} 仍可按曲号播放。</span>}</div></AudioContentTabs>
      </div>
    </div>
    <footer className="player-footer">
      <PlaybackControls player={player} title={currentMetadata?.title} showVolume
        onPrevious={() => play(current - 1)} onNext={() => play(current + 1)}
        canPrevious={current > 0} canNext={current >= 0 && current < tracks.length - 1}/>
      {(error || player.error) && <p className="form-error" role="alert">{error || player.error}</p>}
    </footer>
  </section>;
}
