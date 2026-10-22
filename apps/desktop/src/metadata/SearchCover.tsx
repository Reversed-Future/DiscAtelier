import { useState } from 'react';

// Only use image URLs supplied by Discogs; never derive an image URL from a release ID.
function imageUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname === 'i.discogs.com' && !url.port && !url.username && !url.password) return url.href;
  } catch { /* Missing artwork uses the same quiet placeholder as a failed request. */ }
}

export function SearchCover({ thumb, cover }: { thumb: string; cover: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const src = [imageUrl(thumb), imageUrl(cover)].find(url => url && !failed.includes(url));
  const loaded = !!src && loadedSrc === src;
  return <span className="search-cover" data-loading={!!src && !loaded} data-loaded={loaded} aria-hidden="true">
    {src ? <img key={src} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
      onLoad={() => setLoadedSrc(src)} onError={() => setFailed(values => [...values, src])}/> : <span className="search-cover-empty"/>}
  </span>;
}
