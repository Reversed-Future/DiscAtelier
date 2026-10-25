import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { library } from '../library/gateway';
import type { LibraryCopy } from '../library/types';
import { chooseItem, matchTrack, parseEpisode, parseTrack, type TrackTitle } from './match';
import { FolderPicker } from './FolderPicker';
import { Select } from '../ui/Select';
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
  trackTitle: string;
  matched: boolean;
}

export function LocalFilesPanel({ onClose }: { onClose(): void }) {
  const [items, setItems] = useState<LibraryCopy[]>([]);
  const [trackTitles, setTrackTitles] = useState<Map<string, TrackTitle[]>>(new Map());
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

  useEffect(() => {
    if (!items.length) return;
    let active = true;
    Promise.all(items.filter(item => item.edition.categoryId === 'music').map(async item => {
      const content = await library.content(item.editionId);
      return [item.id, (content?.tracks || []).map(track => ({ title: track.title, position: track.position }))] as const;
    })).then(entries => {
      if (active) setTrackTitles(new Map(entries));
    }).catch(() => {});
    return () => { active = false; };
  }, [items]);

  function trackFor(itemId: string, file: ScannedFile) {
    const matched = matchTrack(file.name, trackTitles.get(itemId) || []);
    if (matched) return { number: matched.number, title: matched.title };
    return { number: parseTrack(file.name), title: '' };
  }

  function propose(scanned: ScannedFile[]) {
    setRows(scanned.map(file => {
      const item = chooseItem(items, file, false, trackTitles);
      const episode = item && item.edition.categoryId === 'video' ? parseEpisode(file.name) : null;
      const track = item && item.edition.categoryId === 'music' ? trackFor(item.id, file) : { number: null, title: '' };
      return { file, copyId: item?.id || '', episode, track: track.number, trackTitle: track.title, matched: !!item };
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

  useEffect(() => {
    if (!trackTitles.size || !files.length) return;
    setRows(current => current.map(row => {
      if (row.copyId) return row;
      const item = chooseItem(items, row.file, false, trackTitles);
      if (!item) return row;
      return {
        ...row,
        copyId: item.id,
        matched: true,
        episode: item.edition.categoryId === 'video' ? parseEpisode(row.file.name) : null,
        track: item.edition.categoryId === 'music' ? trackFor(item.id, row.file).number : null,
        trackTitle: item.edition.categoryId === 'music' ? trackFor(item.id, row.file).title : '',
      };
    }));
  }, [trackTitles, files, items]);

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
        label: `${item?.edition.title || row.file.name}${row.episode ? ` · 第 ${row.episode} 集` : row.track ? ` · 第 ${row.track} 轨${row.trackTitle ? ` · ${row.trackTitle}` : ''}` : ''}`,
        episode: row.episode,
        track: row.track,
      };
    })];
    await invoke('local_files_save', { bindings: next });
    setBindings(next);
    window.dispatchEvent(new Event('local-files-changed'));
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
        track: category === 'music' ? trackFor(copyId, row.file).number : null,
        trackTitle: category === 'music' ? trackFor(copyId, row.file).title : '',
      };
    }));
  }

  function autoAssociate() {
    setRows(current => current.map(row => {
      if (row.copyId) return row;
      const item = chooseItem(items, row.file, true, trackTitles);
      if (!item) return row;
      return {
        ...row,
        copyId: item.id,
        matched: true,
        episode: item.edition.categoryId === 'video' ? parseEpisode(row.file.name) : null,
        track: item.edition.categoryId === 'music' ? trackFor(item.id, row.file).number : null,
        trackTitle: item.edition.categoryId === 'music' ? trackFor(item.id, row.file).title : '',
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
    <div className="local-files-settings">
      <p className="setting-hint">选择收藏所在的文件夹，自动扫描子目录并匹配到音乐或影片。匹配结果会保存为这台电脑上的本地关联。</p>
      <FolderPicker value={folder} onChange={setFolder} busy={busy} count={files.length}
        onBrowse={() => void chooseFolder()} onScan={() => void scan(folder)}/>
      {!!bindings.length && <div className="setting-row">
        <span>已保存 {bindings.length} 条本地关联</span>
        <button type="button" className="text-button" disabled={busy} onClick={forget}>清除全部关联</button>
      </div>}
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
                <td><Select label={`${row.file.name} 的收藏条目`} value={row.copyId} disabled={busy}
                  options={[
                    { id: '', label: '未关联' },
                    ...items.map(entry => ({
                      id: entry.id,
                      label: `${entry.edition.categoryId === 'music' ? '音乐' : '影像'} · ${entry.edition.title}${entry.edition.creator ? ` / ${entry.edition.creator}` : ''}`,
                    })),
                  ]}
                  onChange={value => updateRow(index, value)}/></td>
                <td>{row.episode ? `第 ${row.episode} 集` : row.track
                  ? <span className="local-track-cell"><span>第 {row.track} 轨</span>{row.trackTitle && <span className="local-track-title" title={row.trackTitle}>{row.trackTitle}</span>}</span>
                  : '—'}</td>
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
