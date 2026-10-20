import { parseModel } from '../../../../packages/atelier-model-runtime';
self.onmessage = async ({ data }: MessageEvent<string | { url: string; mode: 'load' | 'validate' }>) => {
  try {
    if (typeof data === 'string') self.postMessage({ model: parseModel(data) });
    else {
      const response = await fetch(data.url, { cache: 'no-store' });
      if (!response.ok) throw Error(data.mode === 'load' ? '无法读取模型，请重新打开。' : '模型预览已过期，请重新选择文件。');
      const model = parseModel(await response.text());
      self.postMessage(data.mode === 'load' ? { model } : { validated: true });
    }
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : '模型校验失败。' }); }
};
