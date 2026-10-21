import { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { DiscAlbumSelector } from './DiscAlbumSelector';
import { DiscTabs, discTitle } from '../metadata/DiscTrackView';
import { discPages } from '../metadata/discTracks';
import type { ReleaseTrack } from '../metadata/gateway';
import type { LinkedMusicAlbum, DiscAlbumLink, SongLink } from '../integrations/gateway';
import { albumMatches, albumRows, albumRowLabel, trackLeaves } from '../integrations/albumTracks';
import { trackKey } from '../integrations/trackMatches';
import type { LibraryCopy } from '../library/types';
import { TrackLinkPicker } from './TrackLinkPicker';

export function TrackLinkManager({ item, rows, albums, links, bindings, onClose, onSaved }: {
  item: LibraryCopy; rows: ReleaseTrack[]; albums: LinkedMusicAlbum[]; links: SongLink[]; bindings: DiscAlbumLink[]; onClose(): void; onSaved(): Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [track, setTrack] = useState<ReleaseTrack | null>(null);
  const pages = useMemo(() => trackLeaves(rows).length ? discPages(rows, item.edition.title) : albums.map(a => ({ key: String(a.album.albumId), name: a.album.title, numbered: false, tracks: albumRows(a) })), [rows, albums, item.edition.title]);
  const matches = useMemo(() => albumMatches(rows, albums, links, bindings), [rows, albums, links, bindings]);
  const index = Math.min(page, Math.max(0, pages.length - 1));
  return <><Modal title="关联曲目" onClose={onClose} busy={busy} className="track-link-manager">
    <div className="collection-tracks"><DiscTabs pages={pages} page={index} onChange={next => { if (!busy) setPage(next); }}/>
      {!!trackLeaves(rows).length && !!albums.length && pages[index] && <DiscAlbumSelector item={item} discKey={pages[index].key} title={discTitle(pages[index], index)} albums={albums} bindings={bindings} onSaved={onSaved} onBusy={setBusy}/>}
      <div className="track-link-list">{pages[index]?.tracks.filter(t => t.type_ !== 'heading').map((row, i) =>
        <button type="button" disabled={busy} key={i} onClick={() => setTrack(row)}><span>{trackLeaves(rows).length ? row.position : albumRowLabel(row, albums)}</span><strong>{row.title}</strong><small>{matches.get(trackKey(row))?.title || '未关联'}</small></button>
      )}</div>
    </div>
  </Modal>{track && <TrackLinkPicker item={item} track={track} positionLabel={trackLeaves(rows).length ? track.position : albumRowLabel(track, albums)} albums={albums} current={links.find(l => l.position === track.position && l.title === track.title)?.song} onClose={() => setTrack(null)} onSaved={onSaved}/>}</>;
}
