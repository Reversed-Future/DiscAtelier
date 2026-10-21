import { useEffect, useState } from 'react';
import type { LibraryCopy } from '../library/types';
import type { ReleaseTrack } from '../metadata/gateway';
import { library, errorMessage } from '../library/gateway';
import { TrackLinkManager } from '../collection/TrackLinkManager';
import { netease, type LinkedMusicAlbum, type DiscAlbumLink, type SongLink } from './gateway';
import { collectionRows } from './albumTracks';
import { AlbumTabs } from './AlbumTabs';
import { NeteaseBrowser } from './NeteaseBrowser';

export function NeteasePanel({ item, rows, onClose, onSaved }: { item: LibraryCopy; rows: ReleaseTrack[]; onClose(): void; onSaved(): Promise<void> }) {
  const [browserKey, setBrowserKey] = useState(0), [browserBusy, setBrowserBusy] = useState(false);
  const [albums, setAlbums] = useState<LinkedMusicAlbum[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [bindings, setBindings] = useState<DiscAlbumLink[]>([]);
  const [links, setLinks] = useState<SongLink[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linking, setLinking] = useState(false), [removing, setRemoving] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([netease.albums(item.editionId), netease.links(item.editionId), netease.discAlbums(item.editionId)]).then(([value, savedLinks, savedBindings]) => { if (live) { setAlbums(value); setSelected(value[0]?.album.albumId ?? null); setLinks(savedLinks); setBindings(savedBindings); } })
      .catch(e => { if (live) setError(errorMessage(e)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [item.editionId]);
  async function refresh() { const [value, savedLinks, savedBindings] = await Promise.all([netease.albums(item.editionId), netease.links(item.editionId), netease.discAlbums(item.editionId)]); setAlbums(value); setLinks(savedLinks); setBindings(savedBindings); await onSaved(); }
  async function run(action: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await action(); await refresh(); } catch(e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  const album = albums.find(a => a.album.albumId === selected)?.album ?? null;
  const trackRows = collectionRows(rows, albums);
  async function move(id: number, offset: number) {
    const ids = albums.map(a => a.album.albumId), index = ids.indexOf(id);
    if (index < 0 || index + offset < 0 || index + offset >= ids.length) return;
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    await run(() => netease.reorder(item.editionId, item.editionRevision, ids));
  }
  return <><NeteaseBrowser key={browserKey} onBusyChange={setBrowserBusy} initialQuery={`${item.edition.title} ${item.edition.creator}`} initialAlbum={album} loading={loading || busy} initialError={error}
    savedIds={albums.map(a => a.album.albumId)} confirmLabel="添加关联专辑"
    header={!!albums.length && <div className="linked-album-toolbar"><AlbumTabs albums={albums} selected={selected ?? albums[0]?.album.albumId} onChange={id => { setSelected(id); setRemoving(null); }} disabled={busy || loading || browserBusy}/><button type="button" className="text-button" disabled={busy || loading || browserBusy} onClick={() => { setSelected(null); setRemoving(null); setBrowserKey(k => k + 1); }}>添加专辑</button></div>}
    onClose={onClose} onConfirm={async value => { await netease.apply(item.editionId, item.editionRevision, value.albumId); await refresh(); setSelected(value.albumId); }}
    onUseCover={async value => {
      const dataUrl = await netease.albumCover(value.albumId);
      await library.updateEdition({ requestId: crypto.randomUUID(), editionId: item.editionId, expectedRevision: item.editionRevision,
        edition: item.edition, cover: { action: 'replace', dataUrl }, model: { action: 'keep' } });
      await onSaved(); return dataUrl;
    }}
    footer={shown => <>
      {!!trackRows.length && <button type="button" className="text-button" disabled={busy || loading || browserBusy} onClick={() => setLinking(true)}>关联曲目</button>}
      {shown && albums.some(a => a.album.albumId === shown.albumId) && <div className="linked-album-actions">
        {albums.length > 1 && <><button type="button" className="text-button" disabled={busy || loading || albums[0].album.albumId === shown.albumId} onClick={() => void move(shown.albumId, -1)}>前移</button><button type="button" className="text-button" disabled={busy || loading || albums.at(-1)?.album.albumId === shown.albumId} onClick={() => void move(shown.albumId, 1)}>后移</button></>}
        {removing === shown.albumId ? <><span className="setting-hint">解除《{shown.title}》关联？</span><button type="button" className="text-button" disabled={busy} onClick={() => void run(async () => { await netease.remove(item.editionId, item.editionRevision, shown.albumId); setSelected(albums.find(a => a.album.albumId !== shown.albumId)?.album.albumId ?? null); setRemoving(null); })}>确认解除</button><button type="button" className="text-button" disabled={busy} onClick={() => setRemoving(null)}>取消</button></> : <button type="button" className="text-button" disabled={busy || loading || browserBusy} onClick={() => setRemoving(shown.albumId)}>解除关联</button>}
      </div>}
    </>}/>
    {linking && <TrackLinkManager item={item} rows={rows} albums={albums} links={links} bindings={bindings} onClose={() => setLinking(false)} onSaved={refresh}/>}
  </>;
}
