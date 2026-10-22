const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const MAX_COVER_BYTES = 8_388_608;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

/** Reads the actual image container instead of trusting a file extension or browser MIME hint. */
export function coverMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'image/jpeg';
  if (bytes.length >= 12 && startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

export async function readCover(file: File): Promise<string> {
  if (!file.size || file.size > MAX_COVER_BYTES) throw Error('封面不能超过 8 MB');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = coverMime(bytes);
  if (!mime) throw Error('封面支持 PNG、JPEG 和 WebP');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('无法读取封面文件'));
    reader.readAsDataURL(new Blob([bytes], { type: mime }));
  });
}
