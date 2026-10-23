import type { ReactNode } from 'react';
import type { CopyDraft } from '../library/types';
import { currencies, statuses } from '../library/types';
import { Select } from '../ui/Select';
import { DatePicker } from '../ui/DatePicker';
import { ConvertedInput } from '../exchange/ConvertedPrice';
import { PurchaseScreenshots } from './purchase/PurchaseScreenshots';

export function PurchaseFields({ value, amount, setAmount, onChange, title, creator, onBusy, afterDate }: {
  value: CopyDraft; amount: string; setAmount(value: string): void; onChange(value: CopyDraft): void;
  title: string; creator: string; onBusy(value: boolean): void; afterDate?: ReactNode;
}) {
  const update = (key: keyof CopyDraft, text: string) => onChange({ ...value, [key]: text });
  return <>
    <PurchaseScreenshots title={title} creator={creator} value={value} amount={amount} setAmount={setAmount} onChange={onChange} onBusy={onBusy}/>
    <div className="form-row"><label>价格<input aria-label="价格" inputMode="decimal" value={amount} placeholder="未填写" onChange={event => setAmount(event.target.value)}/></label>
      <label>币种<Select label="币种" value={value.currency} options={currencies} onChange={text => update('currency', text)}/></label></div>
    <ConvertedInput amount={amount} currency={value.currency}/>
    <div className="form-row"><label>状态<Select label="状态" value={value.status} options={statuses} onChange={text => update('status', text)}/></label>
      <div className="date-field"><span>购入日期</span><DatePicker label="购入日期" value={value.acquiredAt} onChange={text => update('acquiredAt', text)}/></div></div>
    {afterDate}
    <label>购入位置<input aria-label="购入位置" value={value.seller} maxLength={200} onChange={event => update('seller', event.target.value)}/></label>
    <label>购买链接<input aria-label="购买链接" value={value.purchaseUrl} maxLength={2048} placeholder="https://" onChange={event => update('purchaseUrl', event.target.value)}/></label>
    <label>存放位置<input aria-label="存放位置" value={value.storageLocation} maxLength={200} onChange={event => update('storageLocation', event.target.value)}/></label>
    <label>备注<textarea aria-label="备注" rows={2} value={value.notes} maxLength={4000} onChange={event => update('notes', event.target.value)}/></label>
  </>;
}
