import {parseModelPackage} from './shared/interactive-model.js';

export const modelFileLimit = 50 * 1024 * 1024;
export function parseModel(text) {
  const model = parseModelPackage(text);
  if (![2,3,4].includes(model.version)) throw Error('请在 AtelierPublisher 中导出 v2、v3 或 v4 .ateliermodel 文件。');
  return model;
}
export async function mountModel(...args) {
  const {mountModel: mount} = await import('./src/discs/interactive/mount-model.js');
  return mount(...args);
}
