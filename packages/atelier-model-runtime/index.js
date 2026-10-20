import {parseModelPackage} from './shared/interactive-model.js';

export const modelFileLimit = 50 * 1024 * 1024;
export function parseModel(text) {
  const model = parseModelPackage(text);
  if (model.version !== 2) throw Error('请在 AtelierPublisher 中导出 v2 .ateliermodel 文件。');
  return model;
}
export async function mountModel(...args) {
  const {mountModel: mount} = await import('./src/discs/interactive/mount-model.js');
  return mount(...args);
}
