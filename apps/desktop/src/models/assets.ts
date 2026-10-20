import { convertFileSrc } from '@tauri-apps/api/core';
import type { ModelPackage } from '../../../../packages/atelier-model-runtime';
import { createModelCache } from './load-cache';
import { readModelWorker } from './worker-client';

export type ModelChange = { action: 'keep' } | { action: 'remove' } | { action: 'prepared'; token: string; title: string };
export const loadModel = createModelCache<ModelPackage>(async (assetId, signal) => {
  const model = await readModelWorker({ url: convertFileSrc(assetId, 'collection-model'), mode: 'load' }, signal);
  if (!model) throw Error('模型校验失败。');
  return model;
});
export function modelChangeRequest(value: ModelChange) {
  return value.action === 'prepared' ? { action: 'prepared' as const, token: value.token } : value;
}
export interface ModelPreparation { token: string; title: string; byteLength: number }
export async function validatePreparedModel(token: string): Promise<void> {
  await readModelWorker({ url: convertFileSrc(token, 'prepared-model'), mode: 'validate' });
}
