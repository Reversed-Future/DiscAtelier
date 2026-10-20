import { useMemo, useState } from 'react';
import type { useEditionContent } from './useEditionContent';
import { discPages } from '../metadata/discTracks';
import { DiscTabs, DiscTrackPanel } from '../metadata/DiscTrackView';

export function EditionContents({ title, section, state }: {
  title: string; section: 'metadata' | 'tracks'; state: ReturnType<typeof useEditionContent>;
}) {
  const { content, busy, error, complete, canComplete } = state;
  const [page, setPage] = useState(0);
  const pages = useMemo(() => section === 'tracks' ? discPages(content?.tracks || [], title) : [], [content, title, section]);
  return <section className="edition-contents" data-section={section} aria-busy={busy}>
    {section === 'metadata' && <>
      {!!content?.genres.length && <dl className="metadata"><div><dt>流派</dt><dd>{content.genres.join(' / ')}</dd></div></dl>}
      {!!content?.styles.length && <dl className="metadata"><div><dt>风格</dt><dd>{content.styles.join(' / ')}</dd></div></dl>}
    </>}
    {section === 'tracks' && (pages.length
      ? <div className="collection-tracks"><DiscTabs pages={pages} page={page} onChange={setPage}/><DiscTrackPanel disc={pages[page]} index={page}/></div>
      : !canComplete && <p className="utility-copy">{busy ? '读取中' : '暂无曲目'}</p>)}
    {canComplete && <button className="text-button complete-content" disabled={busy} onClick={() => void complete()}>{busy ? '读取中' : '补全资料'}</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
