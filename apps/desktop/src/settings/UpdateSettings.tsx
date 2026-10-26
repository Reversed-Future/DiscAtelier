import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { errorMessage } from '../library/gateway';
import { updates, type DownloadProgress, type UpdateStatus } from './gateway';

export function UpdateSettings({ onBusy }: { onBusy(value: boolean): void }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'saving' | 'downloading' | 'installing'>('idle');
  const [progress, setProgress] = useState<DownloadProgress>({ received: 0, total: null });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const busy = phase !== 'idle';
  useEffect(() => {
    let active = true;
    void updates.status().then(value => { if (active) setStatus(value); })
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
    <div className="about-copy">
      <p>私人实体影音收藏与播放工具。</p>
      <dl className="about-facts">
        <div><dt>作者 / 维护</dt><dd>Reversed-Future</dd></div>
        <div><dt>项目</dt><dd>github.com/Reversed-Future/DiscAtelier</dd></div>
        <div><dt>技术</dt><dd>Tauri 2 · Rust · React 19</dd></div>
        <div><dt>许可</dt><dd>GPL-3.0-or-later；第三方组件许可见安装目录 <code>legal/</code> 与 <code>vlc/</code>、<code>jre/</code></dd></div>
      </dl>
      <div className="about-actions"><button type="button" className="text-button" disabled={busy}
        onClick={() => { setError(''); void invoke('about_open_project').catch(cause => setError(errorMessage(cause))); }}>打开项目主页</button></div>
    </div>
    <h4 className="settings-subheading">软件更新</h4>
    <p className="setting-hint">启动时自动检查更新，可忽略指定版本；这里仍可手动更新。</p>
    <p className="setting-hint">仓库已公开，检查与下载更新不再需要 GitHub 访问令牌。</p>
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
        <p className="setting-hint">安装前自动停止播放并备份收藏，随后重启。</p>
        <button className="solid-button" disabled={busy} onClick={() => void run('installing', updates.install)}>安装并重启</button>
      </> : available ? <button className="solid-button" disabled={busy} onClick={() => void run('downloading', async () => {
        setProgress({ received: 0, total: null }); setStatus(await updates.download(setProgress));
      })}>{phase === 'downloading' ? '下载中' : '下载更新'}</button>
        : <button className="solid-button" disabled={busy || !status} onClick={() => void run('checking', async () => {
          const value = await updates.check(); setStatus(value); if (!value.available) setMessage('已是最新版本');
        })}>{phase === 'checking' ? '检查中' : '检查更新'}</button>}
    </footer>
  </div>;
}
