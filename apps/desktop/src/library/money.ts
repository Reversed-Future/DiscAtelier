export function parsePrice(value: string, currency: string): number | null {
  if (!value.trim()) return null;
  const digits = currency === 'JPY' ? 0 : 2;
  if (!(digits ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/).test(value.trim())) throw Error(digits ? '价格最多保留两位小数' : '日元价格请填写整数');
  const [whole, fraction = ''] = value.trim().split('.');
  const amount = BigInt(whole) * (digits ? 100n : 1n) + BigInt(fraction.padEnd(digits, '0') || '0');
  if (amount > 9_000_000_000_000n) throw Error('价格超出范围');
  return Number(amount);
}
export function priceInput(amount: number | null, currency: string): string {
  if (amount === null) return '';
  return currency === 'JPY' ? String(amount) : (amount / 100).toFixed(2);
}
export function formatPrice(amount: number | string | null, currency: string): string {
  if (amount === null) return '未填写';
  const minor = BigInt(amount);
  const scale = currency === 'JPY' ? 1n : 100n;
  const whole = new Intl.NumberFormat('zh-CN').format(minor / scale);
  const fraction = scale === 1n ? '' : `.${(minor % scale).toString().padStart(2, '0')}`;
  return `${currency} ${whole}${fraction}`;
}
