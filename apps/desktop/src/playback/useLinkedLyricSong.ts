import { useEffect, useState } from 'react';
import { netease } from '../integrations/gateway';
import { linkedLyricSong } from './linkedLyricSong';

/** Resolve only through saved collection mappings; never search arbitrary filenames. */
export function useLinkedLyricSong(editionId: string | undefined, number: number | null | undefined, discKey?: string | null) {
  const key = JSON.stringify([editionId, number, discKey === undefined ? 'local' : discKey]);
  const [result, setResult] = useState<{ key: string; id: number | null } | null>(null);
  useEffect(() => {
    if (!editionId || !number) return;
    let live = true;
    void netease.queueContext(editionId).then(context => {
      const id = linkedLyricSong(context, number, discKey);
      if (live) setResult({ key, id });
    }).catch(() => { if (live) setResult({ key, id: null }); });
    return () => { live = false; };
  }, [key]);
  return { songId: result?.key === key ? result.id : null, resolving: !!editionId && !!number && result?.key !== key };
}
