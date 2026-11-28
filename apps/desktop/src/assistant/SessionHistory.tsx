import { useEffect, useState } from 'react';
import { errorMessage } from '../library/gateway';
import { assistant, type HistoryEntry } from './gateway';

export function SessionHistory({ activeId, disabled, onSelect }: { activeId?: string; disabled: boolean; onSelect(id: string): void }) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<{ items: HistoryEntry[]; nextOffset: number | null } | null>(null);
  const [error, setError] = useState('');
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    setPage(null); setError('');
    assistant.history(offset).then(value => { if (active) setPage(value); })
      .catch(cause => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [offset, attempt]);
  return <div className="assistant-log assistant-history" aria-label="历史会话">
    {error ? <p role="alert">{error} <button className="text-button" onClick={() => retry(n => n + 1)}>重试</button></p>
      : !page ? <p className="setting-hint">正在读取会话…</p>
      : !page.items.length && <p className="setting-hint">暂无历史会话</p>}
    {page?.items.map(row => <button key={row.id} className="assistant-history-row" disabled={disabled}
      aria-current={row.id === activeId ? 'true' : undefined} onClick={() => onSelect(row.id)}>
      <span>{row.title}</span><time dateTime={row.updatedAt}>{new Date(row.updatedAt).toLocaleString()}</time>
    </button>)}
    <div className="assistant-history-pages">
      {offset > 0 && <button className="text-button" onClick={() => setOffset(n => Math.max(0,n-30))}>上一页</button>}
      {page?.nextOffset != null && <button className="text-button" onClick={() => setOffset(page.nextOffset!)}>下一页</button>}
    </div>
  </div>;
}
