import type { ModelPackage } from '../../../../packages/atelier-model-runtime';

export function readModelWorker(input: string | { url: string; mode: 'load' | 'validate' | 'prepare' }, signal?: AbortSignal): Promise<ModelPackage | undefined> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const worker = new Worker(new URL('./validation.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { finish(); reject(signal?.reason); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<{ model?: ModelPackage; validated?: boolean; error?: string }>) => {
      finish();
      if (data.model || data.validated) resolve(data.model);
      else reject(Error(data.error || '模型校验失败。'));
    };
    worker.onerror = () => { finish(); reject(Error('无法读取模型。')); };
    worker.postMessage(input);
  });
}
