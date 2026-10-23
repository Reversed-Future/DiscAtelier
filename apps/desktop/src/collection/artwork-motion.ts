import { reduced } from '../ui/motion';

/** Opening motion; the list-mode fade-out stays in step with it. */
export const ARTWORK_MOTION_DURATION = 280;
export const ARTWORK_MOTION_EASING = 'cubic-bezier(.23,1,.32,1)';

/** One live object; a new destination starts at its current on-screen rectangle. */
export function createArtworkMotion() {
  let animation: Animation | undefined;
  let generation = 0;
  return {
    cancel() { generation++; animation?.cancel(); animation = undefined; },
    async move(node: HTMLElement, from: DOMRect, to: DOMRect, hold = false) {
      const version = ++generation;
      animation?.cancel();
      if (reduced() || !from.width || !to.width) return;
      const resting = node.getBoundingClientRect();
      const transform = (rect: DOMRect) => `translate(${rect.left - resting.left}px, ${rect.top - resting.top}px) scale(${rect.width / resting.width}, ${rect.height / resting.height})`;
      animation = node.animate([{ transform: transform(from) }, { transform: transform(to) }],
        { duration: hold ? 260 : ARTWORK_MOTION_DURATION, easing: ARTWORK_MOTION_EASING, fill: 'both' });
      try { await animation.finished; } catch {}
      if (generation === version && !hold) { animation?.cancel(); animation = undefined; }
    },
  };
}
