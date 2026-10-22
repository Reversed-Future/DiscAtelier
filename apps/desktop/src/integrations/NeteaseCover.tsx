import { useState } from 'react';

export function NeteaseCover({ url, large = false }: { url: string | null; large?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  return <span className={`netease-cover${large ? ' large' : ''}`} data-loading={!!url && failed !== url && loaded !== url} aria-hidden="true">
    {url && failed !== url ? <img key={url} src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
      data-loaded={loaded === url} onLoad={() => setLoaded(url)} onError={() => setFailed(url)}/> : <span className="search-cover-empty"/>}
  </span>;
}
