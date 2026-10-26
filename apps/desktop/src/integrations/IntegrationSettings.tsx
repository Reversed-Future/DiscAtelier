import { useEffect, useState } from 'react';
import { integrations, type IntegrationStatus } from './gateway';
import { errorMessage } from '../library/gateway';
import { Select } from '../ui/Select';
import { NeteaseAccount } from './NeteaseAccount';

let cachedStatus: IntegrationStatus | null = null;
function sameStatus(left: IntegrationStatus | null, right: IntegrationStatus) {
  return !!left
    && left.hasKey === right.hasKey
    && left.settings.neteaseMode === right.settings.neteaseMode
    && left.settings.neteaseBaseUrl === right.settings.neteaseBaseUrl
    && left.settings.aiBaseUrl === right.settings.aiBaseUrl
    && left.settings.aiModel === right.settings.aiModel
    && left.settings.musicbrainzBaseUrl === right.settings.musicbrainzBaseUrl;
}

export function IntegrationSettings({ kind, onBusy }: { kind: 'netease' | 'assistant' | 'musicbrainz'; onBusy(value: boolean): void }) {
  const [status, setStatus] = useState<IntegrationStatus | null>(cachedStatus);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [savedMode, setSavedMode] = useState(cachedStatus?.settings.neteaseMode || '');
  useEffect(() => {
    let live = true;
    void integrations.settings().then(value => {
      if (!live) return;
      const changed = !sameStatus(cachedStatus, value);
      cachedStatus = value;
      if (changed) { setStatus(value); setSavedMode(value.settings.neteaseMode); }
    }).catch(e => { if (live) setError(errorMessage(e)); });
    return () => { live = false; };
  }, []);
  function change(name: keyof IntegrationStatus['settings'], value: string) {
    setSaved(false); setStatus(s => s ? { ...s, hasKey: name === 'aiBaseUrl' ? false : s.hasKey, settings: { ...s.settings, [name]: value } } : s);
  }
  async function save(forget = false) {
    if (!status || busy) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const value = await integrations.save(status.settings, forget ? null : key || null, forget);
      cachedStatus = value;
      setStatus(value); setSavedMode(value.settings.neteaseMode); setKey(''); setSaved(true);
    }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); onBusy(false); }
  }
  return <><form onSubmit={e => { e.preventDefault(); void save(); }}>
    {kind === 'musicbrainz' ? <>
      <label>API 地址<input value={status?.settings.musicbrainzBaseUrl || ''} disabled={!status || busy} spellCheck={false} placeholder="https://musicbrainz.org/ws/2" onChange={e => change('musicbrainzBaseUrl', e.target.value)}/></label>
      <p className="setting-hint">用 CD 的 MusicBrainz Disc ID 查询发行信息，识别音频 CD 并匹配收藏库。留空使用公共 API；无需 API Key，请遵守 MusicBrainz 的查询频率限制。</p>
    </> : kind === 'netease' ? <>
      <label>服务<Select label="网易云服务" value={status?.settings.neteaseMode || 'builtin'} options={[{ id: 'builtin', label: '内置' }, { id: 'custom', label: '自定义' }]} disabled={!status || busy} onChange={value => change('neteaseMode', value)}/></label>
      <div className="netease-service-detail" key={status?.settings.neteaseMode}>
        {status?.settings.neteaseMode === 'custom'
          ? <label>服务地址<input value={status.settings.neteaseBaseUrl} disabled={busy} spellCheck={false} placeholder="http://127.0.0.1:3000" onChange={e => change('neteaseBaseUrl', e.target.value)}/></label>
          : <p className="setting-hint">随应用静默启动，退出时关闭。</p>}
      </div>
    </> : <>
      <label>Base URL<input value={status?.settings.aiBaseUrl || ''} disabled={!status || busy} spellCheck={false} placeholder="https://服务地址/v1" onChange={e => change('aiBaseUrl', e.target.value)}/></label>
      <label>模型<input value={status?.settings.aiModel || ''} disabled={!status || busy} spellCheck={false} onChange={e => change('aiModel', e.target.value)}/></label>
      <label>API Key<input type="password" value={key} autoComplete="off" disabled={!status || busy} placeholder={status?.hasKey ? '已保存；留空保留' : '本地免密接口可留空'} onChange={e => setKey(e.target.value)}/></label>
      <p className="setting-hint">兼容 Chat Completions 与工具调用。提问及查询所需资料发送至此服务，密钥保存在 Windows 凭据管理器。</p>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer className="settings-actions">
      {kind === 'assistant' && status?.hasKey && <button type="button" className="text-button" disabled={busy} onClick={() => void save(true)}>移除密钥</button>}
      <button className="solid-button" disabled={!status || busy}>{saved ? '已保存' : busy ? '保存中' : '保存'}</button>
    </footer>
  </form>{kind === 'netease' && status?.settings.neteaseMode === 'builtin' && <NeteaseAccount enabled={savedMode === 'builtin'}/>}</>;
}
