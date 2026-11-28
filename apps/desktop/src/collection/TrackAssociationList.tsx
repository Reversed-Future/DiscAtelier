import { useMemo, useState, type ReactNode } from 'react';
import { DiscTabs } from '../metadata/DiscTrackView';
import { discPages, type DiscPage } from '../metadata/discTracks';
import type { ReleaseTrack } from '../metadata/gateway';
import type { EditionDraft } from '../library/types';
import type { LinkedMusicAlbum, DiscAlbumLink, NeteaseSong, SongLink } from '../integrations/gateway';
import { albumMatches, albumRows, albumRowLabel, trackLeaves } from '../integrations/albumTracks';
import { trackKey } from '../integrations/trackMatches';
import { TrackLinkPicker } from './TrackLinkPicker';

export function TrackAssociationList({ edition, rows, albums, links, bindings, disabled, discControl, onSelect }: {
  edition: EditionDraft; rows: ReleaseTrack[]; albums: LinkedMusicAlbum[]; links: SongLink[]; bindings: DiscAlbumLink[];
  disabled?: boolean; discControl?(disc: DiscPage, index: number): ReactNode;
  onSelect(track: ReleaseTrack, song: NeteaseSong | null): Promise<void> | void;
}) {
  const [page, setPage] = useState(0);
  const [track, setTrack] = useState<ReleaseTrack | null>(null);
  const physical = useMemo(() => trackLeaves(rows).length > 0, [rows]);
  const pages = useMemo(() => physical ? discPages(rows, edition.title, edition.media) : albums.map(a => ({
    key: String(a.album.albumId), name: a.album.title, numbered: false, tracks: albumRows(a),
  })), [rows, albums, physical, edition.title, edition.media]);
  const matches = useMemo(() => albumMatches(rows, albums, links, bindings, edition.media), [rows, albums, links, bindings, edition.media]);
  const index = Math.min(page, Math.max(0, pages.length - 1));
  const tracks = trackLeaves(pages[index]?.tracks ?? []);
  const position = (row: ReleaseTrack) => physical ? row.position : albumRowLabel(row, albums);
  return <><div className="collection-tracks">
    {!!pages.length && <DiscTabs pages={pages} page={index} onChange={next => { if (!disabled) setPage(next); }}/>}
    {physical && !!albums.length && pages[index] && discControl?.(pages[index], index)}
    {!!tracks.length && <div className="track-link-columns"><span>{physical ? '实体曲目' : '专辑曲目'}</span><span>当前关联的网易云歌曲</span></div>}
    <div className="track-link-list">{tracks.map((row, i) =>
      <button type="button" disabled={disabled} key={i} onClick={() => setTrack(row)}>
        <span>{position(row)}</span><strong>{row.title}</strong><small>{matches.get(trackKey(row))?.title || '未关联'}</small>
      </button>)}{!tracks.length && <p className="setting-hint">暂无可关联的曲目</p>}</div>
  </div>{track && <TrackLinkPicker track={track} positionLabel={position(track)} albums={albums} current={matches.get(trackKey(track))}
    onClose={() => setTrack(null)} onSelect={song => onSelect(track, song)}/>}</>;
}
