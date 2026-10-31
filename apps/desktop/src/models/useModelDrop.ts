import { useEffect, useRef, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

/** Native file drops retain the source path so relative model resources remain readable. */
export function useModelDrop(disabled: boolean, onDrop: (paths: string[]) => void, onError: (cause: unknown) => void) {
  const region = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const latest = useRef({ disabled, onDrop, onError }); latest.current = { disabled, onDrop, onError };
  useEffect(() => {
    let active = true;
    const listener = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (!active) return;
      if (payload.type === 'leave' || latest.current.disabled) { setHovered(false); return; }
      const x = payload.position.x / window.devicePixelRatio, y = payload.position.y / window.devicePixelRatio;
      const target = document.elementFromPoint(x, y);
      const inside = !!target && !!region.current?.contains(target);
      setHovered(payload.type !== 'drop' && inside);
      if (payload.type === 'drop' && inside) latest.current.onDrop(payload.paths);
    });
    void listener.catch(cause => { if (active) latest.current.onError(cause); });
    return () => { active = false; void listener.then(unlisten => unlisten()).catch(() => {}); };
  }, []);
  return { region, hovered: hovered && !disabled };
}
