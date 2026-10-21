import { formatPrice, parsePrice } from '../library/money';
import { useExchange } from './ExchangeContext';
import { convertAmounts } from './conversion';

export function ConvertedPrice({ amount, currency }: { amount: number | string | null; currency: string }) {
  const exchange = useExchange(), status = exchange?.status;
  if (amount === null || !status?.settings.enabled || currency === status.settings.target) return null;
  const result = convertAmounts({[currency]: String(amount)}, status);
  return <small className="converted-price" title={result ? `接口盒子 · 汇率日期 ${result.dates.join('、')} · 参考换算` : '请在设置 → 汇率中查看更新状态'}>
    {result ? `≈ ${formatPrice(result.amount, status.settings.target)}${result.stale ? ' · 旧缓存' : ''}` : '暂无换算汇率'}
  </small>;
}
export function ConvertedInput({ amount, currency }: { amount: string; currency: string }) {
  try { return <ConvertedPrice amount={parsePrice(amount,currency)} currency={currency}/>; } catch { return null; }
}
export function ConvertedTotal({ amounts }: { amounts: Record<string, string> }) {
  const exchange = useExchange(), status = exchange?.status;
  if (!status?.settings.enabled || !Object.keys(amounts).length) return null;
  const result = convertAmounts(amounts,status);
  return <small className="converted-total" title={result?.dates.length ? `汇率日期 ${result.dates.join('、')}，仅供参考` : undefined}>
    {result ? `参考合计 ≈ ${formatPrice(result.amount,status.settings.target)}${result.stale ? ' · 旧缓存' : ''}` : '汇率未齐，暂不折算合计'}
  </small>;
}
