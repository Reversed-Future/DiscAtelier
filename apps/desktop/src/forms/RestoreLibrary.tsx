import { useEffect, useState } from 'react';
import type { BackupEntry, RestorePreview } from '../library/types';
import { library, errorMessage } from '../library/gateway';
import { Modal } from '../ui/Modal';

export function RestoreLibrary({ onClose, onRestored }: { onClose(): void; onRestored(): void }) {
  const [entries, setEntries] = useState<BackupEntry[]>([]);
  const [path, setPath] = useState('');
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  useEffect(() => { void library.backups().then(setEntries).catch(cause => setError(errorMessage(cause))); }, []);
  const select = (value: string) => { setPath(value); setPreview(null); setError(''); };
  return <Modal title={saved ? '恢复完成' : '恢复收藏'} onClose={onClose} busy={busy} wide>
    {saved ? <><p className="utility-copy">原收藏已备份到</p><p className="backup-path">{saved}</p></> :
      <form onSubmit={async event => {
        event.preventDefault(); if (busy) return;
        setBusy(true); setError('');
        try {
          if (preview) { setSaved(await library.restore(preview.token)); onRestored(); }
          else setPreview(await library.prepareRestore(path));
        } catch (cause) { setError(errorMessage(cause)); setPreview(null); }
        finally { setBusy(false); }
      }}>
        <fieldset disabled={busy}>
          {!preview && <>
            <div className="backup-list" aria-label="已有备份">{entries.map(entry =>
              <button type="button" key={entry.path} className={path === entry.path ? 'chosen' : ''} aria-pressed={path === entry.path} onClick={() => select(entry.path)}>
                <span>{entry.name}</span><small>{(entry.byteLength / 1024 / 1024).toFixed(1)} MB</small>
              </button>)}</div>
            <label>备份文件路径<input value={path} onChange={event => select(event.target.value)} spellCheck={false}/></label>
          </>}
          {preview && <section className="restore-preview">
            <p>{preview.copies} 套收藏 · {preview.editions} 个版本 · {preview.assets} 张封面{preview.models > 0 && ` · ${preview.models} 个模型`}</p>
            <p className="backup-path">{path}</p>
            <p className="utility-copy">将替换当前收藏。恢复前会自动备份现有资料。</p>
            <button type="button" className="text-button" onClick={() => setPreview(null)}>重新选择</button>
          </section>}
        </fieldset>
        <p role="alert" className="form-error">{error}</p>
        <footer className="form-footer"><button className="solid-button" disabled={busy || !path}>{busy ? '处理中' : preview ? '确认恢复' : '检查备份'}</button></footer>
      </form>}
  </Modal>;
}
