import { useState } from 'react';
import { discogs } from './gateway';
import { errorMessage } from '../library/gateway';

export function DiscogsSettings({ configured, onConfigured, onBusy, disabled = false }: {
  configured: boolean; onConfigured(value: boolean): void; onBusy?(value: boolean): void; disabled?: boolean;
}) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function openTokenPage() {
    setError('');
    try { await discogs.openTokenPage(); }
    catch (cause) { setError(errorMessage(cause)); }
  }
  return <form onSubmit={async event => {
    event.preventDefault(); if (busy || disabled) return;
    setBusy(true); onBusy?.(true); setError('');
    try { await discogs.saveToken(token); setToken(''); onConfigured(true); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); onBusy?.(false); }
  }}>
    <div className="setting-row discogs-token-row">
      <span>个人 Token</span>
      <button type="button" className="text-button" disabled={disabled} onClick={() => void openTokenPage()}>获取 Token ↗</button>
    </div>
    <input className="discogs-token-input" type="password" aria-label="个人 Token" placeholder="Discogs Personal Access Token" value={token} onChange={event => setToken(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy || disabled}/>
    <p className="form-note">在 Discogs 设置 → Developers 生成 Personal Access Token，保存在 Windows 凭据管理器。{configured ? '已有 Token，可替换。' : ''}</p>
    <p className="form-error" role="alert">{error}</p>
    <footer className="settings-actions">
      {configured && <button type="button" className="text-button" disabled={busy || disabled} onClick={async () => {
        setBusy(true); onBusy?.(true); setError('');
        try { await discogs.forgetToken(); onConfigured(false); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); onBusy?.(false); }
      }}>移除 Token</button>}
      <button className="solid-button" disabled={busy || disabled || !token}>{busy ? '保存中' : '保存 Token'}</button>
    </footer>
  </form>;
}
