import { useMemo, useState } from 'react';
import { discPages } from '../metadata/discTracks';
import { DiscTabs, DiscTrackPanel } from '../metadata/DiscTrackView';
import type { ReleaseTrack } from '../metadata/gateway';
import type { LinkedMusicAlbum, DiscAlbumLink, SongLink } from '../integrations/gateway';
import { albumMatches, albumRows, albumRowLabel, trackLeaves } from '../integrations/albumTracks';
import { trackKey } from '../integrations/trackMatches';
import type { PlaybackController } from '../playback/usePlayback';
import type { LibraryCopy } from '../library/types';


export function CollectionTracks({ rows, albums, links, bindings, item, player }: { rows: ReleaseTrack[]; albums: LinkedMusicAlbum[]; links: SongLink[]; bindings: DiscAlbumLink[]; item: LibraryCopy; player: PlaybackController }) {
  const [page, setPage] = useState(0);
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
  return pages.length ? <div className="collection-tracks"><DiscTabs pages={pages} page={index} onChange={setPage}/><DiscTrackPanel disc={pages[index]} index={index} playback={playback} positionLabel={trackLeaves(rows).length ? undefined : row => albumRowLabel(row, albums)}/></div> : <p className="utility-copy">{item.edition.categoryId === 'video' ? '暂无本版章节资料' : '暂无曲目'}</p>;
}
