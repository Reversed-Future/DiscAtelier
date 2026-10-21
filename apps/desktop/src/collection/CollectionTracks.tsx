import { useMemo, useState } from 'react';
import { discPages } from '../metadata/discTracks';
import { DiscTabs, DiscTrackPanel } from '../metadata/DiscTrackView';
import type { ReleaseTrack } from '../metadata/gateway';
import type { MusicSupplement } from '../integrations/gateway';
import { trackKey, trackMatches } from '../integrations/trackMatches';
import type { PlaybackController } from '../playback/usePlayback';
import type { LibraryCopy } from '../library/types';
import { time } from '../playback/gateway';

export function CollectionTracks({ rows, album, item, player }: { rows: ReleaseTrack[]; album: MusicSupplement | null; item: LibraryCopy; player: PlaybackController }) {
  const [page, setPage] = useState(0);
  const pages = useMemo(() => discPages(rows.length ? rows : (album?.tracks || []).map(t => ({ title:t.title, position:`${t.disc}-${t.number}`, duration:time(t.durationMs / 1000), type_:'track' })), item.edition.title), [rows, album, item.edition.title]);
  const matches = useMemo(() => trackMatches(rows, album), [rows, album]);
  const index = Math.min(page, Math.max(0, pages.length - 1));
  function playback(track: ReleaseTrack) {
    const song = rows.length ? matches.get(trackKey(track)) : album?.tracks.find(t => `${t.disc}-${t.number}` === track.position && t.title === track.title);
    const selected = song && player.snapshot?.source.mountPoint === item.editionId && player.snapshot.source.playlist === `netease-song:${song.id}` && player.active;
    if (!song) return undefined;
    return { playing: !!selected, busy: player.busy, play: () => {
      if (selected) { if (player.snapshot?.paused) void player.control({ action: 'pause', paused: false }); }
      else void player.startNetease(item.editionId, song.id);
    } };
  }
  return pages.length ? <div className="collection-tracks"><DiscTabs pages={pages} page={index} onChange={setPage}/><DiscTrackPanel disc={pages[index]} index={index} playback={album ? playback : undefined}/></div> : <p className="utility-copy">暂无曲目</p>;
}
