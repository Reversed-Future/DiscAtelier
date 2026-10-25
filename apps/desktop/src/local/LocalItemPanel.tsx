import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { library } from '../library/gateway';
import { netease } from '../integrations/gateway';
import type { LibraryCopy } from '../library/types';
import { isAudio, matchTrack, parseEpisode, parseTrack, trackIndexForNumber, trackNumberAt, type TrackTitle } from './match';
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
  number: string;
  title: string;
}

function savedTitle(binding: Binding) {
  const parts = binding.label.split(' · ');
  return parts.length > 2 ? parts[parts.length - 1] : '';
}

function sortRows(values: Row[]) {
  return [...values].sort((left, right) => {
    const number = (Number(left.number) || Number.MAX_SAFE_INTEGER) - (Number(right.number) || Number.MAX_SAFE_INTEGER);
    return number || left.file.relativePath.localeCompare(right.file.relativePath);
  });
}

function matchRow(item: LibraryCopy, file: ScannedFile, tracks: TrackTitle[]) {
  if (item.edition.categoryId === 'music' || isAudio(file)) {
    const matched = matchTrack(file.name, tracks);
    if (matched) return { number: String(matched.number), title: matched.title };
    // An artist - title filename must not be mistaken for a trailing track number.
    if (/^\s*\d{1,3}(?:\s|[-–—])/.test(file.name)) {
      const value = parseTrack(file.name);
      if (value) return { number: String(value), title: '' };
    }
    return { number: '', title: '' };
  }
  const value = parseEpisode(file.name);
  return { number: value ? String(value) : '', title: '' };
}

