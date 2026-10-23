import { useEffect, useRef } from 'react';

/** Native pointer-driven 3D tilt for covers without an authored model.
 * The detail cover is rendered through a React portal, so React bubbling
 * stops at the portal boundary; listeners must be attached to the stage node.
 * The stage is intentionally larger than the cover: moving into the surrounding
 * margin keeps the tilt active, and leaving the stage eases it back. */
export function useCoverTilt(enabled: boolean, surface: HTMLDivElement | null, target: HTMLDivElement | null) {
  const frame = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled || !surface || !target) return;
    let active = false;
    const reset = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      active = false;
      target.style.setProperty('--tilt-duration', '480ms');
      target.style.setProperty('--tilt-x', '0deg');
      target.style.setProperty('--tilt-y', '0deg');
      target.style.setProperty('--tilt-z', '0deg');
      target.style.setProperty('--glare-x', '50%');
      target.style.setProperty('--glare-y', '50%');
    };
    const move = (event: MouseEvent) => {
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      // The stage is only a listener surface; the effective hover halo is a
      // small margin around the cover, not the whole stage.
      const margin = 24;
      const inside = event.clientX >= rect.left - margin && event.clientX <= rect.right + margin
        && event.clientY >= rect.top - margin && event.clientY <= rect.bottom + margin;
      if (!inside) {
        if (active) reset();
        return;
      }
      const first = !active;
      active = true;
      const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        // Entering the halo uses the same slow easing as leaving it.
        target.style.setProperty('--tilt-duration', first ? '480ms' : '150ms');
        target.style.setProperty('--tilt-x', `${(-y * 8).toFixed(2)}deg`);
        target.style.setProperty('--tilt-y', `${(x * 12).toFixed(2)}deg`);
        target.style.setProperty('--tilt-z', `${(x * 1.5).toFixed(2)}deg`);
        target.style.setProperty('--glare-x', `${50 + x * 34}%`);
        target.style.setProperty('--glare-y', `${50 + y * 34}%`);
      });
    };
    surface.addEventListener('mousemove', move);
    surface.addEventListener('mouseleave', reset);
    return () => {
      surface.removeEventListener('mousemove', move);
      surface.removeEventListener('mouseleave', reset);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [enabled, surface, target]);
  return enabled;
}
