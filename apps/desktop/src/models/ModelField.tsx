import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { prepareModelPreview } from './prepare-preview';
import { type ModelChange, type ModelPreparation } from './assets';
import { measureAsync } from './timing';
import { errorMessage } from '../library/gateway';
import { ModelUploadPreview } from './ModelUploadPreview';

export function ModelField({ value, title, assetId, actionsHost, onChange, onBusy, disabled }: {
  value: ModelChange; title?: string | null; assetId?: string | null; onChange(value: ModelChange): void;
  actionsHost: HTMLElement | null;
  onBusy(value: boolean): void; disabled: boolean;
}) {
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const pending = useRef(false);
  const shownTitle = value.action === 'prepared' ? value.title : value.action === 'keep' ? title || (assetId ? '已保存模型' : null) : null;
  async function choose(paths?: string[]) {
    if (disabled || pending.current) return;
    if (paths && paths.length !== 1) { setError('请一次拖入一个模型文件。'); return; }
    pending.current = true;
    setReading(true); onBusy(true); setError('');
    let prepared: ModelPreparation | null = null;
    try {
      prepared = await measureAsync('native_prepare', () => paths
        ? invoke<ModelPreparation>('model_drop', { path: paths[0] })
        : invoke<ModelPreparation | null>('model_choose'));
      if (!prepared) return;
      prepared = await measureAsync('worker_validate', () => prepareModelPreview(prepared!));
      onChange({ action: 'prepared', token: prepared.token, title: prepared.title });
      prepared = null; // The parent form now owns this preparation.
    } catch (cause) { setError(errorMessage(cause)); }
    finally {
      if (prepared) void invoke('model_release', { token: prepared.token }).catch(() => {});
      pending.current = false; setReading(false); onBusy(false);
    }
  }
  return <section className="model-field" aria-label="模型文件">
    {shownTitle && actionsHost && createPortal(<>
      <button type="button" className="solid-button model-action-button" disabled={disabled || reading} onClick={() => { onChange({ action: 'remove' }); setError(''); }}>移除模型</button>
      <button type="button" className="solid-button model-action-button" title={shownTitle} disabled={disabled || reading} onClick={() => void choose()}>{reading ? '读取模型中' : '更换模型'}</button>
    </>, actionsHost)}
    <ModelUploadPreview value={value} assetId={assetId} disabled={disabled || reading}
      onChoose={() => void choose()} onDrop={paths => void choose(paths)} onError={cause => setError(errorMessage(cause))}/>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
