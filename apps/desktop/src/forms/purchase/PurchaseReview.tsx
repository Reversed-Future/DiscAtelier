import { useState } from 'react';
import type { CopyDraft } from '../../library/types';
import { applyFields, currentText, fieldLabels, fieldText, type FieldKey, type PurchaseRecord } from './recognition';

export function PurchaseReview({ record, value, amount, onApply }: {
  record: PurchaseRecord; value: CopyDraft; amount: string;
  onApply(copy: CopyDraft, amount: string): void;
}) {
  const [selected, setSelected] = useState<FieldKey[]>(record.fields.map(field => field.key));
  return <div className="purchase-review">
    <p className="purchase-evidence">来自截图 {record.sourceImages.join('、')}</p>
    {record.warning && <p className="purchase-notice">{record.warning}</p>}
    {!record.fields.length && <p className="purchase-notice">这条记录没有足够明确的字段，请补充截图或手动填写。</p>}
    {record.fields.map(field => <label className="purchase-review-row" key={field.key}>
      <input type="checkbox" checked={selected.includes(field.key)} onChange={event => {
        const checked = event.currentTarget.checked;
        setSelected(current => checked ? [...current, field.key] : current.filter(key => key !== field.key));
      }}/>
      <span><span className="purchase-field-heading">{fieldLabels[field.key]}</span>
        <span className="purchase-before">{currentText(field.key, value, amount)} →</span>
        <strong>{fieldText(field)}</strong><small>依据：{field.evidence}</small></span>
    </label>)}
    <div className="purchase-recognition-actions"><span aria-live="polite">已选 {selected.length} / {record.fields.length} 项 · 仅填写表单，保存后才写入收藏</span>
      <button type="button" className="solid-button" disabled={!selected.length} onClick={() => {
        const next = applyFields(value, amount, record.fields, selected); onApply(next.copy, next.amount);
      }}>填入所选字段</button></div>
  </div>;
}
