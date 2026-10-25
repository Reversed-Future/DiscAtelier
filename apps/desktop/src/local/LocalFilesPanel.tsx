import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { library } from '../library/gateway';
import type { LibraryCopy } from '../library/types';
import { chooseItem, parseEpisode, parseTrack } from './match';
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
  copyId: string;
  episode: number | null;
  track: number | null;
  matched: boolean;
}

export function LocalFilesPanel({ onClose }: { onClose(): void }) {
  const [items, setItems] = useState<LibraryCopy[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [folder, setFolder] = useState('');
  const [files, setFiles] = useState<ScannedFile[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      library.list({ categoryId: 'music', status: null, query: '' }),
      library.list({ categoryId: 'video', status: null, query: '' }),
      invoke<Binding[]>('local_files_get'),
    ]).then(([music, video, saved]) => {
      if (!active) return;
      setItems([...music.copies, ...video.copies]);
      setBindings(saved);
      setLoaded(true);
    }).catch(cause => {
      if (active) { setError(cause instanceof Error ? cause.message : String(cause)); setLoaded(true); }
    });
    return () => { active = false; };
  }, []);

  function propose(scanned: ScannedFile[]) {
    setRows(scanned.map(file => {
      const item = chooseItem(items, file);
      const episode = item && item.edition.categoryId === 'video' ? parseEpisode(file.name) : null;
      const track = item && item.edition.categoryId === 'music' ? parseTrack(file.name) : null;
      return { file, copyId: item?.id || '', episode, track, matched: !!item };
    }));
  }

  async function scan(path: string) {
    if (!path.trim()) return;
    setError(''); setBusy(true); setFolder(path);
    try {
      const scanned = await invoke<ScannedFile[]>('local_files_scan', { folder: path });
      setFiles(scanned); propose(scanned);
      if (!scanned.length) setError('这个文件夹里没有找到支持的音视频文件。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  async function chooseFolder() {
    const selected = await open({ directory: true, multiple: false, title: '选择本地文件所在的文件夹' });
    if (typeof selected === 'string') await scan(selected);
  }

  async function save(): Promise<Binding[]> {
    const scanned = new Set(rows.map(row => row.file.path));
    const kept = bindings.filter(binding => !scanned.has(binding.path));
    const next = [...kept, ...rows.filter(row => row.copyId).map(row => {
      const item = items.find(entry => entry.id === row.copyId);
      return {
        copyId: row.copyId,
        path: row.file.path,
        label: `${item?.edition.title || row.file.name}${row.episode ? ` · 第 ${row.episode} 集` : row.track ? ` · 第 ${row.track} 轨` : ''}`,
        episode: row.episode,
        track: row.track,
      };
    })];
    await invoke('local_files_save', { bindings: next });
    setBindings(next);
    return next;
  }

  async function saveAndPlay(row: Row) {
    if (!row.copyId) return;
    setBusy(true); setError('');
    try {
      await save();
      await invoke('playback_start_local', { copyId: row.copyId, path: row.file.path });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  function updateRow(index: number, copyId: string) {
    setRows(current => current.map((row, position) => {
      if (position !== index) return row;
      const category = items.find(item => item.id === copyId)?.edition.categoryId || '';
      return {
        ...row,
        copyId,
        matched: !!copyId,
        episode: category === 'video' ? parseEpisode(row.file.name) : null,
        track: category === 'music' ? parseTrack(row.file.name) : null,
      };
    }));
  }

  function autoAssociate() {
    setRows(current => current.map(row => {
      if (row.copyId) return row;
      const item = chooseItem(items, row.file, true);
      if (!item) return row;
      return {
        ...row,
        copyId: item.id,
        matched: true,
        episode: item.edition.categoryId === 'video' ? parseEpisode(row.file.name) : null,
        track: item.edition.categoryId === 'music' ? parseTrack(row.file.name) : null,
      };
    }));
  }

  function forget() {
    setBindings([]);
    void invoke('local_files_save', { bindings: [] }).catch(cause => setError(String(cause)));
  }

  const bound = useMemo(() => new Set(bindings.map(binding => binding.path)), [bindings]);
  const matchedCount = rows.filter(row => row.copyId).length;

  return <Modal title="本地文件" onClose={onClose} wide busy={busy} className="local-files-panel">
    <div className="local-files-head">
      <div>
        <p className="setting-hint">选择收藏所在的文件夹，自动扫描子目录并匹配到音乐或影片。匹配结果会保存为这台电脑上的本地关联。</p>
        <div className="local-files-path-row">
          <input aria-label="文件夹路径" placeholder="也可以直接粘贴文件夹路径" value={folder} onChange={event => setFolder(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void scan(folder); } }} disabled={busy}/>
          <button type="button" className="text-button" disabled={busy || !folder.trim()} onClick={() => void scan(folder)}>扫描</button>
        </div>
        <p className="local-files-path">{files.length ? `${files.length} 个文件` : folder ? '尚未扫描' : '尚未选择文件夹'}</p>
      </div>
      <div className="local-files-actions">
        <button type="button" className="text-button" disabled={busy} onClick={() => void chooseFolder()}>{folder ? '选择其他文件夹' : '选择文件夹'}</button>
        {!!bindings.length && <button type="button" className="text-button" disabled={busy} onClick={forget}>清除关联</button>}
      </div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loaded && <p className="utility-copy">正在读取收藏…</p>}
    {!!files.length && <>
      <div className="local-files-summary">
        <span>{matchedCount} / {files.length} 个文件已关联</span>
        <button type="button" className="text-button" disabled={busy || matchedCount === files.length} onClick={autoAssociate}>自动关联未匹配</button>
      </div>
      <div className="local-files-table-wrap">
        <table className="local-files-table">
          <thead><tr><th>文件</th><th>收藏条目</th><th>集 / 轨</th><th>状态</th></tr></thead>
          <tbody>
            {rows.map((row, index) => {
              const item = items.find(entry => entry.id === row.copyId);
              const saved = bound.has(row.file.path);
              return <tr key={row.file.path}>
                <td title={row.file.relativePath}><span>{row.file.relativePath}</span></td>
                <td><select value={row.copyId} disabled={busy} onChange={event => updateRow(index, event.target.value)}>
                  <option value="">未关联</option>
                  {items.map(entry => <option key={entry.id} value={entry.id}>{entry.edition.categoryId === 'music' ? '音乐' : '影像'} · {entry.edition.title}{entry.edition.creator ? ` / ${entry.edition.creator}` : ''}</option>)}
                </select></td>
                <td>{row.episode ? `第 ${row.episode} 集` : row.track ? `第 ${row.track} 轨` : '—'}</td>
                <td>{saved ? <button type="button" className="text-button" disabled={busy} onClick={() => void saveAndPlay(row)}>播放</button> : item ? <span className="local-files-ok">已识别</span> : <span className="local-files-miss">未匹配</span>}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="settings-actions">
        <span className="setting-hint">识别依据：文件夹名、标题、作者和文件名；S01E01、第 01 集及开头的 01/02/03 会识别为集数或轨号。</span>
        <button type="button" className="solid-button" disabled={busy || !matchedCount} onClick={() => void save().then(() => { setError(''); onClose(); }).catch(cause => setError(cause instanceof Error ? cause.message : String(cause)))}>保存关联</button>
      </div>
    </>}
  </Modal>;
}
