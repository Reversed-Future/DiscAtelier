import { formatPrice, parsePrice } from '../library/money';
import type { LibrarySnapshot } from '../library/types';
import { useExchange } from './ExchangeContext';
import { convertAmounts } from './conversion';
import { purchaseTotal, yenAmount } from './purchaseAmounts';
import { usePurchaseRates } from './usePurchaseRates';

function YenPrice({ amount, date, target }: { amount: number | string; date: string; target: string }) {
  const entry = usePurchaseRates(BigInt(amount) > 0n ? date : '').get(date);
  const result = yenAmount(amount, target, entry?.rate);
  const rate = entry?.rate;
  const dateLabel = rate ? (date === rate.quoteDate ? '购入日汇率' : `采用 ${rate.quoteDate} 汇率`) : '';
  return <small className="converted-price" title={rate ? `欧洲央行 · ${rate.quoteDate} · 1 JPY = ${target === 'CNY' ? rate.cnyPerJpy : rate.hkdPerJpy} ${target}` : entry?.error}>
    {result !== null ? `≈ ${formatPrice(String(result), target)}${dateLabel ? ' · ' + dateLabel : ''}`
      : !date ? '填写购入日期后可换算' : entry?.error ? '购入日汇率待补' : '正在读取购入日汇率…'}
  </small>;
}

export function ConvertedPrice({ amount, currency, acquiredAt }: { amount: number | string | null; currency: string; acquiredAt: string }) {
  const status = useExchange()?.status;
  if (amount === null || !status || currency === status.settings.target) return null;
  if (currency === 'JPY') return <YenPrice amount={amount} date={acquiredAt} target={status.settings.target}/>;
  if (!status.settings.enabled) return null;
  const result = convertAmounts({[currency]: String(amount)}, status);
  return <small className="converted-price" title={result ? `接口盒子 · 汇率日期 ${result.dates.join('、')} · 参考换算` : '请在设置 → 汇率中查看更新状态'}>
    {result ? `≈ ${formatPrice(result.amount, status.settings.target)}${result.stale ? ' · 旧缓存' : ''}` : '暂无换算汇率'}
  </small>;
}
export function ConvertedInput({ amount, currency, acquiredAt }: { amount: string; currency: string; acquiredAt: string }) {
  try { return <ConvertedPrice amount={parsePrice(amount,currency)} currency={currency} acquiredAt={acquiredAt}/>; } catch { return null; }
}
export function ConvertedTotal({ snapshot }: { snapshot: LibrarySnapshot | null }) {
  const status = useExchange()?.status;
  const copies = snapshot?.copies || [];
  const dates = copies.flatMap(({ copy }) =>
    copy.currency === 'JPY' && copy.amountMinor && copy.acquiredAt ? [copy.acquiredAt] : []);
  const rates = usePurchaseRates([...new Set(dates)].sort().join('|'));
  if (!status || !snapshot || !Object.keys(snapshot.amounts).length) return null;
  const { amounts } = snapshot;
  if (!status.settings.enabled && !amounts.JPY) return null;
  const result = purchaseTotal(amounts, copies, status.settings.enabled ? status : { ...status, rates: [] }, rates);
  return <small className="converted-total" title={amounts.JPY ? '日元按每笔购入日期折算后合计' : undefined}>
    {result ? `参考合计 ≈ ${formatPrice(result.amount,status.settings.target)}${result.stale ? ' · 旧缓存' : ''}` : '汇率未齐，暂不折算合计'}
  </small>;
}
