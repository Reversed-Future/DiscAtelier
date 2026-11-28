import { useState } from 'react';
import type { EditionDraft } from '../library/types';
import type { ReleaseTrack } from '../metadata/gateway';
import { Modal } from '../ui/Modal';
import { NeteaseBrowser } from '../integrations/NeteaseBrowser';
import { TrackAssociationList } from '../collection/TrackAssociationList';
import type { useEditionMusicLinks } from './useEditionMusicLinks';

export function EditionMusicLinks({ edition, rows, rowsError, links, onClose }: {
  edition: EditionDraft; rows: ReleaseTrack[] | undefined; rowsError: string; links: ReturnType<typeof useEditionMusicLinks>; onClose(): void;
}) {
  const [search, setSearch] = useState<{ previousId: number | null } | null>(null);
  return <><Modal title="网易云关联" className="track-link-manager edition-music-links" onClose={onClose}>
    {links.error ? <p role="alert">{links.error} <button type="button" className="text-button" onClick={links.retry}>重试</button></p>
      : !links.loaded ? <p className="setting-hint" role="status">正在读取关联…</p> : <>
        <h3>关联专辑</h3>
        <div className="edition-linked-albums">{links.slots.map(slot => <div key={slot.previousId ?? 'first'}>
          <div><strong>{slot.album.title}</strong><small>{slot.album.artists.join(' / ')} · {slot.album.albumId}</small></div>
          <button type="button" className="text-button" aria-label={`更换《${slot.album.title}》的关联`} onClick={() => setSearch({previousId: slot.previousId})}>更换专辑</button>
        </div>)}{!links.slots.length && <div><span className="setting-hint">尚未关联专辑</span><button type="button" className="text-button" onClick={() => setSearch({previousId: null})}>选择专辑</button></div>}</div>
        <h3>单曲关联</h3>
        {rows ? <TrackAssociationList edition={edition} rows={rows} albums={links.albums} links={links.links} bindings={links.bindings} onSelect={links.select}/>
          : rowsError ? <p className="form-error" role="alert">{rowsError}</p> : <p className="setting-hint" role="status">正在读取曲目…</p>}
        <footer>{links.selection && <button className="text-button" type="button" onClick={links.reset}>撤销本次关联修改</button>}
          <button type="button" className="solid-button" onClick={onClose}>返回编辑</button></footer>
      </>}
  </Modal>{search && <NeteaseBrowser initialQuery={`${edition.title} ${edition.creator}`.trim()} autoSearch={!!edition.title.trim()}
    savedIds={[...links.savedAlbums.map(a => a.album.albumId).filter(id => id !== search.previousId), ...links.albums.map(a => a.album.albumId)]}
    confirmLabel={search.previousId === null ? '选择此专辑' : '替换当前关联'} onClose={() => setSearch(null)}
    onConfirm={async album => { links.replace(search.previousId, album, rows); setSearch(null); }}/>}</>;
}
