import type { CopyDraft } from '../../library/types';

export type FieldKey = 'price' | 'acquiredAt' | 'seller' | 'purchaseUrl' | 'status';
export interface RecognizedField { key: FieldKey; value: string; currency: string | null; evidence: string }
export interface PurchaseRecord { title: string; sourceImages: number[]; fields: RecognizedField[]; warning: string }
export interface Recognition { records: PurchaseRecord[]; message: string }
export const fieldLabels: Record<FieldKey, string> = {
  price: '购入价格', acquiredAt: '购入日期', seller: '购入位置', purchaseUrl: '购买链接', status: '状态',
};
export function fieldText(field: RecognizedField): string {
  if (field.key === 'price') return `${field.currency} ${field.value}`;
  if (field.key === 'status') return field.value === 'owned' ? '已购入' : '在途';
  return field.value;
}
export function currentText(key: FieldKey, copy: CopyDraft, amount: string): string {
  if (key === 'price') return amount ? `${copy.currency} ${amount}` : '未填写';
  if (key === 'status') return ({ owned: '已购入', transit: '在途', wanted: '想购入' })[copy.status] || copy.status;
  return copy[key] || '未填写';
}
// Apply to a draft only. Unknown/absent fields cannot erase existing data.
export function applyFields(copy: CopyDraft, amount: string, fields: RecognizedField[], selected: FieldKey[]) {
  const next = { ...copy };
  let nextAmount = amount;
  for (const field of fields) {
    if (!selected.includes(field.key)) continue;
    switch (field.key) {
      case 'price':
        if (field.currency) { next.currency = field.currency; nextAmount = field.value; }
        break;
      case 'acquiredAt': next.acquiredAt = field.value; break;
      case 'seller': next.seller = field.value; break;
      case 'purchaseUrl': next.purchaseUrl = field.value; break;
      case 'status': next.status = field.value; break;
    }
  }
  return { copy: next, amount: nextAmount };
}
