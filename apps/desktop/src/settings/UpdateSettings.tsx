import { useEffect, useState } from 'react';
import { errorMessage } from '../library/gateway';
import { updates, type DownloadProgress, type UpdateStatus } from './gateway';

export function UpdateSettings({ onBusy, playing }: { onBusy(value: boolean): void; playing: boolean }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [token, setToken] = useState('');
  const [phase, setPhase] = useState<'idle' | 'checking' | 'saving' | 'downloading' | 'installing'>('idle');
  const [progress, setProgress] = useState<DownloadProgress>({ received: 0, total: null });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const busy = phase !== 'idle';
  useEffect(() => {
    let active = true;
    void updates.status().then(value => { if (active) { setStatus(value); setCredentialsOpen(!value.configured); } })
      .catch(cause => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, []);
  async function run(next: typeof phase, action: () => Promise<void>) {
    if (busy) return;
    setPhase(next); onBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (cause) { setError(errorMessage(cause)); setStatus(await updates.status().catch(() => null)); }
    finally { setPhase('idle'); onBusy(false); }
  }
  const available = status?.available;
  const percent = progress.total ? Math.min(100, Math.floor(progress.received / progress.total * 100)) : 0;
  return <div className="update-settings">
    <div className="update-version"><span className="disc-mark"/><div>DiscAtelier<span>{status?.currentVersion || '—'}</span></div></div>
    <div className="setting-row update-source"><span>GitHub 私有仓库</span><button className="text-button" disabled={busy || !status} aria-expanded={credentialsOpen} onClick={() => setCredentialsOpen(value => !value)}>{credentialsOpen ? '收起' : status?.configured ? '已配置 · 更换' : '配置'}</button></div>
    <div className="settings-disclosure" data-open={credentialsOpen} inert={!credentialsOpen}>
      <div><form onSubmit={event => { event.preventDefault(); void run('saving', async () => {
        await updates.saveToken(token); setToken(''); setStatus(await updates.status()); setCredentialsOpen(false); setMessage('已保存');
      }); }}>
        <label>GitHub Token<input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" spellCheck={false} disabled={busy}/></label>
        <p className="setting-hint">仅授予 DiscAtelier 仓库的 Contents 读取权限。保存在 Windows 凭据管理器。</p>
        <footer className="settings-actions">
          {status?.configured && <button type="button" className="text-button" disabled={busy} onClick={() => void run('saving', async () => {
            await updates.forgetToken(); setToken(''); setStatus(await updates.status());
          })}>移除</button>}
          <button className="solid-button" disabled={busy || !token}>保存</button>
        </footer>
      </form></div>
    </div>
    {available && <div className="update-release">
      <div className="setting-row"><span>新版本 {available.version}</span><span className="setting-hint">{available.ready ? '签名已验证' : ''}</span></div>
      <div className="update-notes" tabIndex={0}>{available.notes}</div>
    </div>}
    <div className="settings-feedback" aria-live="polite">
      {phase === 'downloading' && <div className="update-download"><span>下载中 {percent}%</span><div className="update-progress" role="progressbar" aria-label="下载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ transform: `scaleX(${percent / 100})` }}/></div></div>}
      {phase === 'installing' && <p>备份并安装中…</p>}
      {message && <p>{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <footer className="update-footer">
      {available?.ready ? <>
        <p className="setting-hint">{playing ? '请先停止播放。' : '安装前自动备份收藏，随后重启。'}</p>
        <button className="solid-button" disabled={busy || playing} onClick={() => void run('installing', updates.install)}>安装并重启</button>
      </> : available ? <button className="solid-button" disabled={busy} onClick={() => void run('downloading', async () => {
        setProgress({ received: 0, total: null }); setStatus(await updates.download(setProgress));
      })}>{phase === 'downloading' ? '下载中' : '下载更新'}</button>
        : <button className="solid-button" disabled={busy || !status?.configured} onClick={() => void run('checking', async () => {
          const value = await updates.check(); setStatus(value); if (!value.available) setMessage('已是最新版本');
        })}>{phase === 'checking' ? '检查中' : '检查更新'}</button>}
    </footer>
  </div>;
}
