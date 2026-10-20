import { useEffect, useMemo, useState } from 'react';
import type { LibraryCopy } from '../library/types';
import { library, errorMessage } from '../library/gateway';
import { discogs, type EditionContent } from '../metadata/gateway';
import { discPages } from '../metadata/discTracks';
import { DiscTabs, DiscTrackPanel } from '../metadata/DiscTrackView';

export function EditionContents({ item }: { item: LibraryCopy }) {
  const [content, setContent] = useState<EditionContent | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const pages = useMemo(() => discPages(content?.tracks || [], item.edition.title), [content, item.edition.title]);
  useEffect(() => {
    let mounted = true;
    void library.content(item.editionId).then(value => { if (mounted) setContent(value); })
      .catch(cause => { if (mounted) setError(errorMessage(cause)); }).finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, [item.editionId]);
  return <section className="edition-contents" aria-busy={busy}>
    {!!content?.genres.length && <dl className="metadata"><div><dt>流派</dt><dd>{content.genres.join(' / ')}</dd></div></dl>}
    {!!content?.styles.length && <dl className="metadata"><div><dt>风格</dt><dd>{content.styles.join(' / ')}</dd></div></dl>}
    {!!pages.length && <div className="collection-tracks"><DiscTabs pages={pages} page={page} onChange={setPage}/><DiscTrackPanel disc={pages[page]} index={page}/></div>}
    {!content && item.source?.providerId === 'discogs' && <button className="text-button complete-content" disabled={busy} onClick={async () => {
      const id = Number(item.source!.externalId);
      if (!Number.isSafeInteger(id) || id <= 0) { setError('发行 ID 无效。'); return; }
      setBusy(true); setError('');
      try { setContent(await discogs.completeContent(item.editionId, id)); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
    }}>{busy ? '读取中' : '补全资料'}</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
