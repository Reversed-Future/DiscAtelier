import { useEffect, useState } from 'react';
import { errorMessage, library } from '../library/gateway';
import type { EditionContent } from '../metadata/gateway';

/** Keep the editor draft above the tab panels; opening a tab never writes data. */
export function useContentDraft(editionId: string, enabled: boolean) {
  const [value, setValue] = useState<EditionContent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled || value) return;
    let live = true;
    setError('');
    void library.content(editionId).then(content => {
      if (live) setValue(content || { genres: [], styles: [], tracks: [], credits: [], companies: [], notes: '', detailsLoaded: false });
    }).catch(cause => { if (live) setError(errorMessage(cause)); });
    return () => { live = false; };
  }, [editionId, enabled, value]);
  return { value, error, pending: enabled && !value, changed: dirty ? value : null,
    change(content: EditionContent) { setValue(content); setDirty(true); setError(''); } };
}
