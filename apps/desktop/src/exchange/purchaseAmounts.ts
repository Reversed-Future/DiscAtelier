import type { CopyDraft } from '../library/types';
import type { ExchangeStatus, YenPurchaseRate } from './gateway';
import { convertAmounts, rateRatio } from './conversion.ts';

export function yenAmount(amount: number | string, target: string, rate?: YenPurchaseRate): bigint | null {
  const yen = BigInt(amount);
  if (!yen || target === 'JPY') return yen;
  const ratio = rate && rateRatio(target === 'CNY' ? rate.cnyPerJpy : target === 'HKD' ? rate.hkdPerJpy : '');
  if (!ratio) return null;
  const [n, d] = ratio;
  return (yen * n * 100n * 2n + d) / (2n * d);
}

export function purchaseTotal(amounts: Record<string, string>, copies: { copy: CopyDraft }[], status: ExchangeStatus,
  rates: ReadonlyMap<string, { rate?: YenPurchaseRate }>) {
  const { JPY: _yen, ...others } = amounts;
  const other = convertAmounts(others, status);
  if (!other) return null;
  let sum = BigInt(other.amount);
  for (const { copy } of copies) {
    if (copy.status !== 'owned' || copy.currency !== 'JPY' || copy.amountMinor === null) continue;
    const amount = yenAmount(copy.amountMinor, status.settings.target, rates.get(copy.acquiredAt)?.rate);
    if (amount === null) return null;
    sum += amount;
  }
  return { amount: sum.toString(), stale: other.stale };
}
