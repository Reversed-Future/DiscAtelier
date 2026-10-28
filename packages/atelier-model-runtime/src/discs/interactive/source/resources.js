import {LoadingManager} from '../vendor/three.module.js';
import {resourcePath} from '../../../../shared/source-model.js';
import {createLoadBudget,decodeBase64InSlices} from '../load-work.js';

export function sourceResources(model, signal) {
  const files = new Map(model.files.map(file => [file.path, file.content]));
  const decoded = new Map();
  async function prepare() {
    const checkpoint = createLoadBudget(signal);
    await checkpoint(true);
    for (const [path, content] of files) {
      // The original SKP is retained for export; only its converted GLB is rendered.
      if (model.sourceFormat === 'skp' && path === model.main) continue;
      const data = await decodeBase64InSlices(content, checkpoint);
      signal?.throwIfAborted(); decoded.set(path, data);
    }
  }
  const urls = new Map(), owned = new Set(); let resolve, reject, disposed = false;
  const complete = new Promise((yes,no) => {resolve=yes;reject=no;});
  // A loader can fail synchronously before its image requests finish.
  complete.catch(() => {});
  const manager = new LoadingManager(resolve, undefined, url => reject(Error(`贴图读取失败：${url.startsWith('blob:') ? '图片损坏或格式不受支持' : url}`)));
  manager.itemStart('source-parse');
  const abort = () => reject(signal.reason);
  signal?.addEventListener('abort', abort, {once:true});
  function bytes(path) {
    if (decoded.has(resourcePath(path))) return decoded.get(resourcePath(path));
    const value = files.get(resourcePath(path));
    if (value === undefined) throw Error(`缺少关联资源：${path}`);
    return Uint8Array.from(atob(value), ch => ch.charCodeAt(0));
  }
  function text(path) {return new TextDecoder('utf-8',{fatal:true}).decode(bytes(path));}
  manager.setURLModifier(url => {
    if (disposed) throw Error('模型已关闭。');
    if (url.startsWith('blob:')) {owned.add(url);return url;}
    if (/^data:(image\/(png|jpeg|webp|bmp|gif)|application\/octet-stream|application\/gltf-buffer);base64,/.test(url)) return url;
    const path = resourcePath(model.sourceFormat === 'glb' ? decodeURIComponent(url) : url);
    if (!urls.has(path)) {
      const blob = URL.createObjectURL(new Blob([bytes(path)])); urls.set(path,blob);owned.add(blob);
    }
    return urls.get(path);
  });
  // FBX embedded images also register URLs that are not necessarily referenced by a mesh.
  manager.sourceObjectURL = blob => {const url=URL.createObjectURL(blob);owned.add(url);return url;};
  function dispose() {disposed=true;signal?.removeEventListener('abort',abort);for(const url of owned)URL.revokeObjectURL(url);owned.clear();decoded.clear();}
  return {manager,bytes,text,prepare,async finish(){manager.itemEnd('source-parse');await complete;signal?.throwIfAborted();decoded.clear();},dispose};
}
