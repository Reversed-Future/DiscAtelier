export async function readCover(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('封面支持 PNG、JPEG 和 WebP');
  if (!file.size || file.size > 8_388_608) throw Error('封面不能超过 8 MB');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('无法读取封面文件'));
    reader.readAsDataURL(file);
  });
}
