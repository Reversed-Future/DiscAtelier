import { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { errorMessage } from '../library/gateway';
import { optical, type KeydbProgress, type KeydbStatus, type PlaybackSettings as Settings } from './gateway';

const initial: Settings = {
  mpvExecutable: '',
  makeMkvLibrary: '',
  vlcLibrary: '',
  makeMkvFallback: true,
};

let cachedSettings: Settings | null = null;
let cachedKeydb: KeydbStatus | null = null;
function sameSettings(left: Settings, right: Settings) {
  return left.mpvExecutable === right.mpvExecutable
    && left.makeMkvLibrary === right.makeMkvLibrary
    && left.vlcLibrary === right.vlcLibrary
    && left.makeMkvFallback === right.makeMkvFallback;
}
function sameKeydb(left: KeydbStatus | null, right: KeydbStatus | null) {
  return left === right || (!!left && !!right
    && left.configured === right.configured
    && left.bytes === right.bytes
    && left.entries === right.entries
    && left.updatedAt === right.updatedAt
    && left.sources.length === right.sources.length
    && left.sources.every((source, index) => source === right.sources[index]));
}

const keydbSourceLabels: Record<string, string> = { japanese: '日语', english: '英语', manual: '本地导入' };

function keydbSources(status: KeydbStatus | null) {
  if (!status?.sources.length) return '来源未知';
  return status.sources.map(source => keydbSourceLabels[source] || source).join('、');
}

async function base64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function PlaybackSettings({ onBusy }: { onBusy(value: boolean): void }) {
  const [value, setValue] = useState<Settings>(() => cachedSettings || initial);
  const [keydb, setKeydb] = useState<KeydbStatus | null>(cachedKeydb);
  const [checking, setChecking] = useState(!cachedKeydb);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<KeydbProgress | null>(null);
  const [keyMessage, setKeyMessage] = useState('');
  const keyFile = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    Promise.all([optical.settings(), optical.keydbStatus()])
      .then(([settings, status]) => {
        if (!active) return;
        cachedSettings = settings;
        if (!sameSettings(value, settings)) setValue(settings);
        const changed = !sameKeydb(cachedKeydb, status);
        cachedKeydb = status;
        if (changed) setKeydb(status);
        setChecking(false);
      })
      .catch(cause => { if (active) { setChecking(false); setError(errorMessage(cause)); } })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  function change<K extends keyof Settings>(key: K, next: Settings[K]) {
    setValue(current => ({ ...current, [key]: next })); setSaved(false);
  }
  async function choosePath(key: 'mpvExecutable' | 'makeMkvLibrary' | 'vlcLibrary', title: string, extensions: string[]) {
    if (busy) return;
    try {
      const selected = await open({ multiple: false, directory: false, title, filters: [{ name: title, extensions }] });
      if (typeof selected === 'string') change(key, selected);
    } catch (cause) { setError(errorMessage(cause)); }
  }
  async function downloadKeydb() {
    if (busy) return;
    setBusy(true); onBusy(true); setError(''); setSaved(false); setKeyMessage(''); setDownloadProgress(null); setDownloading(true);
    try {
      const result = await optical.downloadKeydb(setDownloadProgress);
      cachedKeydb = result.status;
      if (!sameKeydb(keydb, result.status)) setKeydb(result.status);
      const source = result.englishSupplemented ? '日语优先，英语补齐' : '日语（英语源暂不可用）';
      setKeyMessage(`${result.replacedExisting ? '已更新' : '已下载'} KEYDB.cfg · ${source}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false); onBusy(false); setDownloading(false);
    }
  }
  async function importKeydb(file: File) {
    if (busy) return;
    if (file.size > 8 * 1024 * 1024) { setError('KEYDB.cfg 超过 8 MiB 限制。'); return; }
    setBusy(true); onBusy(true); setError(''); setSaved(false); setKeyMessage('');
    try {
      const result = await optical.importKeydb(await base64(file));
      cachedKeydb = result.status;
      if (!sameKeydb(keydb, result.status)) setKeydb(result.status);
      setKeyMessage(result.replacedExisting ? '已更新，旧密钥文件已备份' : '已导入');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false); onBusy(false);
    }
  }
  return <form onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); onBusy(true); setError(''); setSaved(false);
    try { await optical.saveSettings(value); cachedSettings = value; setSaved(true); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); onBusy(false); }
  }}>
    <div className="setting-row bluray-key-row">
      <span>蓝光密钥文件</span>
      <span className="bluray-key-actions">
        <button type="button" className="text-button" disabled={busy} onClick={() => keyFile.current?.click()}>
          {checking ? '检查中…' : keydb?.configured ? '已配置 · 更换' : '导入 KEYDB.cfg'}
        </button>
        <button type="button" className="text-button" disabled={busy} title="默认日语，英语补齐缺失条目" onClick={() => void downloadKeydb()}>
          {downloading ? '下载中…' : keydb?.configured ? '从 FindVUK 更新' : '从 FindVUK 自动下载'}
        </button>
      </span>
    </div>
    <p className="setting-hint">
      {checking && !keydb ? '检查中…' : keydb?.configured ? `已配置 · ${keydb.entries} 个条目` : '未配置，本地 libaacs 只能读取未加密或已缓存的蓝光。'}
      {' '}自动下载默认使用日语版，并用英语版补齐缺失条目；也可导入本地文件。文件安全复制到应用数据目录，不会修改原文件，也不会把密钥写入日志或发行包。
    </p>
    {keydb?.configured && <p className="setting-hint bluray-key-sources">
      已下载：{keydbSources(keydb)}
      {keydb.updatedAt ? ` · ${new Date(keydb.updatedAt).toLocaleString('zh-CN')}` : ''}
    </p>}
    {downloading && <div className="bluray-download" role="progressbar" aria-label="KEYDB.cfg 下载进度"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={downloadProgress?.percent ?? undefined}>
      <div className="bluray-download-line">
        <span>{downloadProgress?.message || '正在准备下载…'}</span>
        {downloadProgress?.percent != null && <span>{downloadProgress.percent}%</span>}
      </div>
      <div className="bluray-download-track" data-indeterminate={downloadProgress?.percent == null}>
        <span style={downloadProgress?.percent != null ? { width: `${downloadProgress.percent}%` } : undefined}/>
      </div>
    </div>}
    <input ref={keyFile} type="file" accept=".cfg,.txt,text/plain" hidden aria-label="选择 KEYDB.cfg"
      onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) await importKeydb(file); }}/>
    {keyMessage && <p className="setting-hint bluray-key-message" role="status">{keyMessage}</p>}
    <div className="make-mkv-row">
      <label>MakeMKV<div className="path-input"><input value={value.makeMkvLibrary} onChange={event => change('makeMkvLibrary', event.target.value)} disabled={busy} spellCheck={false} placeholder="libmmbd64.dll 完整路径；可留空"/><button type="button" className="text-button" disabled={busy} onClick={() => void choosePath('makeMkvLibrary', '选择 MakeMKV 兼容库', ['dll'])}>浏览</button></div></label>
      <label className="bluray-fallback">
        <input type="checkbox" checked={value.makeMkvFallback} disabled={busy} onChange={event => change('makeMkvFallback', event.target.checked)}/>
        <span>兼容兜底</span>
      </label>
    </div>
    <p className="setting-hint">仅在 libaacs 确认属于解密能力不足时自动尝试，不启动独立 MakeMKV 实例；普通读盘错误、光盘取出或停止播放不会触发。</p>
    <label>MPV<div className="path-input"><input value={value.mpvExecutable} onChange={event => change('mpvExecutable', event.target.value)} disabled={busy} spellCheck={false} placeholder="mpv.exe 完整路径；留空自动检测"/><button type="button" className="text-button" disabled={busy} onClick={() => void choosePath('mpvExecutable', '选择 mpv.exe', ['exe'])}>浏览</button></div></label>
    <label>VLC · CD / DVD / Blu-ray<div className="path-input"><input value={value.vlcLibrary} onChange={event => change('vlcLibrary', event.target.value)} disabled={busy} spellCheck={false} placeholder="留空使用内置 VLC；也可填写 libvlc.dll 完整路径"/><button type="button" className="text-button" disabled={busy} onClick={() => void choosePath('vlcLibrary', '选择 libvlc.dll', ['dll'])}>浏览</button></div></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer className="settings-actions"><button className="solid-button" disabled={busy}>{saved ? '已保存' : busy ? '读取中' : '保存'}</button></footer>
  </form>;
}
