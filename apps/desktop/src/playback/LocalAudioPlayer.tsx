import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import type { LibraryCopy } from '../library/types';
import { library } from '../library/gateway';
import { useStaticArtwork } from '../library/useStaticArtwork';
import { Icon } from '../ui/Icon';
import { PlaybackControls } from './PlaybackControls';
import { usePlaybackLayer } from './usePlaybackLayer';
import type { PlaybackController } from './usePlayback';
import { AudioContentTabs } from './AudioContentTabs';
import { useLinkedLyricSong } from './useLinkedLyricSong';
import { useSystemMediaSource } from './useSystemMediaSource';
import { usePlayerClose } from './usePlayerClose';

interface LocalBinding {
  copyId: string;
  path: string;
  label: string;
  episode?: number | null;
  track?: number | null;
}

function trackTitle(binding: LocalBinding) {
  const parts = binding.label.split(' · ');
  return parts.length > 2 ? parts[parts.length - 1] : binding.path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || binding.label;
}

export function LocalAudioPlayer({ player }: { player: PlaybackController }) {
  const [bindings, setBindings] = useState<LocalBinding[]>([]);
  const [copy, setCopy] = useState<LibraryCopy | null>(null);
  const [error, setError] = useState('');
  const [dockOpen, setDockOpen] = useState(false);
  const [repeat, setRepeat] = useState<'list' | 'one'>(() => localStorage.getItem('discatelier.local-repeat') === 'one' ? 'one' : 'list');
  const { closing, close: closePlayer } = usePlayerClose(player);
  const host = usePlaybackLayer();
  const advanced = useRef('');
  const source = player.snapshot?.source;
  const copyId = source?.mountPoint || '';
  const artwork = useStaticArtwork('cover', copy?.coverAssetId || null);

  useEffect(() => { localStorage.setItem('discatelier.local-repeat', repeat); }, [repeat]);
  useEffect(() => {
    if (!copyId) return;
    let active = true;
    const load = () => {
      void invoke<LocalBinding[]>('local_files_get').then(values => {
        if (active) setBindings(values.filter(binding => binding.copyId === copyId));
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    };
    load();
    window.addEventListener('local-files-changed', load);
    return () => { active = false; window.removeEventListener('local-files-changed', load); };
  }, [copyId]);

  useEffect(() => {
    if (!copyId) return;
    let active = true;
    void library.list({ categoryId: 'music', status: null, query: '' }).then(page => {
      if (active) setCopy(page.copies.find(item => item.id === copyId) || null);
    }).catch(() => {});
    return () => { active = false; };
  }, [copyId]);

  const tracks = useMemo(() => [...bindings].sort((left, right) => {
    const number = (left.track || Number.MAX_SAFE_INTEGER) - (right.track || Number.MAX_SAFE_INTEGER);
    return number || left.label.localeCompare(right.label);
  }), [bindings]);
  const current = tracks.findIndex(binding => `local:${binding.path}` === source?.playlist);
  const currentTitle = current >= 0 ? trackTitle(tracks[current]) : undefined;
  const lyric = useLinkedLyricSong(copy?.editionId, tracks[current]?.track);

  useEffect(() => {
    const snapshot = player.snapshot;
    if (!snapshot || snapshot.phase !== 'ended' || advanced.current === snapshot.sessionId) return;
    advanced.current = snapshot.sessionId;
    const next = repeat === 'one' ? tracks[current] : tracks[current + 1] || tracks[0];
    if (next) void player.startLocal(copyId, next.path, player.open);
  }, [player.snapshot?.phase, player.snapshot?.sessionId, current, tracks, copyId, player, repeat]);

  function play(index: number, keepDock = false) {
    if (tracks[index]) void player.startLocal(copyId, tracks[index].path, !keepDock);
  }

  useSystemMediaSource(player, { repeat, setRepeat, title: currentTitle || player.snapshot?.title || '', artist: copy?.edition.creator || '', album: copy?.edition.title || '', previous: current > 0 ? () => play(current - 1, !player.open) : undefined, next: current >= 0 && current < tracks.length - 1 ? () => play(current + 1, !player.open) : undefined });

  if (!player.snapshot || source?.mediaToken !== 'local-audio') return null;

  const dock = !player.open && createPortal(<div className="music-dock local-music-dock">
    <section className="music-dock-panel" id="local-queue" role="region" aria-label="本地播放列表" data-open={dockOpen} inert={!dockOpen}>
      <header className="music-dock-heading"><h3>播放列表</h3><div className="local-dock-heading-actions">
        <button className="icon-button" aria-label="打开播放界面" title="打开播放界面" onClick={() => { setDockOpen(false); player.show(); }}><Icon name="disc"/></button>
        <button className="icon-button" aria-label="收起播放列表" onClick={() => setDockOpen(false)}><Icon name="close"/></button>
      </div></header>
      <div className="local-dock-album"><strong>{copy?.edition.title || '本地音乐'}</strong><span>{copy?.edition.creator}</span></div>
      <div className="music-queue-scroll">
        {tracks.map((binding, index) => <button key={binding.path} className="music-queue-track" disabled={player.busy}
          aria-current={index === current ? 'true' : undefined} onClick={() => play(index, true)}>
          <span>{String(binding.track || index + 1).padStart(2, '0')}</span><strong>{trackTitle(binding)}</strong>
        </button>)}
        {!tracks.length && <p className="setting-hint">这个收藏还没有本地曲目</p>}
      </div>
      <footer className="music-dock-footer">
        <PlaybackControls player={player} showTitle={false} showVolume
          onPrevious={() => play(current - 1, true)} onNext={() => play(current + 1, true)}
          canPrevious={current > 0} canNext={current >= 0 && current < tracks.length - 1}
          repeat={repeat} onRepeat={() => setRepeat(value => value === 'list' ? 'one' : 'list')}/>
        {(error || player.error) && <p className="form-error" role="alert">{error || player.error}</p>}
      </footer>
    </section>
    <button className="music-dock-trigger" aria-label={`播放列表 · ${currentTitle || '本地音乐'}`} aria-expanded={dockOpen} aria-controls="local-queue" onClick={() => setDockOpen(!dockOpen)}>
      <Icon name="list"/><span className="music-dock-indicator" data-playing={player.active && !player.snapshot?.paused}/>
    </button>
  </div>, host);

  if (!player.open) return dock;

  return <section className="player-view audio-player" aria-label="本地音乐播放器" aria-busy={closing} data-closing={closing} data-enter="soft">
    <header className="player-header"><button className="text-button" onClick={closePlayer} disabled={closing || player.busy}><Icon name="back"/>返回</button></header>
    <div className="audio-body">
      <div className={`audio-disc${artwork.url ? ' has-artwork' : ''}`} aria-hidden="true">
        {artwork.url && <img className="audio-disc-artwork" src={artwork.url} alt="" data-loaded="true" draggable={false}/>}
        <span/>
      </div>
      <div className="audio-cd-content">
        <div className="local-audio-meta">
          <h2>{copy?.edition.title || '本地音乐'}</h2>
          <p>{copy?.edition.creator}</p>
        </div>
        <AudioContentTabs player={player} {...lyric}><div className="audio-track-list" aria-label="本地曲目">{tracks.map((binding, index) =>
          <button key={binding.path} aria-current={index === current ? 'true' : undefined} disabled={player.busy} onClick={() => play(index)}>
            <span>{String(binding.track || index + 1).padStart(2, '0')}</span><strong>{trackTitle(binding)}</strong>
          </button>)}
        </div>
        <div className="cd-metadata-status">{tracks.length ? `${tracks.length} 首` : '这个收藏还没有本地曲目'}</div></AudioContentTabs>
      </div>
    </div>
    <footer className="player-footer">
      <PlaybackControls player={player} title={currentTitle} showVolume
        onPrevious={() => play(current - 1)} onNext={() => play(current + 1)}
        canPrevious={current > 0} canNext={current >= 0 && current < tracks.length - 1}
        repeat={repeat} onRepeat={() => setRepeat(value => value === 'list' ? 'one' : 'list')}/>
      {(error || player.error) && <p className="form-error" role="alert">{error || player.error}</p>}
    </footer>
  </section>;
}
