import { useEffect, useState } from 'react';
import type { LibraryCopy } from '../library/types';
import type { ReleaseTrack } from '../metadata/gateway';
import { library, errorMessage } from '../library/gateway';
import { TrackLinkManager } from '../collection/TrackLinkManager';
import { netease, type MusicSupplement } from './gateway';
import { NeteaseBrowser } from './NeteaseBrowser';

export function NeteasePanel({ item, rows, onClose, onSaved }: { item: LibraryCopy; rows: ReleaseTrack[]; onClose(): void; onSaved(): Promise<void> }) {
  const [album, setAlbum] = useState<MusicSupplement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [linking, setLinking] = useState(false);
  useEffect(() => {
    let live = true;
    void netease.saved(item.editionId).then(value => { if (live) setAlbum(value); })
      .catch(e => { if (live) setError(errorMessage(e)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [item.editionId]);
  async function refreshLinks() { setAlbum(await netease.saved(item.editionId)); await onSaved(); }
  return <><NeteaseBrowser initialQuery={`${item.edition.title} ${item.edition.creator}`} initialAlbum={album} loading={loading} initialError={error}
    onClose={onClose} onConfirm={async value => { await netease.apply(item.editionId, item.editionRevision, value.albumId); setAlbum(value); await onSaved(); }}
    onUseCover={async value => {
      const dataUrl = await netease.albumCover(value.albumId);
      await library.updateEdition({ requestId: crypto.randomUUID(), editionId: item.editionId, expectedRevision: item.editionRevision,
        edition: item.edition, cover: { action: 'replace', dataUrl }, model: { action: 'keep' } });
      await onSaved();
      return dataUrl;
    }}
    footer={() => !!rows.length && <button type="button" className="text-button" onClick={() => setLinking(true)}>关联曲目</button>}/>
    {linking && album && <TrackLinkManager item={item} rows={rows} album={album} onClose={() => setLinking(false)} onSaved={refreshLinks}/>}
  </>;
}
