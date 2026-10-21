import { useEffect, useId, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { errorMessage } from '../library/gateway';
import { deleteSelectedBackups, fileSize, type BackupInventory } from './backupFiles';
import '../styles/backups.css';

export function BackupManager({ revision, busy, onBusy }: {
  revision: number; busy: boolean; onBusy(value: boolean): void;
}) {
  const id = useId();
  const [inventory, setInventory] = useState<BackupInventory | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const active = useRef(false);
  const locked = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    setLoading(true); setConfirm(false); setSelected(new Set()); setError('');
    void invoke<BackupInventory>('backup_inventory').then(value => {
      if (current) setInventory(value);
    }).catch(cause => { if (current) { setInventory(null); setError(errorMessage(cause)); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [revision, refresh]);
  const chosen = inventory?.entries.filter(entry => selected.has(entry.name)) || [];
  const selectedBytes = chosen.reduce((sum, entry) => sum + entry.byteLength, 0);
  const disabled = busy || loading || deleting;

  async function remove() {
    if (disabled || locked.current || !confirm || !chosen.length) return;
    locked.current = true; setDeleting(true); onBusy(true); setMessage(''); setError('');
    try {
      const result = await deleteSelectedBackups(chosen, entry => invoke<void>('backup_delete_one', { name: entry.name, stamp: entry.stamp }));
      if (!active.current) return;
      setSelected(new Set()); setConfirm(false);
      setMessage(result.deleted.length ? `已删除 ${result.deleted.length} 份备份。` : '未删除备份。');
      if (result.failed) setError(`${result.failed}：${errorMessage(result.cause)} 其余备份未继续删除。`);
      try { setInventory(await invoke<BackupInventory>('backup_inventory')); }
      catch (cause) { setInventory(null); setError(errorMessage(cause)); }
    } finally {
      locked.current = false;
      if (active.current) setDeleting(false);
      onBusy(false);
    }
  }

  return <section className="backup-manager" aria-label="备份管理">
    <div className="setting-row">
      <span>备份占用 <span className="backup-total">{loading ? '读取中' : inventory ? `${fileSize(inventory.totalBytes)} · ${inventory.entries.length} 份` : '暂不可用'}</span></span>
      <button className="text-button" disabled={disabled} aria-expanded={open} aria-controls={id}
        onClick={() => { setOpen(!open); setConfirm(false); setSelected(new Set()); if (!open) setRefresh(v => v + 1); }}>{open ? '收起' : '管理'}</button>
    </div>
    <div className="settings-disclosure" data-open={open} inert={!open} id={id}>
      <div>
        <div className="backup-list" data-long-scroll aria-busy={loading || deleting}>
          {inventory?.entries.map(entry => <label className="backup-item" key={entry.name}>
            <input type="checkbox" checked={selected.has(entry.name)} disabled={disabled || confirm}
              onChange={event => { const checked = event.target.checked; setSelected(previous => { const next = new Set(previous); if (checked) next.add(entry.name); else next.delete(entry.name); return next; }); }} />
            <span className="backup-description"><span>{new Date(entry.modifiedAt).toLocaleString()} {entry.incomplete && <small>未完成</small>}</span><span className="backup-filename" title={entry.name}>{entry.name}</span></span>
            <span className="backup-size">{fileSize(entry.byteLength)}</span>
          </label>)}
          {inventory && !inventory.entries.length && <p className="setting-hint">暂无备份。</p>}
        </div>
        {!!inventory?.otherBytes && <p className="setting-hint">占用含 {fileSize(inventory.otherBytes)} 辅助文件，不在删除范围内。</p>}
        <div className="backup-toolbar">
          <span className="setting-hint">{selected.size ? `已选 ${selected.size} 份 · ${fileSize(selectedBytes)}` : '勾选需要删除的备份'}</span>
          <button className="text-button" disabled={disabled || confirm} onClick={() => setRefresh(v => v + 1)}>刷新</button>
          {!confirm && <button className="text-button" disabled={disabled || !chosen.length} onClick={() => setConfirm(true)}>删除所选</button>}
        </div>
        {confirm && <div className="backup-confirm" role="group" aria-label="确认删除备份">
          <p className="setting-hint">永久删除所选 {chosen.length} 份备份？当前收藏不受影响；删除后无法用这些备份恢复。</p>
          <div className="backup-confirm-actions"><button className="text-button" disabled={disabled} onClick={() => setConfirm(false)}>取消</button><button className="solid-button" disabled={disabled} onClick={() => void remove()}>{deleting ? '删除中' : '确认删除'}</button></div>
        </div>}
      </div>
    </div>
    {(message || error) && <div className="backup-feedback" aria-live="polite">{message && <p>{message}</p>}{error && <p role="alert">{error}</p>}</div>}
  </section>;
}
