import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { mountModel, type ModelHandle } from '../../../../packages/atelier-model-runtime';
import { readModelWorker } from './worker-client';
import type { ModelPreparation } from './assets';

// Decode and render before accepting a source model. Never keep a hidden canvas alive.
export async function prepareModelPreview(prepared: ModelPreparation): Promise<ModelPreparation> {
  const model = await readModelWorker({ url: convertFileSrc(prepared.token, 'prepared-model'), mode: 'prepare' });
  if (!model || model.version !== 1) return prepared;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:384px;height:384px;pointer-events:none';
  document.body.append(host);
  const controller = new AbortController();
  let handle: ModelHandle | undefined;
  const timeout = window.setTimeout(() => controller.abort(Error('模型读取超时，请检查资源或简化模型。')), 60000);
  try {
    handle = await mountModel(host, model, { signal: controller.signal, interactive: false });
    const { blob } = await handle.capturePreview();
    const cover = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error('无法生成模型预览。')); reader.readAsDataURL(blob);
    });
    const next = await invoke<ModelPreparation>('model_source_preview', { token: prepared.token, cover });
    await invoke('model_release', { token: prepared.token });
    return next;
  } finally {
    window.clearTimeout(timeout); controller.abort(); handle?.dispose(); host.remove();
  }
}
