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
  const src = [imageUrl(thumb), imageUrl(cover)].find(url => url && !failed.includes(url));
  return <span className="search-cover" aria-hidden="true">
    {src ? <img key={src} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
      onError={() => setFailed(values => [...values, src])}/> : <span className="search-cover-empty"/>}
  </span>;
}
