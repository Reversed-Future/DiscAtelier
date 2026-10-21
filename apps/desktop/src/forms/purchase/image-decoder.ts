export interface ImageReadOptions { signal?: AbortSignal; onProgress?(message: string): void }
interface DecodedImage { source: CanvasImageSource; width: number; height: number; close(): void }

// Every browser read has a deadline and a cancellation path; late results are discarded.
export function boundedRead<T>(start: (resolve: (value: T) => void, reject: (error: Error) => void) => (() => void),
  signal: AbortSignal | undefined, message: string, timeout = 12000, discard?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Error('已取消图片读取，可以重新选择')); return; }
    let settled = false;
    let cleanup = () => {};
    const finish = (value?: T, error?: Error) => {
      if (settled) { if (!error && value !== undefined) discard?.(value); return; }
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); cleanup();
      if (error) reject(error); else resolve(value as T);
    };
    const abort = () => finish(undefined, Error('已取消图片读取，可以重新选择'));
    const timer = setTimeout(() => finish(undefined, Error(message)), timeout);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      cleanup = start(value => finish(value), error => finish(undefined, error));
      if (settled) cleanup();
    } catch (error) { finish(undefined, error instanceof Error ? error : Error('图片读取失败')); }
  });
}

function readDataUrl(file: File, signal?: AbortSignal): Promise<string> {
  return boundedRead((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(Error('图片文件没有可读取内容'));
    reader.onerror = () => reject(Error('无法读取所选图片，请先保存到手机本地后重选'));
    reader.onabort = () => reject(Error('图片读取已中止，请重新选择'));
    reader.readAsDataURL(file);
    return () => { reader.onload = null; reader.onerror = null; reader.onabort = null; if (reader.readyState === FileReader.LOADING) reader.abort(); };
  }, signal, '读取图片超时，请先保存到手机本地，或换一张较小的截图');
}

export async function decodePurchaseImage(file: File, options: ImageReadOptions = {}): Promise<DecodedImage> {
  options.onProgress?.('读取图片文件…');
  const url = await readDataUrl(file, options.signal);
  options.onProgress?.('解码图片…');
  try {
    const image = await boundedRead<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.naturalWidth && image.naturalHeight ? resolve(image) : reject(Error('图片尺寸无效'));
      image.onerror = () => reject(Error('图片解码失败'));
      image.src = url;
      return () => { image.onload = null; image.onerror = null; if (!image.complete) image.removeAttribute('src'); };
    }, options.signal, '图片解码超时');
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => image.removeAttribute('src') };
  } catch (error) {
    if (options.signal?.aborted || typeof createImageBitmap !== 'function') throw error;
    options.onProgress?.('正在尝试备用解码…');
    const bitmap = await boundedRead<ImageBitmap>((resolve, reject) => {
      void createImageBitmap(file).then(resolve, reject);
      return () => {};
    }, options.signal, '图片解码未完成，请换一张较小的 PNG 或 JPEG 截图', 10000, bitmap => bitmap.close());
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
}
