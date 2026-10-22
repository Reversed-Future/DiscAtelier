import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { errorMessage } from '../library/gateway';
import { Select } from '../ui/Select';
const tmdbLogo = new URL('../assets/tmdb.svg', import.meta.url).href;
interface Status {
  tmdbConfigured: boolean; bangumiConfigured: boolean;
  bangumiExpiresAt: string | null; bangumiExpired: boolean; bangumiDaysRemaining: number | null;
}
const EXPIRY_OPTIONS = [7, 14, 30, 90, 180, 365].map(days => ({ id: String(days), label: `${days} 天` }));
function dateLabel(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}
export function VideoSettings({ onBusy }: { onBusy(value: boolean): void }) {
  const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [tmdb, setTmdb] = useState(''), [bangumi, setBangumi] = useState(''), [expiryDays, setExpiryDays] = useState('30');
  useEffect(() => { let live = true; void invoke<Status>('video_settings_get').then(v => { if (live) setStatus(v); }).catch(e => { if (live) setError(errorMessage(e)); }); return () => { live = false; }; }, []);
  async function save(provider: 'tmdb' | 'bangumi', forget = false) {
    const value = provider === 'tmdb' ? tmdb : bangumi;
    if (busy || (!forget && provider === 'tmdb' && !value) || (!forget && provider === 'bangumi' && !value && !status?.bangumiConfigured)) return;
    setBusy(true); onBusy(true); setError(''); setNotice('');
    try {
      const next = await invoke<Status>('video_settings_save', {
        provider, value: value || null, forget,
        expiresInDays: provider === 'bangumi' && !forget ? Number(expiryDays) : null,
      });
      setStatus(next);
      if (provider === 'tmdb') setTmdb(''); else setBangumi('');
      setNotice(forget ? '令牌已移除' : provider === 'bangumi' ? '令牌与到期时间已保存' : '令牌已安全保存');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); onBusy(false); }
  }
  return <div className="video-settings">
    <section><h4>TMDB</h4><p className="form-note">用于电影和剧集作品资料。填写 API Read Access Token，凭据保存在 Windows 凭据管理器。</p>
      <form onSubmit={e => { e.preventDefault(); void save('tmdb'); }}>
        <label>读取令牌<input type="password" autoComplete="off" value={tmdb} placeholder={status?.tmdbConfigured ? '已配置，留空保持' : 'API Read Access Token'} onChange={e => setTmdb(e.target.value)} disabled={busy}/></label>
        <footer className="settings-actions">
          <button type="button" className="text-button" onClick={() => void invoke('video_open_source', { url: 'https://www.themoviedb.org/settings/api' }).catch(e => setError(errorMessage(e)))}>获取令牌 ↗</button>
          {status?.tmdbConfigured && <button type="button" className="text-button" disabled={busy} onClick={() => void save('tmdb', true)}>移除</button>}
          <button type="submit" className="solid-button" disabled={busy || !tmdb}>保存</button>
        </footer>
      </form>
    </section>
    <section><h4>Bangumi</h4><p className="form-note">公开作品可直接查询；需要账号权限的条目可填写个人访问令牌。令牌到期时间按保存时选择的天数计算。</p>
      <form onSubmit={e => { e.preventDefault(); void save('bangumi'); }}>
        <label>个人访问令牌 · 可选<input type="password" autoComplete="off" value={bangumi} placeholder={status?.bangumiConfigured ? '已配置，留空保持并更新到期时间' : '公开查询无需填写'} onChange={e => setBangumi(e.target.value)} disabled={busy}/></label>
        <div className="setting-row bangumi-expiry">
          <span>令牌过期时间</span>
          <Select label="Bangumi 令牌过期时间" value={expiryDays} options={EXPIRY_OPTIONS} disabled={busy} onChange={setExpiryDays}/>
        </div>
        {status?.bangumiConfigured && <p className={`form-note token-expiry${status.bangumiExpired ? ' expired' : ''}`} role={status.bangumiExpired ? 'alert' : 'status'}>
          {status.bangumiExpiresAt
            ? `到期时间：${dateLabel(status.bangumiExpiresAt)}${status.bangumiExpired ? '（已过期，请更换令牌）' : status.bangumiDaysRemaining !== null ? `（剩余 ${status.bangumiDaysRemaining} 天）` : ''}`
            : '尚未记录到期时间，请保存一次以设置提醒。'}
        </p>}
        <footer className="settings-actions">
          <button type="button" className="text-button" onClick={() => void invoke('video_open_bangumi_token').catch(e => setError(errorMessage(e)))}>获取 Token ↗</button>
          {status?.bangumiConfigured && <button type="button" className="text-button" disabled={busy} onClick={() => void save('bangumi', true)}>移除</button>}
          <button type="submit" className="solid-button" disabled={busy || (!bangumi && !status?.bangumiConfigured)}>保存</button>
        </footer>
      </form>
    </section>
    <p role="status" className="form-note">{notice}</p>{error && <p className="form-error" role="alert">{error}</p>}
    <section className="video-attribution"><h4>资料来源</h4><img src={tmdbLogo} alt="TMDB" width="110"/><p>作品资料来自 TMDB 或 Bangumi，实体信息由你核对保存。</p><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p></section>
  </div>;
}
