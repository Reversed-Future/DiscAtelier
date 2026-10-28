import { useState } from 'react';
import { currencies } from '../library/types';
import { Select } from '../ui/Select';
import { Icon } from '../ui/Icon';
import { calculateExchange } from './calculator';
import type { ExchangeStatus } from './gateway';

export function ExchangeCalculator({ status }: { status: ExchangeStatus | null | undefined }) {
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState('JPY'), [target, setTo] = useState<string | null>(null);
  const to = target || status?.settings.target || 'CNY';
  const result = calculateExchange(amount, from, to, status?.rates || []);
  const valid = /^(\d{1,24})(?:\.(\d{1,6}))?$/.test(amount.trim());
  const stale = result?.quotes.some(quote => quote.fetchedDate !== status?.today);
  return <form className="exchange-calculator" aria-label="汇率计算器" onSubmit={event => event.preventDefault()}>
    <h4>汇率计算器</h4>
    <label>金额<input aria-label="换算金额" inputMode="decimal" value={amount} maxLength={31} onChange={event => setAmount(event.target.value)}/></label>
    <div className="exchange-currencies">
      <label>原币种<Select label="原币种" options={currencies} value={from} onChange={setFrom}/></label>
      <button type="button" className="text-button" aria-label="交换币种" onClick={() => { setFrom(to); setTo(from); }}><Icon name="swap"/></button>
      <label>换算为<Select label="换算币种" options={currencies} value={to} onChange={setTo}/></label>
    </div>
    <output className="exchange-result" aria-live="polite">{result ? `${result.amount} ${to}` : '—'}</output>
    <p className="setting-hint">{!amount.trim() ? '输入金额开始换算。' : !valid ? '请输入非负金额，最多保留六位小数。' : !result ? '暂无所需汇率，请先配置 API 并更新。' : from === to ? '相同币种，无需换算。' : stale ? '按旧缓存换算，仅供参考。' : '按今日已获取的汇率换算，仅供参考。'}</p>
  </form>;
}
