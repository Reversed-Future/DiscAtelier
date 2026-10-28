import { useEffect, useState } from 'react';
import { Select } from '../ui/Select';
import { errorMessage } from '../library/gateway';
import { shell, type CloseAction } from './gateway';
export function WindowSettings() {
  const [value, setValue] = useState<CloseAction>('ask'), [busy, setBusy] = useState(true), [error, setError] = useState('');
  useEffect(() => { let live = true; void shell.preference().then(result => { if (live) setValue(result); }).catch(cause => { if (live) setError(errorMessage(cause)); }).finally(() => { if (live) setBusy(false); }); return () => { live = false; }; }, []);
  async function save(action: CloseAction) {
    setBusy(true); setError('');
    try { await shell.savePreference(action); setValue(action); } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="window-settings"><label>点击关闭按钮时<Select label="点击关闭按钮时" value={value} disabled={busy} options={[{ id: 'ask', label: '每次询问' }, { id: 'tray', label: '最小化到托盘' }, { id: 'quit', label: '退出应用' }]} onChange={action => { if (action === 'ask' || action === 'tray' || action === 'quit') void save(action); }}/></label><p className="setting-hint">最小化到托盘后继续播放。点击托盘图标可返回主窗口。</p>{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
