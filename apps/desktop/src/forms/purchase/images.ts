export interface PurchaseImage { id: string; name: string; dataUrl: string }
export const MAX_IMAGES = 6;

export async function readPurchaseImage(file: File): Promise<PurchaseImage> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('请选择 PNG、JPEG 或 WebP 截图');
  if (!file.size || file.size > 12 * 1024 * 1024) throw Error('单张原图不能超过 12 MB，请裁剪后上传');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 32_000_000) throw Error('截图尺寸过大，请裁成多张后上传');
    const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw Error('无法读取截图');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // Re-encoding removes file metadata; no path or original filename is sent to AI.
    const dataUrl = canvas.toDataURL('image/jpeg', .92);
    if (dataUrl.length > 7 * 1024 * 1024) throw Error('截图内容过大，请裁剪后上传');
    return { id: crypto.randomUUID(), name: file.name || '粘贴截图', dataUrl };
  } finally { bitmap.close(); }
}
