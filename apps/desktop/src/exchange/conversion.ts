import type { ExchangeStatus } from './gateway';

const scales: Record<string, bigint> = { CNY: 100n, HKD: 100n, JPY: 1n };
/** Decimal rates stay decimal through multiplication; round only the final result. */
export function rateRatio(rate: string): [bigint, bigint] | null {
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(rate);
  if (!match || rate.length > 40) return null;
  const fraction = match[2] || '', exponent = Number(match[3] || 0) - fraction.length;
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 40) return null;
  const digits = BigInt(match[1] + fraction);
  if (digits <= 0n) return null;
  return exponent >= 0 ? [digits * 10n ** BigInt(exponent), 1n] : [digits, 10n ** BigInt(-exponent)];
}
interface Conversion { amount: string; stale: boolean; dates: string[] }
export function convertAmounts(amounts: Record<string, string>, status: ExchangeStatus): Conversion | null {
  const target = status.settings.target, targetScale = scales[target];
  if (!targetScale) return null;
  let numerator = 0n, denominator = 1n, stale = false;
  const dates = new Set<string>();
  for (const [currency, amount] of Object.entries(amounts)) {
    if (!/^\d+$/.test(amount) || amount.length > 40 || !scales[currency]) return null;
    const minor = BigInt(amount);
    if (!minor) continue;
    let top = minor, bottom = 1n;
    if (currency !== target) {
      const quote = status.rates.find(r => r.from === currency && r.to === target);
      const ratio = quote && rateRatio(quote.rate);
      if (!quote || !ratio) return null;
      top = minor * ratio[0] * targetScale;
      bottom = ratio[1] * scales[currency];
      dates.add(quote.updatedAt.slice(0, 10));
      stale ||= quote.fetchedDate !== status.today;
    }
    numerator = numerator * bottom + top * denominator;
    denominator *= bottom;
  }
  const amount = (numerator * 2n + denominator) / (denominator * 2n);
  return { amount: amount.toString(), stale, dates: [...dates].sort() };
}
