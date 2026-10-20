import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { validatePreparedModel, type ModelChange, type ModelPreparation } from './assets';
import { measureAsync } from './timing';
import { errorMessage } from '../library/gateway';

export function ModelField({ value, title, onChange, onBusy, disabled }: {
  value: ModelChange; title?: string | null; onChange(value: ModelChange): void;
  onBusy(value: boolean): void; disabled: boolean;
}) {
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const shownTitle = value.action === 'prepared' ? value.title : value.action === 'keep' ? title : null;
  async function choose() {
    if (disabled || reading) return;
    setReading(true); onBusy(true); setError('');
    let prepared: ModelPreparation | null = null;
    try {
      prepared = await measureAsync('native_prepare', () => invoke<ModelPreparation | null>('model_choose'));
      if (!prepared) return;
      await measureAsync('worker_validate', () => validatePreparedModel(prepared!.token));
      onChange({ action: 'prepared', token: prepared.token, title: prepared.title });
      prepared = null; // The parent form now owns this preparation.
    } catch (cause) { setError(errorMessage(cause)); }
    finally {
      if (prepared) void invoke('model_release', { token: prepared.token }).catch(() => {});
      setReading(false); onBusy(false);
    }
  }
  return <div className="model-field">
    <div className="model-file-actions">
      <button type="button" className="text-button" disabled={disabled || reading} onClick={() => void choose()}>
        {reading ? '读取模型中' : shownTitle ? '更换模型' : '上传模型'}
      </button>
      {shownTitle && <><span className="model-file-title" title={shownTitle}>{shownTitle}</span>
        <button type="button" className="text-button" disabled={disabled || reading} onClick={() => { onChange({ action: 'remove' }); setError(''); }}>移除模型</button></>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
