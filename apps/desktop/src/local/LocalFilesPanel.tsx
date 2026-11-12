import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { errorMessage, library } from '../library/gateway';
import { netease } from '../integrations/gateway';
import type { LibraryCopy } from '../library/types';
import { chooseItem, isAudio, matchTrack, parseEpisode, parseTrack, type TrackTitle } from './match';
import { albumTrackRefs, matchAlbumTrack } from './albumTrackRefs';
import { loadVideoChapters } from './videoChapters';
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
  disc?: string | null;
}
interface Row {
  file: ScannedFile;
  copyId: string;
  episode: number | null;
  track: number | null;
  disc: string | null;
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
      if (active) { setError(errorMessage(cause)); setLoaded(true); }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!items.length) return;
    let active = true;
    Promise.all(items.filter(item => item.edition.categoryId === 'music' || item.edition.categoryId === 'video').map(async item => {
      if (item.edition.categoryId === 'video') {
        return [item.id, await loadVideoChapters(item.editionId).catch(() => [])] as const;
      }
      const [content, albums] = await Promise.all([
        library.content(item.editionId).catch(() => null),
        netease.albums(item.editionId).catch(() => []),
      ]);
      const tracks: TrackTitle[] = content?.tracks.length
        ? albumTrackRefs(content.tracks, item.edition.title, item.edition.media)
        : albumTrackRefs(albums.flatMap(entry => entry.album.tracks.map((song, index) => ({
          title: song.title,
          position: `${song.disc || 1}-${song.number || index + 1}`,
          duration: '',
          type_: 'track',
          sub_tracks: [],
        }))), item.edition.title, item.edition.media);
      return [item.id, tracks] as const;
    })).then(entries => {
      if (active) setTrackTitles(new Map(entries));
    }).catch(() => {});
    return () => { active = false; };
  }, [items]);

  function trackFor(itemId: string, file: ScannedFile) {
    const refs = trackTitles.get(itemId) || [];
    const matched = matchAlbumTrack(`${file.relativePath} ${file.name}`, refs, '', isAudio(file) ? 'audio' : 'video');
    if (matched) return { number: matched.number, title: matched.title, disc: matched.disc || null };
    // When album metadata exists, an unmatched/ambiguous file must stay
    // unassociated instead of falling back to a cross-disc track number.
    return { number: refs.length ? null : parseTrack(file.name), title: '', disc: null };
  }

  function chapterFor(itemId: string, file: ScannedFile) {
    const matched = matchTrack(file.name, trackTitles.get(itemId) || []);
    return { number: matched?.number ?? null, title: matched?.title || '' };
  }

  function sortRows(values: Row[]) {
    return [...values].sort((left, right) => {
      if (!left.copyId || !right.copyId) {
        if (left.copyId) return -1;
        if (right.copyId) return 1;
        return left.file.relativePath.localeCompare(right.file.relativePath);
      }
      const album = items.findIndex(item => item.id === left.copyId) - items.findIndex(item => item.id === right.copyId);
      const track = (left.track || left.episode || Number.MAX_SAFE_INTEGER) - (right.track || right.episode || Number.MAX_SAFE_INTEGER);
      return album || track || left.file.relativePath.localeCompare(right.file.relativePath);
    });
  }

  function propose(scanned: ScannedFile[]) {
    setRows(sortRows(scanned.map(file => {
      const item = chooseItem(items, file, false, trackTitles);
      const video = item?.edition.categoryId === 'video';
      const chapter = video ? chapterFor(item.id, file) : { number: null, title: '' };
      const episode = video ? parseEpisode(file.name) || chapter.number : null;
      const track = item?.edition.categoryId === 'music' ? trackFor(item.id, file) : { number: null, title: '', disc: null };
      return { file, copyId: item?.id || '', episode, track: track.number, disc: video ? null : track.disc, trackTitle: video ? chapter.title : track.title, matched: !!item };
    })));
  }

  async function scan(path: string) {
    if (!path.trim()) return;
    setError(''); setBusy(true); setFolder(path);
    try {
      const scanned = await invoke<ScannedFile[]>('local_files_scan', { folder: path });
      setFiles(scanned); propose(scanned);
      if (!scanned.length) setError('这个文件夹里没有找到支持的音视频文件。');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!trackTitles.size || !files.length) return;
    setRows(current => current.map(row => {
      if (row.copyId) {
        const existing = items.find(entry => entry.id === row.copyId);
        if (!existing || existing.edition.categoryId !== 'music' || row.trackTitle) return row;
        const track = trackFor(row.copyId, row.file);
        return { ...row, track: track.number, disc: track.disc, trackTitle: track.title };
      }
      const item = chooseItem(items, row.file, false, trackTitles);
      if (!item) return row;
      return {
        ...row,
        copyId: item.id,
        matched: true,
        episode: item.edition.categoryId === 'video' ? parseEpisode(row.file.name) : null,
        track: item.edition.categoryId === 'music' ? trackFor(item.id, row.file).number : null,
        disc: item.edition.categoryId === 'music' ? trackFor(item.id, row.file).disc : null,
        trackTitle: item.edition.categoryId === 'music' ? trackFor(item.id, row.file).title : '',
      };
    }).sort((left, right) => {
      if (!left.copyId || !right.copyId) return left.copyId ? -1 : right.copyId ? 1 : 0;
      const album = items.findIndex(item => item.id === left.copyId) - items.findIndex(item => item.id === right.copyId);
      return album || (left.track || left.episode || Number.MAX_SAFE_INTEGER) - (right.track || right.episode || Number.MAX_SAFE_INTEGER);
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
        label: `${item?.edition.title || row.file.name}${row.disc ? ` · ${row.disc}` : ''}${row.episode ? ` · 第 ${row.episode} 章${row.trackTitle ? ` · ${row.trackTitle}` : ''}` : row.track ? ` · 第 ${row.track} 轨${row.trackTitle ? ` · ${row.trackTitle}` : ''}` : ''}`,
        episode: row.episode,
        track: row.track,
        disc: row.disc,
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
      setError(errorMessage(cause));
    } finally { setBusy(false); }
  }

  function trackTitleValue(row: Row) {
    const albumTracks = trackTitles.get(row.copyId) || [];
    const index = albumTracks.findIndex(track => track.title === row.trackTitle && (!row.disc || track.disc === row.disc));
    const fallback = albumTracks.findIndex(track => track.title === row.trackTitle);
    return index >= 0 ? String(index) : fallback >= 0 ? String(fallback) : '';
  }

  function updateTrackTitle(index: number, value: string) {
    setRows(current => sortRows(current.map((row, position) => {
      if (position !== index || !row.copyId) return row;
      const albumTracks = trackTitles.get(row.copyId) || [];
      const track = Number(value);
      if (!Number.isInteger(track) || track < 0 || !albumTracks[track]) return { ...row, trackTitle: '' };
      const video = items.find(item => item.id === row.copyId)?.edition.categoryId === 'video';
      return {
        ...row,
        trackTitle: albumTracks[track].title,
        disc: video ? null : albumTracks[track].disc || null,
        episode: video ? albumTracks[track].number ?? null : row.episode,
        track: video ? null : albumTracks[track].number ?? null,
      };
    })));
  }

  function updateRow(index: number, copyId: string) {
    setRows(current => sortRows(current.map((row, position) => {
      if (position !== index) return row;
      const category = items.find(item => item.id === copyId)?.edition.categoryId || '';
      const video = category === 'video';
      const chapter = video ? chapterFor(copyId, row.file) : { number: null, title: '' };
      return {
        ...row,
        copyId,
        matched: !!copyId,
        episode: video ? parseEpisode(row.file.name) || chapter.number : null,
        track: category === 'music' ? trackFor(copyId, row.file).number : null,
        disc: category === 'music' ? trackFor(copyId, row.file).disc : null,
        trackTitle: video ? chapter.title : category === 'music' ? trackFor(copyId, row.file).title : '',
      };
    })));
  }

  function autoAssociate() {
    setRows(current => sortRows(current.map(row => {
      if (row.copyId) return row;
      const item = chooseItem(items, row.file, true, trackTitles);
      if (!item) return row;
      const video = item.edition.categoryId === 'video';
      const chapter = video ? chapterFor(item.id, row.file) : { number: null, title: '' };
      return {
        ...row,
        copyId: item.id,
        matched: true,
        episode: video ? parseEpisode(row.file.name) || chapter.number : null,
        track: item.edition.categoryId === 'music' ? trackFor(item.id, row.file).number : null,
        disc: item.edition.categoryId === 'music' ? trackFor(item.id, row.file).disc : null,
        trackTitle: video ? chapter.title : item.edition.categoryId === 'music' ? trackFor(item.id, row.file).title : '',
      };
    })));
  }

  function forget() {
    setBindings([]);
    void invoke('local_files_save', { bindings: [] }).catch(cause => setError(errorMessage(cause)));
  }

  const bound = useMemo(() => new Set(bindings.map(binding => binding.path)), [bindings]);
  const matchedCount = rows.filter(row => row.copyId).length;

  return <Modal title="本地文件" onClose={onClose} wide busy={busy} className="local-files-panel">
    <div className="local-files-settings">
      <p className="setting-hint">选择收藏所在的文件夹，自动扫描子目录并匹配到音乐或影片。匹配结果会保存为这台电脑上的本地关联。</p>
      <FolderPicker value={folder} onChange={setFolder} busy={busy}
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
          <thead><tr><th>文件</th><th>收藏条目</th><th>歌曲 / 章节</th><th>章节 / 轨</th><th>状态</th></tr></thead>
          <tbody>
            {rows.map((row, index) => {
              const item = items.find(entry => entry.id === row.copyId);
              const saved = bound.has(row.file.path);
              const associated = !!item && (item.edition.categoryId === 'video'
                ? row.episode != null || !!row.trackTitle
                : row.track != null || !!row.trackTitle);
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
                <td>{item && (trackTitles.get(row.copyId) || []).length
                  ? <Select label={`${row.file.name} 的关联内容`}
                    value={trackTitleValue(row)}
                    options={[{ id: '', label: '不指定' }, ...(trackTitles.get(row.copyId) || []).map((track, trackIndex) => ({ id: String(trackIndex), label: `${track.disc ? `${track.disc} · ` : ''}${track.label || track.title}` }))]}
                    onChange={value => updateTrackTitle(index, value)}/>
                  : <span className="local-track-title" title={row.trackTitle || undefined}>{row.trackTitle || (row.episode ? `第 ${row.episode} 章` : item?.edition.categoryId === 'video' ? '未匹配到章节' : '—')}</span>}</td>
                <td>{row.episode ? `第 ${row.episode} 章` : row.track ? `${row.disc ? `${row.disc} · ` : ''}第 ${row.track} 轨` : '—'}</td>
                <td>{saved && associated ? <button type="button" className="text-button" disabled={busy} onClick={() => void saveAndPlay(row)}>播放</button> : item && associated ? <span className="local-files-ok">已识别</span> : <span className="local-files-miss">未关联</span>}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="settings-actions">
        <span className="setting-hint">识别依据：文件夹名、标题、作者和文件名；S01E01、第 01 集及开头的 01/02/03 会识别为章节或轨号。</span>
        <button type="button" className="solid-button" disabled={busy || !matchedCount} onClick={() => void save().then(() => { setError(''); onClose(); }).catch(cause => setError(errorMessage(cause)))}>保存关联</button>
      </div>
    </>}
  </Modal>;
}