export function LocalItemPanel({ item, onClose }: { item: LibraryCopy; onClose(): void }) {
  const [all, setAll] = useState<Binding[]>([]);
  const [tracks, setTracks] = useState<TrackTitle[]>([]);
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

  useEffect(() => {
    let active = true;
    if (item.edition.categoryId !== 'music') return;
    Promise.all([
      library.content(item.editionId).catch(() => null),
      netease.albums(item.editionId).catch(() => []),
    ]).then(([content, albums]) => {
      if (!active) return;
      if (content?.tracks.length) {
        setTracks(content.tracks.map(track => ({ title: track.title, position: track.position })));
      } else {
        const fallback = albums.flatMap(entry => entry.album.tracks.map((song, index) => ({
          title: song.title,
          position: String(index + 1),
        })));
        setTracks(fallback);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [item.editionId, item.edition.categoryId]);
  useEffect(() => {
    if (!tracks.length) return;
    setRows(current => sortRows(current.map(row => {
      const matched = matchRow(item, row.file, tracks);
      return { ...row, number: row.number || matched.number, title: row.title || matched.title };
    })));
  }, [tracks, item]);

  const own = all.filter(binding => binding.copyId === item.id)
    .sort((left, right) => (left.track || Number.MAX_SAFE_INTEGER) - (right.track || Number.MAX_SAFE_INTEGER));

  async function scan(path: string) {
    if (!path.trim()) return;
    setBusy(true); setError(''); setFolder(path);
    try {
      const scanned = await invoke<ScannedFile[]>('local_files_scan', { folder: path });
      setFiles(scanned);
      setRows(sortRows(scanned.map(file => ({ file, ...matchRow(item, file, tracks) }))));
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
        label: `${item.edition.title}${episode ? ` · 第 ${episode} 章` : track ? ` · 第 ${track} 轨${row.title ? ` · ${row.title}` : ''}` : ''}`,
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
      window.dispatchEvent(new Event('local-files-changed'));
      setFiles([]); setRows([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  function updateNumber(index: number, value: string) {
    setRows(current => current.map((row, position) => {
      if (position !== index) return row;
      const number = Number(value);
      const track = Number.isInteger(number) && number > 0 ? trackIndexForNumber(tracks, number) : -1;
      return { ...row, number: value, title: track >= 0 ? tracks[track].title : '' };
    }));
  }

  function trackValue(row: Row) {
    const index = tracks.findIndex(track => track.title === row.title);
    return index >= 0 ? String(index) : '';
  }

  function updateTitle(index: number, value: string) {
    const track = Number(value);
    if (!Number.isInteger(track) || track < 0 || !tracks[track]) {
      setRows(current => current.map((row, position) => position === index ? { ...row, title: '' } : row));
      return;
    }
    const number = trackNumberAt(tracks, track) || track + 1;
    setRows(current => current.map((row, position) => position === index ? {
      ...row,
      title: tracks[track].title,
      number: String(number),
    } : row));
  }

  async function play(path: string) {
    setBusy(true); setError('');
    try { await invoke('playback_start_local', { copyId: item.id, path }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <Modal title={`本地文件 · ${item.edition.title}`} onClose={onClose} wide busy={busy} className="local-files-panel">
    <div className="local-files-settings">
      <p className="setting-hint">这个文件夹只关联到当前收藏。每个文件可以单独填写章节或轨号；保存后从这里直接播放。</p>
      <FolderPicker value={folder} onChange={setFolder} busy={busy}
        onBrowse={() => void chooseFolder()} onScan={() => void scan(folder)}/>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loaded && <p className="utility-copy">正在读取关联…</p>}
    {!!own.length && !files.length && <>
      <div className="local-files-summary"><span>已关联 {own.length} 个文件</span><button type="button" className="text-button" disabled={busy} onClick={() => {
        setError('');
        const next = all.filter(binding => binding.copyId !== item.id);
        void invoke('local_files_save', { bindings: next }).then(() => setAll(next)).catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
      }}>清除本收藏关联</button></div>
      <div className={files.length ? 'local-files-table-wrap local-files-saved' : 'local-files-table-wrap'}><table className="local-files-table"><thead><tr><th>文件</th><th>位置</th><th>{item.edition.categoryId === 'video' ? '章节' : '歌曲'}</th><th>操作</th></tr></thead><tbody>
        {own.map(binding => <tr key={binding.path}><td title={binding.path}><span>{binding.path.split(/[\\/]/).pop()}</span></td>
          <td>{binding.episode ? `第 ${binding.episode} 章` : binding.track ? `第 ${binding.track} 轨` : '—'}</td>
          <td><span className="local-track-title">{item.edition.categoryId === 'video' ? (binding.episode ? `第 ${binding.episode} 章` : '—') : savedTitle(binding) || '—'}</span></td>
          <td><button type="button" className="text-button" disabled={busy} onClick={() => void play(binding.path)}>播放</button></td></tr>)}
      </tbody></table></div>
    </>}
    {!!files.length && <>
      <div className="local-files-summary"><span>{rows.length} 个文件将关联到当前收藏</span></div>
      <div className="local-files-table-wrap"><table className="local-files-table"><thead><tr><th>文件</th><th>{item.edition.categoryId === 'video' ? '章节' : '轨号'}</th><th>{item.edition.categoryId === 'video' ? '关联章节' : '关联歌曲'}</th><th>操作</th></tr></thead><tbody>
        {rows.map((row, index) => <tr key={row.file.path}>
          <td title={row.file.relativePath}><span>{row.file.relativePath}</span></td>
          <td><input type="number" min="1" max="9999" aria-label={`${row.file.name} 的${item.edition.categoryId === 'video' ? '章节' : '轨号'}`} value={row.number}
            onChange={event => updateNumber(index, event.target.value)}/></td>
          <td>{item.edition.categoryId === 'music' && tracks.length
            ? <Select label={`${row.file.name} 的关联歌曲`} value={trackValue(row)}
              options={[{ id: '', label: '不指定' }, ...tracks.map((track, trackIndex) => ({ id: String(trackIndex), label: track.title }))]}
              onChange={value => updateTitle(index, value)}/>
            : <span className={row.number ? 'local-track-manual' : 'local-files-miss'}>{item.edition.categoryId === 'video' ? (row.number ? `第 ${row.number} 章` : '未匹配到章节') : (row.number ? '手动填写' : '未匹配到曲目')}</span>}</td>
          <td><button type="button" className="text-button" disabled={busy} onClick={() => setRows(current => current.filter((_, position) => position !== index))}>移除</button></td>
        </tr>)}
      </tbody></table></div>
      <div className="settings-actions">
        <span className="setting-hint">留空表示只关联文件，不指定章节或轨号。</span>
        <button type="button" className="solid-button" disabled={busy || !rows.length} onClick={() => void save()}>保存关联</button>
      </div>
    </>}
  </Modal>;
}
