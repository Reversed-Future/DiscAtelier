import { useEffect, useState } from 'react';
import type { LibraryCopy } from '../library/types';
import { errorMessage } from '../library/gateway';
import { netease, type LinkedMusicAlbum, type DiscAlbumLink, type SongLink } from '../integrations/gateway';

export function useMusicSupplement(item: LibraryCopy) {
  const [value, setValue] = useState<LinkedMusicAlbum[]>([]);
  const [links, setLinks] = useState<SongLink[]>([]);
  const [bindings, setBindings] = useState<DiscAlbumLink[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    if (item.edition.categoryId !== 'music') return;
    void Promise.all([netease.albums(item.editionId), netease.links(item.editionId), netease.discAlbums(item.editionId)]).then(([v, l, b]) => { if (live) { setValue(v); setLinks(l); setBindings(b); setError(''); } }).catch(e => { if (live) setError(errorMessage(e)); });
    return () => { live = false; };
  }, [item.editionId, item.editionRevision, item.edition.categoryId]);
  return { value, links, bindings, error };
}
