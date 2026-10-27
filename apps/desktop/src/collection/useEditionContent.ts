import { useEffect, useState } from 'react';
import type { LibraryCopy } from '../library/types';
import { library, errorMessage } from '../library/gateway';
import { discogs, type EditionContent } from '../metadata/gateway';

/** One read shared by the metadata and tracks tabs for this inspection. */
export function useEditionContent(item: LibraryCopy) {
  const [content, setContent] = useState<EditionContent | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    setBusy(true); setError('');
    void library.content(item.editionId).then(value => { if (mounted) setContent(value); })
      .catch(cause => { if (mounted) setError(errorMessage(cause)); }).finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, [item.editionId, item.editionRevision]);
  async function complete() {
    if (busy || item.source?.providerId !== 'discogs') return;
    const id = Number(item.source.externalId);
    if (!Number.isSafeInteger(id) || id <= 0) { setError('发行 ID 无效。'); return; }
    setBusy(true); setError('');
    try { setContent(await discogs.completeContent(item.editionId, id)); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return { content, busy, error, complete, canComplete: !content?.detailsLoaded && item.source?.providerId === 'discogs' };
}
