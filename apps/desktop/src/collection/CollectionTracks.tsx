import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { discPages } from '../metadata/discTracks';
import { DiscTabs, DiscTrackPanel } from '../metadata/DiscTrackView';
import type { ReleaseTrack } from '../metadata/gateway';
import type { LinkedMusicAlbum, DiscAlbumLink, SongLink } from '../integrations/gateway';
import { albumMatches, albumRows, albumRowLabel, trackLeaves } from '../integrations/albumTracks';
import { trackKey } from '../integrations/trackMatches';
import type { PlaybackController } from '../playback/usePlayback';
import type { LibraryCopy } from '../library/types';
import type { TrackPlayback } from '../metadata/TrackRow';
import { positionNumber } from '../local/match';

interface LocalBinding { copyId: string; path: string; label: string; episode?: number | null; track?: number | null }

export function CollectionTracks({ rows, albums, links, bindings, item, player }: { rows: ReleaseTrack[]; albums: LinkedMusicAlbum[]; links: SongLink[]; bindings: DiscAlbumLink[]; item: LibraryCopy; player: PlaybackController }) {
  const [page, setPage] = useState(0);
  const [local, setLocal] = useState<LocalBinding[]>([]);
  useEffect(() => {
    let active = true;
    const load = () => {
      void invoke<LocalBinding[]>('local_files_get').then(values => {
        if (active) setLocal(values.filter(binding => binding.copyId === item.id));
      }).catch(() => {});
    };
    load();
    window.addEventListener('local-files-changed', load);
    return () => { active = false; window.removeEventListener('local-files-changed', load); };
  }, [item.id]);
  const localByTrack = useMemo(() => {
    const result = new Map<string, LocalBinding>();
    const leaves = trackLeaves(rows);
    for (const binding of local) {
      let index = -1;
      if (binding.track) index = leaves.findIndex((row, position) => position + 1 === binding.track || positionNumber(row.position) === binding.track);
      if (index < 0 && binding.label) index = leaves.findIndex(row => binding.label.includes(` · ${row.title}`));
      if (index >= 0) result.set(trackKey(leaves[index]), binding);
    }
    return result;
  }, [local, rows]);
  function localPlayback(track: ReleaseTrack): TrackPlayback | undefined {
    const binding = localByTrack.get(trackKey(track));
    if (!binding) return undefined;
    const playing = player.active && player.snapshot?.source.playlist === `local:${binding.path}`;
    return {
      playing,
      busy: player.busy,
      play: () => {
        if (playing) player.show();
        else void player.startLocal(item.id, binding.path);
      },
    };
  }
  const pages = useMemo(() => trackLeaves(rows).length ? discPages(rows, item.edition.title) : albums.flatMap(entry => {
    const discs = [...new Set(entry.album.tracks.map(t => t.disc))];
    const all = albumRows(entry);
    return discs.map(disc => ({ key: `${entry.album.albumId}:${disc}`, name: entry.album.title + (discs.length > 1 ? ` · Disc ${disc}` : ''), numbered: false, tracks: all.filter((_, i) => entry.album.tracks[i].disc === disc) }));
  }), [rows, albums, item.edition.title]);
  const matches = useMemo(() => albumMatches(rows, albums, links, bindings), [rows, albums, links, bindings]);
  const index = Math.min(page, Math.max(0, pages.length - 1));
  function playback(track: ReleaseTrack) {
    const song = matches.get(trackKey(track));
    const selected = song && player.snapshot?.source.mountPoint === item.editionId && player.snapshot.source.playlist === `netease-song:${song.id}` && player.active;
    if (!song) return undefined;
    return { playing: !!selected, busy: player.busy, play: () => {
      if (selected) { if (player.snapshot?.paused) void player.control({ action: 'pause', paused: false }); }
      else void player.startNetease(item.editionId, song.id);
    } };
  }
  return pages.length ? <div className="collection-tracks"><DiscTabs pages={pages} page={index} onChange={setPage}/><DiscTrackPanel disc={pages[index]} index={index} playback={playback} localPlayback={localPlayback} positionLabel={trackLeaves(rows).length ? undefined : row => albumRowLabel(row, albums)}/></div> : <p className="utility-copy">{item.edition.categoryId === 'video' ? '暂无本版章节资料' : '暂无曲目'}</p>;
}
