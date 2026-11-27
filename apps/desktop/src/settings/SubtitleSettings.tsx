import { Channel, invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { Select } from '../ui/Select';
import { errorMessage } from '../library/gateway';
import { open } from '@tauri-apps/plugin-dialog';

import { CaptionAppearanceSettings } from './CaptionAppearanceSettings';
import type { CaptionAppearance } from '../playback/captionAppearance';
import { ModelDownloadProgress, type ModelProgress } from './ModelDownloadProgress';

interface Preferences { model: string; language: string; bilingual: boolean; appearance: CaptionAppearance; downloadSource: string }
interface Status { preferences: Preferences; models: { id: string; bytes: number }[]; installed: string[] }
const labels: Record<string, string> = { tiny: 'Tiny', base: 'Base', small: 'Small', medium: 'Medium', 'large-v3-turbo': 'Large V3 Turbo', 'large-v3': 'Large V3' };
const parameters: Record<string, string> = { tiny: '3900 万', base: '7400 万', small: '2.44 亿', medium: '7.69 亿', 'large-v3-turbo': '8.09 亿', 'large-v3': '15.5 亿' };
const languages = [{ id: 'ja', label: '日语' }, { id: 'en', label: '英语' }, { id: 'zh', label: '中文' }, { id: 'auto', label: '自动检测' }];

export function SubtitleSettings() {
  const [status, setStatus] = useState<Status>();
  const [draft, setDraft] = useState<Preferences>();
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const alive = useRef(false), downloading = useRef(false);
  useEffect(() => {
    alive.current = true;
    void invoke<Status>('subtitle_settings').then(value => {
      if (alive.current) { setStatus(value); setDraft(value.preferences); }
    }).catch(e => { if (alive.current) setError(errorMessage(e)); });
    return () => { alive.current = false; if (downloading.current) void invoke('subtitle_download_cancel').catch(() => {}); };
  }, []);
  async function download() {
    const model = status?.models.find(m => m.id === draft?.model);
    if (!draft || !model || downloading.current) return;
    setError(''); setMessage(''); downloading.current = true;
    setProgress({ received: 0, total: model.bytes, bytesPerSecond: 0, remainingSeconds: null });
    const events = new Channel<ModelProgress>();
    events.onmessage = value => { if (alive.current) setProgress(value); };
    try {
      await invoke('subtitle_download', { id: draft.model, source: draft.downloadSource, progress: events });
      const updated = await invoke<Status>('subtitle_settings');
      if (alive.current) { setStatus(updated); setMessage('模型已下载并校验。'); }
    } catch (e) { if (alive.current) setError(errorMessage(e)); }
    finally { downloading.current = false; if (alive.current) setProgress(null); }
  }
  async function save() {
    setSaving(true); setError(''); setMessage('');
    try { await invoke('subtitle_settings_save', { preferences: draft }); setMessage('已保存，下次开启字幕时生效。'); }
    catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }
  async function uninstall() {
    if (!draft) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await invoke('subtitle_uninstall', { id: draft.model });
      const updated = await invoke<Status>('subtitle_settings');
      if (alive.current) { setStatus(updated); setMessage(`${labels[draft.model]} 已卸载。`); }
    } catch (e) { if (alive.current) setError(errorMessage(e)); }
    finally { if (alive.current) setSaving(false); }
  }
  async function importModel() {
    if (!draft) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const file = await open({ title: `选择 ggml-${draft.model}.bin`, multiple: false, filters: [{ name: 'Whisper 模型', extensions: ['bin'] }] });
      if (typeof file !== 'string') return;
      await invoke('subtitle_import', { id: draft.model, file });
      const updated = await invoke<Status>('subtitle_settings');
      if (alive.current) { setStatus(updated); setMessage('模型已导入并校验。'); }
    } catch (e) { if (alive.current) setError(errorMessage(e)); }
    finally { if (alive.current) setSaving(false); }
  }
  const busy = saving || progress !== null;
  function change(update: Partial<Preferences>) { setDraft(p => p && ({ ...p, ...update })); setMessage(''); setError(''); }
  return <section><p className="setting-hint">Whisper 在本机识别视频对白。较小的模型占用较少，较大的模型需要更多内存和处理时间。</p>
    {status && draft && <>
      <div className="setting-row"><span>Whisper 模型</span><Select label="Whisper 模型" value={draft.model} disabled={busy} onChange={model => change({ model })}
        options={status.models.map(m => ({ id: m.id, label: `${labels[m.id]} · ${Math.round(m.bytes / 1048576)} MiB${status.installed.includes(m.id) ? ' · 已下载' : ''}` }))}/></div>
      <p className="setting-hint">{labels[draft.model]} 有 {parameters[draft.model]} 个参数。{draft.model === 'base' ? '建议从 Base 开始试听。' : draft.model === 'tiny' ? '适合优先考虑识别速度。' : '请根据这台电脑的实际识别速度选择。'}</p>
      <div className="setting-row"><span>模型下载源</span><Select label="模型下载源" value={draft.downloadSource} disabled={busy}
        options={[{ id: 'hugging-face', label: 'Hugging Face' }, { id: 'hf-mirror', label: 'HF-Mirror' }]} onChange={downloadSource => change({ downloadSource })}/></div>
      {progress && <ModelDownloadProgress progress={progress}/>}
      <div className="settings-actions">
        {status.installed.includes(draft.model)
          ? <button className="text-button" disabled={busy} onClick={() => void uninstall()}>卸载 {labels[draft.model]}</button>
          : <><button className="text-button" disabled={busy} onClick={() => void importModel()}>导入本地模型</button>
            {progress ? <button className="text-button" onClick={() => void invoke('subtitle_download_cancel')}>取消下载</button>
              : <button className="text-button" disabled={busy} onClick={() => void download()}>下载 {labels[draft.model]}</button>}</>}
      </div>
      <div className="setting-row"><span>对白语言</span><Select label="对白语言" value={draft.language} options={languages} disabled={busy} onChange={language => change({ language })}/></div>
      <div className="setting-row"><span>字幕内容</span><Select label="字幕内容" value={draft.bilingual ? 'both' : 'original'} disabled={busy}
        options={[{ id: 'both', label: '原文＋简体中文' }, { id: 'original', label: '仅原文' }]} onChange={v => change({ bilingual: v === 'both' })}/></div>
      <p className="setting-hint">{draft.bilingual ? '开启双语字幕时，识别出的对白文字会发送到“设置 → 助手”中配置的翻译服务。音频在本机处理。' : '仅原文模式在本机完成识别，可离线使用。'}</p>
      <CaptionAppearanceSettings value={draft.appearance} bilingual={draft.bilingual} disabled={busy} onChange={appearance => change({ appearance })}/>
      <footer className="settings-actions">
        <button className="solid-button" disabled={busy} onClick={() => void save()}>保存</button>
      </footer></>}
    {message && <p className="setting-hint" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
