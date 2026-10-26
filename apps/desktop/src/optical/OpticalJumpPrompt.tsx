import { useLayoutEffect, useState } from 'react';
import { useFadePresence } from '../ui/useFadePresence';
import type { OpticalPresence } from './gateway';

export function OpticalJumpPrompt({ value, onDismiss, onConfirm }: {
  value: OpticalPresence | null; onDismiss(): void; onConfirm(value: OpticalPresence): void;
}) {
  const [display, setDisplay] = useState(value);
  useLayoutEffect(() => { if (value) setDisplay(value); }, [value]);
  const fade = useFadePresence<HTMLDivElement>(!!value);
  if (!fade.mounted || !display) return null;
  return <div ref={fade.ref} className="optical-jump-prompt fade-notice" data-shown={fade.shown} inert={fade.inert} aria-hidden={fade.inert} role="dialog" aria-label="光驱收藏提示">
    <div><span>光驱中检测到《{display.title}》</span><small>{display.drive} · 是否跳转到对应收藏？</small></div>
    <div className="optical-jump-actions">
      <button type="button" className="text-button" onClick={onDismiss}>否</button>
      <button type="button" className="solid-button" onClick={() => onConfirm(display)}>是</button>
    </div>
  </div>;
}
