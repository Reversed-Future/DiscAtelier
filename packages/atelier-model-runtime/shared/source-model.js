export const sourceFormat = 'discatelier-source-model';
export function resourcePath(path) {
  if (typeof path !== 'string' || !path || path.length > 1024 || /^[\\/]/.test(path) || /[:\0?#]/.test(path)) throw Error(`资源路径无效：${path}`);
  const parts = path.replaceAll('\\', '/').split('/').filter(p => p && p !== '.');
  if (!parts.length || parts.includes('..')) throw Error(`资源不能引用模型目录外的位置：${path}`);
  return parts.join('/');
}
export function parseSourceModel(model) {
  if (model.format !== sourceFormat || model.version !== 1 || !['glb','obj','fbx','skp'].includes(model.sourceFormat)) throw Error('原格式模型记录无效。');
  if (typeof model.title !== 'string' || !model.title.trim() || model.title.length > 600 || !/^data:image\/(png|webp);base64,/.test(model.cover)) throw Error('模型标题或预览无效。');
  if (!Array.isArray(model.files) || !model.files.length || model.files.length > 256) throw Error('模型资源数量无效。');
  const paths = new Set(); let bytes = 0;
  for (const file of model.files) {
    if (resourcePath(file.path) !== file.path || paths.has(file.path)) throw Error('模型资源路径重复或无效。');
    if (typeof file.content !== 'string' || (file.content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.content))) throw Error('模型资源编码无效。');
    paths.add(file.path); bytes += file.content.length / 4 * 3 - (file.content.endsWith('==') ? 2 : file.content.endsWith('=') ? 1 : 0);
  }
  if (!paths.has(model.main) || bytes > 50 * 1024 * 1024) throw Error('模型缺少主文件或资源合计超过 50 MiB。');
  if (model.sourceFormat === 'skp' && !paths.has('__discatelier/sketchup.glb')) throw Error('SKP 缺少显示资源，请在应用中重新导入原文件。');
  return model;
}
