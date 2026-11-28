import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { DiscAlbumSelector } from './DiscAlbumSelector';
import { discTitle } from '../metadata/DiscTrackView';
import type { ReleaseTrack } from '../metadata/gateway';
import { netease, type LinkedMusicAlbum, type DiscAlbumLink, type SongLink } from '../integrations/gateway';
import type { LibraryCopy } from '../library/types';
import { TrackAssociationList } from './TrackAssociationList';

export function TrackLinkManager({ item, rows, albums, links, bindings, onClose, onSaved }: {
  item: LibraryCopy; rows: ReleaseTrack[]; albums: LinkedMusicAlbum[]; links: SongLink[]; bindings: DiscAlbumLink[]; onClose(): void; onSaved(): Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return <Modal title="关联曲目" onClose={onClose} busy={busy} className="track-link-manager">
    <TrackAssociationList edition={item.edition} rows={rows} albums={albums} links={links} bindings={bindings} disabled={busy}
      discControl={(disc, index) => <DiscAlbumSelector item={item} discKey={disc.key} title={discTitle(disc, index)} albums={albums} bindings={bindings} onSaved={onSaved} onBusy={setBusy}/>}
      onSelect={async (track, song) => {
        await netease.link(item.editionId, item.editionRevision, track.position, track.title, song?.id ?? null);
        await onSaved();
      }}/>
  </Modal>;
}
