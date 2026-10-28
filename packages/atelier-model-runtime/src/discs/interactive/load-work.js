/** Give input, navigation and abort handlers a turn between bounded loading jobs. */
export function createLoadBudget(signal, milliseconds = 8) {
 let deadline = performance.now() + milliseconds;
 return async function checkpoint(force = false) {
  signal?.throwIfAborted();
  if (!force && performance.now() < deadline) return;
  if (!force && globalThis.scheduler?.yield) await globalThis.scheduler.yield();
  else await new Promise(resolve => setTimeout(resolve, 0));
  signal?.throwIfAborted();
  deadline = performance.now() + milliseconds;
 };
}

export async function decodeBase64InSlices(value, checkpoint) {
 const size = value.length / 4 * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
 const bytes = new Uint8Array(size);
 for (let offset = 0, written = 0; offset < value.length; offset += 65536) {
  await checkpoint();
  const binary = atob(value.slice(offset, offset + 65536));
  for (let i = 0; i < binary.length; i++) bytes[written++] = binary.charCodeAt(i);
 }
 return bytes;
}

export async function decodeAttributeInSlices(value, type, checkpoint) {
 const integers = type === 'Uint32Array';
 const numbers = integers ? new Uint32Array(Array.isArray(value) ? value.length : value.count) : new Float32Array(Array.isArray(value) ? value.length : value.count);
 const bytes = Array.isArray(value) ? null : await decodeBase64InSlices(value.data, checkpoint);
 const view = bytes && new DataView(bytes.buffer);
 for (let start = 0; start < numbers.length; start += 16384) {
  await checkpoint();
  for (let i = start; i < Math.min(start + 16384, numbers.length); i++) numbers[i] = view ? (integers ? view.getUint32(i * 4, true) : view.getFloat32(i * 4, true)) : value[i];
 }
 return numbers;
}
