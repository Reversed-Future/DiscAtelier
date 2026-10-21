import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LibraryCopy } from '../library/types';
import { Cover } from './Cover';
import { ModelPreview } from '../models/ModelPreview';
import { enter } from '../ui/motion';
import { ConvertedPrice } from '../exchange/ConvertedPrice';
import { formatPrice } from '../library/money';
import { statuses } from '../library/types';

export function Browse({ items, selectedId, select, inspect, organize, modelActive, takenId, artworkSlot }: {
  items: LibraryCopy[]; selectedId: string; select(id: string): void; inspect(item: LibraryCopy): void; organize: boolean; modelActive: boolean; takenId?: string; artworkSlot(node: HTMLDivElement | null): void;
}) {
  const index = Math.max(0, items.findIndex(item => item.id === selectedId));
  const caption = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const startX = useRef<number | undefined>(undefined);
  const dragged = useRef(false);
  const [keyNavigation, setKeyNavigation] = useState(false);
  useEffect(() => { enter(caption.current); }, [items[index]?.id]);
  useEffect(() => { enter(root.current, 0); }, [organize]);
  useEffect(() => { if (keyNavigation) root.current?.querySelector<HTMLButtonElement>('[data-current="true"]')?.focus(); }, [index, keyNavigation]);
  if (organize) return <div className="organizer" ref={root}><table><thead><tr><th>收藏</th><th>载体</th><th>状态</th><th>价格</th></tr></thead><tbody>
    {items.map(item => <tr key={item.id}><td>{item.modelAssetId ? <ModelPreview assetId={item.modelAssetId} authored={!item.coverAssetId} fallback={<Cover edition={item.edition} assetId={item.coverAssetId}/>}/> : <Cover edition={item.edition} assetId={item.coverAssetId}/>}<div><button className="row-title" onClick={() => inspect(item)}>{item.edition.title}<span>{item.edition.creator}</span></button></div></td>
      <td>{item.edition.media.map(medium => medium.carrierId.toUpperCase()).join(' + ')}</td><td>{statuses.find(status => status.id === item.copy.status)?.label}</td>
      <td>{formatPrice(item.copy.amountMinor, item.copy.currency)}<ConvertedPrice amount={item.copy.amountMinor} currency={item.copy.currency}/></td></tr>)}
  </tbody></table></div>;
  return <div className="record-store" ref={root} onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); setKeyNavigation(true);
    select(items[Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))].id);
  }}>
    <div className="record-stage" onPointerDown={event => { startX.current = event.clientX; dragged.current = false; }} onPointerUp={event => {
      if (startX.current === undefined) return;
      const delta = event.clientX - startX.current;
      if (Math.abs(delta) > 65) { dragged.current = true; select(items[Math.max(0, Math.min(items.length - 1, index + (delta < 0 ? 1 : -1)))].id); }
      startX.current = undefined;
    }} onPointerCancel={() => { startX.current = undefined; }}>
      {items.map((item, itemIndex) => {
        const distance = itemIndex - index;
        if (Math.abs(distance) > 3) return null;
        return <button key={item.id} className={`record-sleeve${item.modelAssetId ? ' has-model' : ''}`} data-category={item.edition.categoryId} data-current={distance === 0} data-offstage={Math.abs(distance) > 2} inert={Math.abs(distance) > 2}
          aria-label={`${distance === 0 ? '取出' : '选择'} ${item.edition.title}`} tabIndex={distance === 0 ? 0 : -1}
          style={{ '--distance': distance, '--abs-distance': Math.abs(distance), '--direction': Math.sign(distance) } as CSSProperties}
          onClick={() => { if (dragged.current) { dragged.current = false; return; } setKeyNavigation(false); distance === 0 ? inspect(item) : select(item.id); }}>
          {/* Keep the same decoded image node while it moves into/out of the
              centre. Replacing it with a portal forced another cache lookup. */}
          <div className="shelf-standin" data-taken={takenId === item.id}>{item.modelAssetId ? <ModelPreview assetId={item.modelAssetId} authored={!item.coverAssetId} fallback={<Cover edition={item.edition} assetId={item.coverAssetId}/>}/> : <Cover edition={item.edition} assetId={item.coverAssetId}/>}</div>
          {distance === 0 && modelActive && <div className="shelf-artwork-slot" ref={artworkSlot}/>}
        </button>;
      })}
    </div>
    <div className="record-caption" ref={caption}><span className="record-counter">{String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span><h1>{items[index]?.edition.title}</h1><p>{items[index]?.edition.creator}</p></div>
  </div>;
}
