import {parseSourceModel, sourceFormat} from './shared/source-model.js';
import {validateModelPackage} from './shared/interactive-model.js';

export const modelFileLimit = 50 * 1024 * 1024;
export function parseModel(text) {
  if (typeof text !== 'string' || text.length > 72 * 1024 * 1024) throw Error('模型数据过大。');
  let value; try { value = JSON.parse(text); } catch { throw Error('模型文件不是有效的 JSON。'); }
  if (value.format === sourceFormat) return parseSourceModel(value);
  if (new TextEncoder().encode(text).length > modelFileLimit) throw Error('模型文件不能超过 50 MiB。');
  const model = validateModelPackage(value);
  if (![2,3,4].includes(model.version)) throw Error('请在 AtelierPublisher 中导出 v2、v3 或 v4 .ateliermodel 文件。');
  return model;
}
export async function mountModel(...args) {
  const {mountModel: mount} = await import('./src/discs/interactive/mount-model.js');
  return mount(...args);
}
