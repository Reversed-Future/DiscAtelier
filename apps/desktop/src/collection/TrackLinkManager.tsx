import { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { DiscTabs } from '../metadata/DiscTrackView';
import { discPages } from '../metadata/discTracks';
import type { ReleaseTrack } from '../metadata/gateway';
import type { MusicSupplement } from '../integrations/gateway';
import { trackKey, trackMatches } from '../integrations/trackMatches';
import type { LibraryCopy } from '../library/types';
import { TrackLinkPicker } from './TrackLinkPicker';

export function TrackLinkManager({ item, rows, album, onClose, onSaved }: {
  item: LibraryCopy; rows: ReleaseTrack[]; album: MusicSupplement; onClose(): void; onSaved(): Promise<void>;
}) {
  const [page, setPage] = useState(0);
  const [track, setTrack] = useState<ReleaseTrack | null>(null);
  const pages = useMemo(() => discPages(rows, item.edition.title), [rows, item.edition.title]);
  const matches = useMemo(() => trackMatches(rows, album), [rows, album]);
  const index = Math.min(page, Math.max(0, pages.length - 1));
  return <><Modal title="关联曲目" onClose={onClose} className="track-link-manager">
    <div className="collection-tracks"><DiscTabs pages={pages} page={index} onChange={setPage}/>
      <div className="track-link-list">{pages[index]?.tracks.filter(t => t.type_ !== 'heading').map((row, i) =>
        <button type="button" key={i} onClick={() => setTrack(row)}><span>{row.position}</span><strong>{row.title}</strong><small>{matches.get(trackKey(row))?.title || '未关联'}</small></button>
      )}</div>
    </div>
  </Modal>{track && <TrackLinkPicker item={item} track={track} album={album} onClose={() => setTrack(null)} onSaved={onSaved}/>}</>;
}
