import { useRef } from 'react';
import { statuses, type LibrarySnapshot } from '../library/types';
import { formatPrice } from '../library/money';
import { Icon } from './Icon';

export function CollectionMenu({ status, snapshot, organize, onStatus, onOrganize, onOptical, onSettings }: {
  status: string | null; snapshot: LibrarySnapshot | null; organize: boolean;
  onStatus(value: string | null): void; onOrganize(): void; onOptical(): void; onSettings(): void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  function choose(action: () => void) { menu.current?.hidePopover(); action(); }
  return <div id="tools-popover" popover="auto" ref={menu} onToggle={event => {
    if (event.newState === 'open') menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }}>
    <div className="menu-filter" aria-label="收藏范围">
      {[{ id: 'all', label: '全部' }, ...statuses].map(item => <button key={item.id} aria-pressed={(status || 'all') === item.id}
        onClick={() => choose(() => onStatus(item.id === 'all' ? null : item.id))}>{item.label}</button>)}
    </div>
    <button onClick={() => choose(onOrganize)}><Icon name="list"/><span>{organize ? '返回陈列' : '整理收藏'}</span><span className="menu-arrow">›</span></button>
    <button onClick={() => choose(onOptical)}><Icon name="disc"/><span>光驱</span><span className="menu-arrow">›</span></button>
    <button onClick={() => choose(onSettings)}><Icon name="settings"/><span>设置</span><span className="menu-arrow">›</span></button>
    <div className="menu-summary" aria-label="收藏统计">
      <div><span>{snapshot?.copies.length || 0} 套</span><span>{snapshot?.mediumCount || 0} 张</span></div>
      <div>{Object.entries(snapshot?.amounts || {}).map(([currency, amount]) => <span key={currency}>{formatPrice(amount, currency)}</span>)}</div>
      {!!snapshot?.unpricedCount && <small>{snapshot.unpricedCount} 套未填价格</small>}
    </div>
  </div>;
}
