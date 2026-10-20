import { useEffect, useRef, useState } from 'react';
import type { Descriptor, LibraryCopy } from '../library/types';
import { mediumLabel } from '../library/mediumLabel';
import { statuses } from '../library/types';
import { library, errorMessage } from '../library/gateway';
import { formatPrice, parsePrice, priceInput } from '../library/money';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { enter } from '../ui/motion';
import { PurchaseFields } from '../forms/PurchaseFields';
import { CollectionSource } from '../metadata/CollectionSource';

export function Inspection({ item, carriers, onClose, onSaved, duplicate, edit, artworkSlot, prepareClose, modelBusy }: {
  item: LibraryCopy; carriers: Descriptor[]; onClose(): void; onSaved(): Promise<void>; duplicate(): void; edit(): void;
  artworkSlot(node: HTMLDivElement | null): void; prepareClose(): Promise<void>; modelBusy: boolean;
}) {
  const [tab, setTab] = useState('metadata');
  const [side, setSide] = useState(false);
  const [copy, setCopy] = useState(item.copy);
  const [amount, setAmount] = useState(priceInput(item.copy.amountMinor, item.copy.currency));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const content = useRef<HTMLDivElement>(null);
  const attempt = useRef({ payload: '', requestId: crypto.randomUUID() });
  useEffect(() => { content.current?.scrollTo(0, 0); enter(content.current, 0); }, [tab]);
  const fields = [
    ['版本', item.edition.editionLabel],
    ['载体', item.edition.media.map(medium => mediumLabel(medium, carriers)).join(' / ')],
    ['条码', item.edition.barcode], ['品番', item.edition.catalogNumber],
    ['收藏时间', new Date(item.addedAt).toLocaleDateString('zh-CN')],
    ['购入日期', item.copy.acquiredAt], ['购入价格', formatPrice(item.copy.amountMinor, item.copy.currency)],
    ['购入位置', item.copy.seller], ['存放位置', item.copy.storageLocation], ['备注', item.copy.notes],
  ].filter(([, value]) => value);
  return <Modal title="收藏详情" onClose={onClose} busy={busy || modelBusy} beforeClose={prepareClose} inspection shared>
    <div className="inspection-layout">
      <div className="object-stage">
        <div className={`inspection-artwork-slot${item.modelAssetId ? ' has-model' : ''}`} data-side={side} ref={artworkSlot}/>
        <div className="object-floor"/>
        {!item.modelAssetId && <button className="rotate-button" onClick={() => setSide(!side)}><Icon name="rotate"/>{side ? '正面' : '侧面'}</button>}
      </div>
      <section className="object-info">
        <h1 title={item.edition.title}>{item.edition.title}</h1><p className="object-creator">{item.edition.creator}</p>
        <nav className="detail-tabs" aria-label="详情内容">
          <button className={tab === 'metadata' ? 'active' : ''} disabled={busy} onClick={() => setTab('metadata')}>资料</button>
          <button className={tab === 'purchase' ? 'active' : ''} disabled={busy} onClick={() => setTab('purchase')}>购入</button>
        </nav>
        <div ref={content} className="inspection-tab-content">
          {tab === 'metadata' ? <><dl className="metadata">{fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><button className="edit-edition-button" onClick={edit} disabled={modelBusy}>编辑版本</button></> :
            <form noValidate onSubmit={async event => {
              event.preventDefault(); if (busy) return;
              try {
                const value = { ...copy, amountMinor: parsePrice(amount, copy.currency) };
                const payload = JSON.stringify({ value, revision: item.revision });
                if (payload !== attempt.current.payload) attempt.current = { payload, requestId: crypto.randomUUID() };
                setBusy(true); setError('');
                await library.update({ requestId: attempt.current.requestId, id: item.id, expectedRevision: item.revision, copy: value });
                await onSaved(); setTab('metadata');
              } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
            }}>
              <fieldset disabled={busy}><PurchaseFields value={copy} amount={amount} setAmount={setAmount} onChange={setCopy}/></fieldset>
              <p className="form-error" role="alert">{error}</p><button className="solid-button" type="submit" disabled={busy}>{busy ? '保存中' : '保存'}</button>
            </form>}
        </div>
        <div className="object-actions"><button onClick={duplicate} disabled={busy || modelBusy}><Icon name="plus"/>再收一套</button><span>{statuses.find(status => status.id === item.copy.status)?.label}</span></div>
        <CollectionSource source={item.source}/>
      </section>
    </div>
  </Modal>;
}
