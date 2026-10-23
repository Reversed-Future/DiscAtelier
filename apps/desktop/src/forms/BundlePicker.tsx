import { useEffect, useState } from 'react';
import type { CopyDraft, LibraryCopy } from '../library/types';
import { library, errorMessage } from '../library/gateway';

export async function applyBundlePurchase(purchase: CopyDraft, bundle: LibraryCopy[]) {
  for (const target of bundle) {
    await library.update({
      requestId: crypto.randomUUID(),
      id: target.id,
      expectedRevision: target.revision,
      copy: {
        ...target.copy,
        status: purchase.status,
        acquiredAt: purchase.acquiredAt,
        seller: purchase.seller,
        purchaseUrl: purchase.purchaseUrl,
        currency: purchase.currency,
        amountMinor: 0,
      },
    });
  }
}

export function BundlePicker({ excludeId, value, onChange }: {
  excludeId?: string; value: LibraryCopy[]; onChange(value: LibraryCopy[]): void;
}) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<LibraryCopy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const text = query.trim();
    if (!text) { setCandidates([]); setLoading(false); setError(''); return; }
    let live = true;
    setLoading(true); setError(''); setCandidates([]);
    const timer = setTimeout(() => {
      void Promise.all(['music', 'video'].map(categoryId => library.list({ categoryId, status: null, query: text })))
        .then(pages => {
          if (!live) return;
          const seen = new Set<string>();
          setCandidates(pages.flatMap(page => page.copies)
            .filter(item => item.id !== excludeId && !seen.has(item.id) && !!seen.add(item.id)));
        })
        .catch(cause => { if (live) setError(errorMessage(cause)); })
        .finally(() => { if (live) setLoading(false); });
    }, 150);
    return () => { live = false; clearTimeout(timer); };
  }, [query, excludeId]);
  const selectedIds = new Set(value.map(item => item.id));
  const visible = candidates.filter(item => !selectedIds.has(item.id));
  function toggle(item: LibraryCopy) {
    if (selectedIds.has(item.id)) onChange(value.filter(entry => entry.id !== item.id));
    else onChange([...value, item]);
  }
  return <section className="bundle-picker">
    <div className="bundle-picker-heading"><strong>同捆购买</strong><span>{value.length ? `已选 ${value.length} 项` : '输入关键词查找'}</span></div>
    <p className="setting-hint">保存时把购入日期、购入位置、购买链接、币种和状态写入所选条目；价格不复制、不拆分，同捆条目记为 0 元。</p>
    <input aria-label="搜索同捆条目" value={query} placeholder="搜索同捆的 CD 或影像" onChange={event => setQuery(event.target.value)}/>
    {!!value.length && <div className="bundle-selected" aria-label="已选同捆">
      {value.map(item => <label className="bundle-row selected" key={item.id}>
        <input type="checkbox" checked onChange={() => toggle(item)}/>
        <span className="bundle-row-title" title={item.edition.title}>{item.edition.title}</span>
      </label>)}
    </div>}
    {!!query.trim() && <div className="bundle-options" aria-busy={loading}>
      {loading && <p className="bundle-empty">正在搜索…</p>}
      {!loading && error && <p className="form-error" role="alert">{error}</p>}
      {!loading && !error && !visible.length && <p className="bundle-empty">没有匹配的条目</p>}
      {!loading && !error && visible.map(item => <label className="bundle-row" key={item.id}>
        <input type="checkbox" checked={false} onChange={() => toggle(item)}/>
        <span className="bundle-row-title" title={item.edition.title}>{item.edition.title}</span>
      </label>)}
    </div>}
  </section>;
}
