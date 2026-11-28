import { useState } from 'react';
import { videoImageUrl, type VideoCharacter } from './gateway';

export function CharacterPortrait({ character, emptyLabel = '暂无图片' }: { character: VideoCharacter; emptyLabel?: string }) {
  const { avatar, portraitUrl, name } = character;
  const src = avatar?.startsWith('data:image/') ? avatar : videoImageUrl(portraitUrl || '');
  return src ? <PortraitImage key={src} src={src} name={name}/> : <span className="video-character-no-image">{emptyLabel}</span>;
}

function PortraitImage({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="video-character-no-image">图片暂不可用</span>;
  return <img className="video-character-portrait" src={src} alt={name}
    loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>;
}
