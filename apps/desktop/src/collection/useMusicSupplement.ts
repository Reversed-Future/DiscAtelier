import { useEffect, useState } from 'react';
import type { LibraryCopy } from '../library/types';
import { errorMessage } from '../library/gateway';
import { netease, type MusicSupplement } from '../integrations/gateway';

export function useMusicSupplement(item: LibraryCopy) {
  const [value, setValue] = useState<MusicSupplement | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    if (item.edition.categoryId !== 'music') return;
    void netease.saved(item.editionId).then(v => { if (live) { setValue(v); setError(''); } }).catch(e => { if (live) setError(errorMessage(e)); });
    return () => { live = false; };
  }, [item.editionId, item.editionRevision, item.edition.categoryId]);
  return { value, error };
}
