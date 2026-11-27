import { useLayoutEffect, useRef } from 'react';
import type { CaptionAppearance } from '../playback/captionAppearance';

export function CaptionPreview({ value, bilingual }: { value: CaptionAppearance; bilingual: boolean }) {
  const preview = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = preview.current!, picture = stage.current!;
    function fit() {
      const width = picture.offsetWidth;
      if (!width) return;
      const scale = Math.min(1, frame.clientWidth / width);
      frame.style.height = `${picture.offsetHeight * scale}px`;
      picture.style.transform = `translateX(-50%) scale(${scale})`;
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    observer.observe(picture);
    return () => observer.disconnect();
  }, []);
  return <div className="caption-preview" aria-label="字幕效果预览" ref={preview}>
    <div className="caption-preview-picture" ref={stage}>
      <div className="caption-preview-safe-area">
        <div className="caption-preview-text" style={{
          top: `${value.verticalPosition}%`, transform: `translate(-50%, -${value.verticalPosition}%)`,
          backgroundColor: `rgb(0 0 0 / ${value.backgroundOpacity}%)`, fontSize: value.fontSize,
        }}>
          <span>Listen to the rain.</span>{bilingual && <span>听，外面在下雨。</span>}
        </div>
      </div>
    </div>
  </div>;
}
