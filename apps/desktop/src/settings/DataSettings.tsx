import { useEffect, useState } from 'react';
import { library, errorMessage } from '../library/gateway';
import { settings, type DataLocation } from './gateway';

export function DataSettings({ libraryAvailable, onRestore, onBusy }: {
  libraryAvailable: boolean; onRestore(): void; onBusy(value: boolean): void;
}) {
  const [location, setLocation] = useState<DataLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void settings.location().then(value => { if (active) setLocation(value); })
      .catch(cause => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, []);
  async function backup() {
    if (busy) return;
    setBusy(true); onBusy(true); setError('');
    try { setSaved(await library.backup()); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); onBusy(false); }
  }
  return <div className="data-settings">
    <div className="setting-row"><span>数据位置</span><button className="text-button" disabled={!location || busy} onClick={() => {
      void settings.openDirectory().catch(cause => setError(errorMessage(cause)));
    }}>打开目录 ↗</button></div>
    <p className="data-path">{location?.directory || '读取中'}</p>
    <p className="setting-hint">收藏、封面、模型与播放历史保存在本地。</p>
    <div className="settings-section">
      <div className="setting-row"><span>备份收藏</span><button className="text-button" disabled={!libraryAvailable || busy} onClick={() => void backup()}>{busy ? '保存中' : '创建备份'}</button></div>
      <div className="setting-row"><span>恢复收藏</span><button className="text-button" disabled={!libraryAvailable || busy} onClick={onRestore}>选择备份</button></div>
    </div>
    <div className="settings-feedback" aria-live="polite">
      {saved && <><span>备份已保存</span><p className="data-path">{saved}</p></>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </div>;
}
