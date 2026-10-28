import { useEffect, useState } from 'react';
import { useExchange } from './ExchangeContext';
import { currencies } from '../library/types';
import { Select } from '../ui/Select';
import type { ExchangeSettings as Settings } from './gateway';
import { exchange as gateway } from './gateway';
import { errorMessage } from '../library/gateway';
import { ExchangeCalculator } from './ExchangeCalculator';

export function ExchangeSettings({ onBusy }: { onBusy(value: boolean): void }) {
  const exchange = useExchange();
  const [tab, setTab] = useState<'today' | 'api'>('today');
  const [settings, setSettings] = useState<Settings | null>(exchange?.status?.settings || null);
  const [key, setKey] = useState(''), [saved, setSaved] = useState(false);
  const [linkError, setLinkError] = useState('');
  const busy = !!exchange?.busy, status = exchange?.status;
  useEffect(() => { if (!settings && status) setSettings(status.settings); }, [status, settings]);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  function change(next: Partial<Settings>) { setSettings(value => value ? {...value,...next} : value); setSaved(false); }
  async function save(forget = false) {
    if (!settings || !exchange) return;
    try { await exchange.save(settings,key || null,forget); setKey(''); setSaved(true); if (forget) change({enabled:false}); }
    catch { /* The shared status displays the concrete backend error. */ }
  }
  const changed = !settings || !status || key !== '' || JSON.stringify(settings) !== JSON.stringify(status.settings);
  const hasKey = status?.hasKey && settings?.developerId === status.settings.developerId;
  return <div>
    <div className="music-settings-tabs" role="tablist" aria-label="汇率页面">
      <button type="button" role="tab" id="exchange-today-tab" aria-selected={tab === 'today'} aria-controls="exchange-today" onClick={() => setTab('today')}>今日汇率与计算器</button>
      <button type="button" role="tab" id="exchange-api-tab" aria-selected={tab === 'api'} aria-controls="exchange-api" onClick={() => setTab('api')}>API 设置</button>
    </div>
    <div id="exchange-api" role="tabpanel" aria-labelledby="exchange-api-tab" hidden={tab !== 'api'}>
    <form onSubmit={e => { e.preventDefault(); void save(); }}>
    <label>参考换算<Select label="参考换算" value={settings?.enabled ? 'on' : 'off'} disabled={!settings || busy} options={[{id:'off',label:'关闭'},{id:'on',label:'每天更新'}]} onChange={value => change({enabled:value === 'on'})}/></label>
    <div className="form-row"><label>显示币种<Select label="汇率显示币种" value={settings?.target || 'CNY'} options={currencies} disabled={!settings || busy} onChange={target => change({target})}/></label>
      <label>开发者 ID<input value={settings?.developerId || ''} inputMode="numeric" maxLength={32} spellCheck={false} autoComplete="off" disabled={!settings || busy} onChange={e => change({developerId:e.target.value})}/></label></div>
    <label>开发者 KEY<input type="password" value={key} maxLength={1024} autoComplete="off" spellCheck={false} placeholder={hasKey ? '已保存；留空保留' : '填写接口盒子 KEY'} disabled={!settings || busy} onChange={e => { setKey(e.target.value); setSaved(false); }}/></label>
    <p className="setting-hint">原始购入金额保留，换算仅供参考。每天首次使用时更新，软件持续打开时也会跨日更新；断网沿用缓存。KEY 保存在 Windows 凭据管理器。</p>
    <div className="settings-actions">
      {hasKey && <button type="button" className="text-button" disabled={busy || changed} onClick={() => void save(true)}>移除 KEY</button>}
      <button className="solid-button" disabled={!settings || busy}>{busy ? '处理中' : saved ? '已保存' : '保存'}</button>
    </div>
    </form></div>
    <div id="exchange-today" role="tabpanel" aria-labelledby="exchange-today-tab" hidden={tab !== 'today'}>
    <div className="exchange-dashboard">
    <section className="exchange-rates" aria-busy={busy}>
      <div className="setting-row"><span>今日汇率</span><button type="button" className="text-button" disabled={busy || !status?.settings.enabled || !status.hasKey} onClick={() => void exchange?.refresh(true)}>{busy ? '更新中' : '立即更新'}</button></div>
      {status?.rates.map(rate => <div className="exchange-rate-row" key={rate.from}><span>1 {rate.from}</span><strong>{rate.rate} {rate.to}</strong><small>{rate.updatedAt}{rate.fetchedDate !== status.today ? ' · 旧缓存' : ''}</small></div>)}
      {!status?.rates.length && <p className="setting-hint">在 API 设置中配置服务并开启每天更新，即可获取汇率。</p>}
      <p className="setting-hint">来源：<a className="exchange-source" href="https://www.apihz.cn/api/jinronghuilv.html" onClick={e => { e.preventDefault(); void gateway.openDocs().catch(cause => setLinkError(errorMessage(cause))); }}>接口盒子</a> · 汇率每天更新一次</p>
    </section>
    <ExchangeCalculator status={status}/>
    </div></div>
    {(exchange?.error || status?.error || linkError) && <p className="form-error" role="alert">{exchange?.error || status?.error || linkError}</p>}
  </div>;
}
