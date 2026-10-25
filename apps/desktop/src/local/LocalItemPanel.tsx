import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { LibraryCopy } from '../library/types';
import { isAudio, parseEpisode, parseTrack } from './match';
import { Modal } from '../ui/Modal';

interface ScannedFile {
  path: string;
  relativePath: string;
  name: string;
  size: number;
}
interface Binding {
  copyId: string;
  path: string;
  label: string;
  episode?: number | null;
  track?: number | null;
}
interface Row {
  file: ScannedFile;
  number: string;
}

function defaultNumber(item: LibraryCopy, file: ScannedFile) {
  const value = item.edition.categoryId === 'music' || isAudio(file) ? parseTrack(file.name) : parseEpisode(file.name);
  return value ? String(value) : '';
}

export function LocalItemPanel({ item, onClose }: { item: LibraryCopy; onClose(): void }) {
  const [all, setAll] = useState<Binding[]>([]);
  const [folder, setFolder] = useState('');
  const [files, setFiles] = useState<ScannedFile[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    invoke<Binding[]>('local_files_get').then(values => {
      if (active) { setAll(values); setLoaded(true); }
    }).catch(cause => {
      if (active) { setError(cause instanceof Error ? cause.message : String(cause)); setLoaded(true); }
    });
    return () => { active = false; };
  }, []);

  const own = all.filter(binding => binding.copyId === item.id);

  async function scan(path: string) {
    if (!path.trim()) return;
    setBusy(true); setError(''); setFolder(path);
    try {
      const scanned = await invoke<ScannedFile[]>('local_files_scan', { folder: path });
      setFiles(scanned);
      setRows(scanned.map(file => ({ file, number: defaultNumber(item, file) })));
      if (!scanned.length) setError('这个文件夹里没有找到支持的音视频文件。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  async function chooseFolder() {
    const selected = await open({ directory: true, multiple: false, title: `选择「${item.edition.title}」的本地文件文件夹` });
    if (typeof selected === 'string') await scan(selected);
  }

  function bindings(): Binding[] {
    const category = item.edition.categoryId;
    return rows.map(row => {
      const value = Number(row.number);
      const episode = category === 'video' && Number.isInteger(value) && value > 0 ? value : null;
      const track = category === 'music' && Number.isInteger(value) && value > 0 ? value : null;
      return {
        copyId: item.id,
        path: row.file.path,
        label: `${item.edition.title}${episode ? ` · 第 ${episode} 集` : track ? ` · 第 ${track} 轨` : ''}`,
        episode,
        track,
      };
    });
  }

  async function persist(): Promise<Binding[]> {
    const next = [...all.filter(binding => binding.copyId !== item.id), ...bindings()];
    await invoke('local_files_save', { bindings: next });
    setAll(next);
    return next;
  }

  async function save() {
    setBusy(true); setError('');
    try {
      await persist();
      setFiles([]); setRows([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function play(path: string) {
    setBusy(true); setError('');
    try { await invoke('playback_start_local', { copyId: item.id, path }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <Modal title={`本地文件 · ${item.edition.title}`} onClose={onClose} wide busy={busy} className="local-files-panel">
    <div className="local-files-head">
      <div>
        <p className="setting-hint">这个文件夹只关联到当前收藏。每个文件可以单独填写集数或轨号；保存后从这里直接播放。</p>
        <div className="local-files-path-row">
          <input aria-label="文件夹路径" placeholder="也可以直接粘贴文件夹路径" value={folder} onChange={event => setFolder(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void scan(folder); } }} disabled={busy}/>
          <button type="button" className="text-button" disabled={busy || !folder.trim()} onClick={() => void scan(folder)}>扫描</button>
        </div>
        <p className="local-files-path">{files.length ? `${files.length} 个文件` : folder ? '尚未扫描' : '尚未选择文件夹'}</p>
      </div>
      <div className="local-files-actions">
        <button type="button" className="text-button" disabled={busy} onClick={() => void chooseFolder()}>{folder ? '选择其他文件夹' : '选择文件夹'}</button>
      </div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loaded && <p className="utility-copy">正在读取关联…</p>}
    {!!own.length && !files.length && <>
      <div className="local-files-summary"><span>已关联 {own.length} 个文件</span><button type="button" className="text-button" disabled={busy} onClick={() => {
        setError('');
        const next = all.filter(binding => binding.copyId !== item.id);
        void invoke('local_files_save', { bindings: next }).then(() => setAll(next)).catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
      }}>清除本收藏关联</button></div>
      <div className="local-files-table-wrap"><table className="local-files-table"><thead><tr><th>文件</th><th>位置</th><th>操作</th></tr></thead><tbody>
        {own.map(binding => <tr key={binding.path}><td title={binding.path}><span>{binding.path.split(/[\\/]/).pop()}</span></td>
          <td>{binding.episode ? `第 ${binding.episode} 集` : binding.track ? `第 ${binding.track} 轨` : '—'}</td>
          <td><button type="button" className="text-button" disabled={busy} onClick={() => void play(binding.path)}>播放</button></td></tr>)}
      </tbody></table></div>
    </>}
    {!!files.length && <>
      <div className="local-files-summary"><span>{rows.length} 个文件将关联到当前收藏</span></div>
      <div className="local-files-table-wrap"><table className="local-files-table"><thead><tr><th>文件</th><th>{item.edition.categoryId === 'video' ? '集数' : '轨号'}</th><th>操作</th></tr></thead><tbody>
        {rows.map((row, index) => <tr key={row.file.path}>
          <td title={row.file.relativePath}><span>{row.file.relativePath}</span></td>
          <td><input type="number" min="1" max="9999" aria-label={`${row.file.name} 的${item.edition.categoryId === 'video' ? '集数' : '轨号'}`} value={row.number}
            onChange={event => setRows(current => current.map((value, position) => position === index ? { ...value, number: event.target.value } : value))}/></td>
          <td><button type="button" className="text-button" disabled={busy} onClick={() => setRows(current => current.filter((_, position) => position !== index))}>移除</button></td>
        </tr>)}
      </tbody></table></div>
      <div className="settings-actions">
        <span className="setting-hint">留空表示只关联文件，不指定集数或轨号。</span>
        <button type="button" className="solid-button" disabled={busy || !rows.length} onClick={() => void save()}>保存关联</button>
      </div>
    </>}
  </Modal>;
}
