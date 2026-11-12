import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import type { LibraryCopy } from '../library/types';
import type { EditionContent, ReleaseTrack } from '../metadata/gateway';
import { errorMessage, library } from '../library/gateway';
import { useStaticArtwork } from '../library/useStaticArtwork';
import { discPages } from '../metadata/discTracks';
import { matchTrack, normalized, positionNumber, trackNumberAt } from '../local/match';
import { Icon } from '../ui/Icon';
import { PlaybackControls } from './PlaybackControls';
import { usePlaybackLayer } from './usePlaybackLayer';
import type { PlaybackController } from './usePlayback';
import { AudioContentTabs } from './AudioContentTabs';
import { useLinkedLyricSong } from './useLinkedLyricSong';
import { useSystemMediaSource } from './useSystemMediaSource';
import { usePlayerClose } from './usePlayerClose';
import { useSpacePause } from './useSpacePause';

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
interface AlbumTrack { track: ReleaseTrack; number: number | null; order: number }
interface QueueTrack { binding: LocalBinding | null; title: string; number: number | null; order: number }

export function LocalAudioPlayer({ player }: { player: PlaybackController }) {
  useSpacePause(player, player.open);
  const [bindings, setBindings] = useState<LocalBinding[]>([]);
  const [copy, setCopy] = useState<LibraryCopy | null>(null);
  const [content, setContent] = useState<EditionContent | null>(null);
  const [contentReady, setContentReady] = useState(false);
  const [error, setError] = useState('');
  const [dockOpen, setDockOpen] = useState(false);
  const dockRoot = useRef<HTMLDivElement>(null);
  const [repeat, setRepeat] = useState<'list' | 'one'>(() => localStorage.getItem('discatelier.local-repeat') === 'one' ? 'one' : 'list');
  useEffect(() => {
    if (!dockOpen) return;
    const pointer = (event: PointerEvent) => {
      if (!dockRoot.current?.contains(event.target as Node)) setDockOpen(false);
    };
    document.addEventListener('pointerdown', pointer, true);
    return () => document.removeEventListener('pointerdown', pointer, true);
  }, [dockOpen]);
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
      }).catch(cause => { if (active) setError(errorMessage(cause)); });
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

  useEffect(() => {
    setContentReady(false);
    if (!copy?.editionId) { setContent(null); setContentReady(true); return; }
    let active = true;
    void library.content(copy.editionId).then(value => {
      if (active) { setContent(value); setContentReady(true); }
    }).catch(() => {
      if (active) { setContent(null); setContentReady(true); }
    });
    return () => { active = false; };
  }, [copy?.editionId, copy?.editionRevision]);

  // The album's own track list defines order. Folder track numbers only help
  // associate a file; they never reorder the queue or append a second album.
  const albumTracks = useMemo<AlbumTrack[]>(() => {
    if (!content?.tracks.length) return [];
    let order = 0;
    return discPages(content.tracks, copy?.edition.title || '', copy?.edition.media || []).flatMap(page => {
      const rows = page.tracks.filter(track => track.type_ !== 'heading');
      return rows.map((track, index) => ({
        track,
        number: trackNumberAt(rows, index) ?? positionNumber(track.position) ?? index + 1,
        order: order++,
      }));
    });
  }, [content, copy?.edition.title, copy?.edition.media]);

  const tracks = useMemo<QueueTrack[]>(() => {
    const sorted = [...bindings].sort((left, right) => {
      const number = (left.track || Number.MAX_SAFE_INTEGER) - (right.track || Number.MAX_SAFE_INTEGER);
      return number || left.label.localeCompare(right.label);
    });
    if (!contentReady) return [];
    if (!albumTracks.length) {
      return sorted.map((binding, index) => ({ binding, title: trackTitle(binding), number: binding.track ?? index + 1, order: index }));
    }
    const used = new Set<number>();
    const matched = new Map<number, LocalBinding>();
    for (const binding of sorted) {
      const label = normalized(binding.label || binding.path);
      let album = albumTracks.find(entry => {
        const title = normalized(entry.track.title);
        return !used.has(entry.order) && title.length >= 2 && label.includes(title);
      });
      if (!album && binding.track != null) {
        album = albumTracks.find(entry => !used.has(entry.order) && entry.number === binding.track);
      }
      if (!album) {
        const result = matchTrack(binding.label || binding.path, albumTracks.map(entry => entry.track));
        if (result) album = albumTracks.find(entry => !used.has(entry.order)
          && (entry.number === result.number || normalized(entry.track.title) === normalized(result.title)));
      }
      if (!album) continue;
      used.add(album.order);
      matched.set(album.order, binding);
    }
    // The queue is the album itself. Tracks without a matched local file stay
    // visible as disabled placeholders instead of pulling in the whole folder.
    return albumTracks.map(entry => ({
      binding: matched.get(entry.order) || null,
      title: entry.track.title || `曲目 ${entry.number ?? entry.order + 1}`,
      number: entry.number,
      order: entry.order,
    }));
  }, [bindings, albumTracks, contentReady]);
  const current = tracks.findIndex(item => !!item.binding && `local:${item.binding.path}` === source?.playlist);
  const currentTitle = current >= 0 ? tracks[current].title : undefined;
  const lyric = useLinkedLyricSong(copy?.editionId, tracks[current]?.number ?? undefined);

  function playable(from: number, direction: 1 | -1, wrap = false) {
    let index = from + direction;
    while (index >= 0 && index < tracks.length) {
      if (tracks[index].binding) return index;
      index += direction;
    }
    if (!wrap) return -1;
    const start = direction > 0 ? 0 : tracks.length - 1;
    const end = direction > 0 ? tracks.length : -1;
    for (let at = start; at !== end; at += direction) if (tracks[at].binding) return at;
    return -1;
  }
  function play(index: number, keepDock = false) {
    const item = tracks[index];
    if (item?.binding) void player.startLocal(copyId, item.binding.path, !keepDock);
  }
  function step(direction: 1 | -1, keepDock = false) {
    const index = playable(current, direction);
    if (index >= 0) play(index, keepDock);
  }
  const canPrevious = playable(current, -1) >= 0;
  const canNext = playable(current, 1) >= 0;

  useEffect(() => {
    const snapshot = player.snapshot;
    if (!snapshot || snapshot.phase !== 'ended' || advanced.current === snapshot.sessionId) return;
    advanced.current = snapshot.sessionId;
    const next = repeat === 'one' ? (tracks[current]?.binding ? current : -1) : playable(current, 1, true);
    if (next >= 0) play(next, !player.open);
  }, [player.snapshot?.phase, player.snapshot?.sessionId, current, tracks, copyId, player, repeat]);

  useSystemMediaSource(player, { repeat, setRepeat, title: currentTitle || player.snapshot?.title || '', artist: copy?.edition.creator || '', album: copy?.edition.title || '', previous: canPrevious ? () => step(-1, !player.open) : undefined, next: canNext ? () => step(1, !player.open) : undefined });

  if (!player.snapshot || source?.mediaToken !== 'local-audio') return null;

  const dock = !player.open && createPortal(<div className="music-dock local-music-dock" ref={dockRoot}>
    {dockOpen && <div className="music-dock-scrim" aria-hidden="true" onPointerDown={() => setDockOpen(false)}/>}
    <section className="music-dock-panel" id="local-queue" role="region" aria-label="本地播放列表" data-open={dockOpen} inert={!dockOpen}>
      <header className="music-dock-heading"><h3>播放列表</h3><div className="local-dock-heading-actions">
        <button className="icon-button" aria-label="打开播放界面" title="打开播放界面" onClick={() => { setDockOpen(false); player.show(); }}><Icon name="disc"/></button>
        <button className="icon-button" aria-label="收起播放列表" onClick={() => setDockOpen(false)}><Icon name="close"/></button>
      </div></header>
      <div className="local-dock-album"><strong>{copy?.edition.title || '本地音乐'}</strong><span>{copy?.edition.creator}</span></div>
      <div className="music-queue-scroll">
        {tracks.map((item, index) => <button key={item.order} className={`music-queue-track${item.binding ? '' : ' is-unavailable'}`}
          disabled={!item.binding} aria-current={index === current ? 'true' : undefined} onClick={() => play(index, true)}>
          <span>{String(item.number || index + 1).padStart(2, '0')}</span><strong>{item.title}</strong>
        </button>)}
        {!tracks.length && <p className="setting-hint">{contentReady ? '这个收藏还没有本地曲目' : '正在读取专辑曲目…'}</p>}
      </div>
      <footer className="music-dock-footer">
        <PlaybackControls player={player} showTitle={false} showVolume volumeLayout="vertical"
          onPrevious={() => step(-1, true)} onNext={() => step(1, true)}
          canPrevious={canPrevious} canNext={canNext}
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
        <AudioContentTabs player={player} {...lyric}><div className="audio-track-list" aria-label="本地曲目">{tracks.map((item, index) =>
          <button key={item.order} className={item.binding ? undefined : 'is-unavailable'} disabled={!item.binding}
            aria-current={index === current ? 'true' : undefined} onClick={() => play(index)}>
            <span>{String(item.number || index + 1).padStart(2, '0')}</span><strong>{item.title}</strong>
          </button>)}
        </div>
        <div className="cd-metadata-status">{!tracks.length && (contentReady ? '这个收藏还没有本地曲目' : '正在读取专辑曲目…')}</div></AudioContentTabs>
      </div>
    </div>
    <footer className="player-footer">
      <PlaybackControls player={player} title={currentTitle} showVolume volumeLayout="vertical"
        onPrevious={() => step(-1)} onNext={() => step(1)}
        canPrevious={canPrevious} canNext={canNext}
        repeat={repeat} onRepeat={() => setRepeat(value => value === 'list' ? 'one' : 'list')}/>
      {(error || player.error) && <p className="form-error" role="alert">{error || player.error}</p>}
    </footer>
  </section>;
}
