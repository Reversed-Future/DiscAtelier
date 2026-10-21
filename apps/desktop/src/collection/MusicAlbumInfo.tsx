import { useEffect, useRef, useState } from 'react';
import type { LinkedMusicAlbum } from '../integrations/gateway';
import { AlbumTabs } from '../integrations/AlbumTabs';
import { enter } from '../ui/motion';

export function MusicAlbumInfo({ albums, title }: { albums: LinkedMusicAlbum[]; title: string }) {
  const [selected, setSelected] = useState<number>();
  const album = (albums.find(a => a.album.albumId === selected) || albums[0])?.album;
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { enter(body.current, 0); }, [album?.albumId]);
  if (!album) return null;
  return <section className="linked-album-info">
    {albums.length > 1 && <AlbumTabs albums={albums} selected={album.albumId} onChange={setSelected}/>}
    <div ref={body} role="region" aria-label={album.title}><dl className="metadata">
      {album.title !== title && <div><dt>网易云专辑</dt><dd>{album.title}</dd></div>}
      {(album.company || album.publishedAt > 0) && <div><dt>数字发行</dt><dd>{[album.company, album.publishedAt > 0 ? new Date(album.publishedAt).toLocaleDateString('zh-CN') : ''].filter(Boolean).join(' · ')}</dd></div>}
    </dl>
    {album.description ? <section className="edition-introduction"><h4>简介 <small>网易云</small></h4><p>{album.description}</p></section> : <p className="setting-hint">该数字专辑暂无简介</p>}
    </div>
  </section>;
}
