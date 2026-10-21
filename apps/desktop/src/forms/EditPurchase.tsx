import { leave } from '../ui/motion';
import { useRef, useState } from 'react';
import type { LibraryCopy } from '../library/types';
import { library, errorMessage } from '../library/gateway';
import { parsePrice, priceInput } from '../library/money';
import { Modal } from '../ui/Modal';
import { PurchaseFields } from './PurchaseFields';

export function EditPurchase({ item, onClose, onSaved }: { item: LibraryCopy; onClose(): void; onSaved(): Promise<void> }) {
  const [copy, setCopy] = useState(item.copy);
  const [amount, setAmount] = useState(priceInput(copy.amountMinor, copy.currency));
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef({ payload: '', requestId: crypto.randomUUID() });
  return <Modal title="编辑购入" onClose={onClose} busy={busy || reading} wide>
    <form className="editor-form" noValidate onSubmit={async event => {
      const dialog = event.currentTarget.closest('dialog');
      event.preventDefault(); if (busy || reading) return;
      try {
        const value = { ...copy, amountMinor: parsePrice(amount, copy.currency) };
        const payload = JSON.stringify({ value, revision: item.revision });
        if (payload !== attempt.current.payload) attempt.current = { payload, requestId: crypto.randomUUID() };
        setBusy(true); setError('');
        await library.update({ requestId: attempt.current.requestId, id: item.id, expectedRevision: item.revision, copy: value });
        await onSaved();
        dialog?.setAttribute('data-closing', 'true'); await leave(dialog); onClose();
      } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
    }}>
      <fieldset disabled={busy || reading}><PurchaseFields value={copy} amount={amount} setAmount={setAmount} onChange={setCopy} title={item.edition.title} creator={item.edition.creator} onBusy={setReading}/></fieldset>
      <p className="form-error" role="alert">{error}</p>
      <footer className="form-footer"><button className="solid-button" type="submit" disabled={busy || reading}>{busy ? '保存中' : '保存购入'}</button></footer>
    </form>
  </Modal>;
}
