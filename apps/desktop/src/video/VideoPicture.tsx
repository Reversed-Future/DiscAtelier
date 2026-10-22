import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { videoImageUrl } from './gateway';

export function VideoPicture({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = videoImageUrl(src);
  return url && !failed ? <img className={className} src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <span className={`video-picture-missing ${className}`}>图片暂不可用</span>;
}
export function VideoPictureViewer({ url, title, onClose }: { url: string; title: string; onClose(): void }) {
  return <Modal title={title} onClose={onClose} wide className="video-picture-dialog"><VideoPicture key={url} src={url} alt={title}/></Modal>;
}
