import { useMemo, useState } from 'react';
import { discPages } from '../metadata/discTracks';
import { DiscTabs, DiscTrackPanel } from '../metadata/DiscTrackView';
import type { ReleaseTrack } from '../metadata/gateway';
import type { MusicSupplement } from '../integrations/gateway';
import { trackKey, trackMatches } from '../integrations/trackMatches';
import type { PlaybackController } from '../playback/usePlayback';
import type { LibraryCopy } from '../library/types';
import { time } from '../playback/gateway';
import { TrackLinkPicker } from './TrackLinkPicker';

export function CollectionTracks({ rows, album, item, player, onSaved }: { rows: ReleaseTrack[]; album: MusicSupplement | null; item: LibraryCopy; player: PlaybackController; onSaved(): Promise<void> }) {
  const [page, setPage] = useState(0), [linking, setLinking] = useState<ReleaseTrack | null>(null);
  const pages = useMemo(() => discPages(rows.length ? rows : (album?.tracks || []).map(t => ({ title:t.title, position:`${t.disc}-${t.number}`, duration:time(t.durationMs / 1000), type_:'track' })), item.edition.title), [rows, album, item.edition.title]);
  const matches = useMemo(() => trackMatches(rows, album), [rows, album]);
  const index = Math.min(page, Math.max(0, pages.length - 1));
  function actions(track: ReleaseTrack) {
    const song = rows.length ? matches.get(trackKey(track)) : album?.tracks.find(t => `${t.disc}-${t.number}` === track.position && t.title === track.title);
    const selected = song && player.snapshot?.source.mountPoint === item.editionId && player.snapshot.source.playlist === `netease-song:${song.id}` && player.active;
    return <span className="track-play-actions">
      {song && <button type="button" className="track-play" disabled={player.busy} aria-label={`${selected && !player.snapshot?.paused ? '暂停' : '播放'} ${track.title}`} onClick={() => selected ? void player.control({action:'pause',paused:!player.snapshot?.paused}) : void player.startNetease(item.editionId, song.id)}>{selected && !player.snapshot?.paused ? 'Ⅱ' : '▷'}</button>}
      {album && !!rows.length && <button type="button" className="track-link" aria-label={`关联 ${track.title}`} onClick={() => setLinking(track)}>{song ? '关联' : '选择曲目'}</button>}
    </span>;
  }
  return <>{pages.length ? <div className="collection-tracks"><DiscTabs pages={pages} page={index} onChange={setPage}/><DiscTrackPanel disc={pages[index]} index={index} actions={album ? actions : undefined}/></div> : <p className="utility-copy">暂无曲目</p>}
    {linking && album && <TrackLinkPicker item={item} track={linking} album={album} onClose={() => setLinking(null)} onSaved={onSaved}/>}
  </>;
}
