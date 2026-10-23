import { useNeteaseAccount } from './useNeteaseAccount';
import { useState } from 'react';

function AccountAvatar({ url }: { url: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  return <span className="netease-account-avatar" aria-hidden="true">
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor"><circle cx="20" cy="15" r="6"/><path d="M9 34v-3a11 11 0 0 1 22 0v3"/></svg>
    {url && failed !== url && <img key={url} src={url} alt="" referrerPolicy="no-referrer" data-loaded={loaded === url} onLoad={() => setLoaded(url)} onError={() => setFailed(url)}/>}
  </span>;
}

export function NeteaseAccount({ enabled }: { enabled: boolean }) {
  const { account, checking, qr, error, busy, begin, cancel, logout } = useNeteaseAccount(enabled);
  const invalid = qr?.phase === 'expired' || qr?.phase === 'error';
  return <section className="netease-account settings-section" aria-label="网易云账号">
    <h4>账号</h4>
    <div className="setting-row"><div className="netease-account-identity"><AccountAvatar url={account?.state === 'loggedIn' ? account.avatarUrl : null}/><span>{checking && !account ? '检查中…' : account?.state === 'loggedIn' ? account.nickname : account?.state === 'expired' ? '登录已失效' : '未登录'}</span></div>
      {account?.state === 'expired' && <button type="button" className="text-button" disabled={busy || checking} onClick={() => void logout()}>退出</button>}
      {account?.state === 'loggedIn' ? <button type="button" className="text-button" disabled={busy || checking} onClick={() => void logout()}>{busy ? '退出中' : '退出'}</button>
        : <button type="button" className="text-button" disabled={!enabled || busy || checking} onClick={() => qr ? cancel() : void begin()}>{checking ? '检查中' : qr ? '取消' : '登录'}</button>}
    </div>
    {!enabled && <p className="setting-hint">保存服务设置后可登录。</p>}
    <div className="settings-disclosure" data-open={!!qr} inert={!qr}><div>
      <div className="netease-qr" aria-busy={qr?.phase === 'loading'}>
        <div className="netease-qr-image" data-expired={invalid}>
          {qr?.image && <img src={qr.image} width="188" height="188" alt="网易云登录二维码"/>}
          {qr?.phase === 'loading' && <span>读取中</span>}
        </div>
        <div className="netease-qr-status" aria-live="polite">{invalid
          ? <button type="button" className="text-button" onClick={() => void begin()}>重新生成</button>
          : qr?.phase === 'confirming' ? '请在手机上确认' : qr?.phase === 'waiting' ? '使用网易云音乐扫码' : ''}</div>
      </div>
    </div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
