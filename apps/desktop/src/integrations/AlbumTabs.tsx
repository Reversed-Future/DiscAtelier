import type { LinkedMusicAlbum } from './gateway';

export function AlbumTabs({ albums, selected, onChange, disabled = false }: { albums: LinkedMusicAlbum[]; selected?: number; onChange(id: number): void; disabled?: boolean }) {
  return <nav className="detail-tabs linked-album-tabs" role="tablist" aria-label="关联的网易云专辑">{albums.map(({ album }, index) =>
    <button type="button" role="tab" key={album.albumId} disabled={disabled} aria-selected={album.albumId === selected} tabIndex={album.albumId === selected ? 0 : -1}
      className={album.albumId === selected ? 'active' : ''} title={album.title} onClick={() => onChange(album.albumId)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % albums.length : event.key === 'ArrowLeft' ? (index + albums.length - 1) % albums.length : event.key === 'Home' ? 0 : event.key === 'End' ? albums.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); onChange(albums[next].album.albumId);
        (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
      }}>{album.title}</button>)}</nav>;
}
