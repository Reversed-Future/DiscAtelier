export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = 'cubic-bezier(.23,1,.32,1)';
const entering = new WeakMap<HTMLElement, Animation>();
export function enter(node: HTMLElement | null, distance = 6) {
  if (!node || reduced()) return;
  entering.get(node)?.cancel();
  const frames = distance === 0 ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateY(${distance}px)` }, { opacity: 1, transform: 'translateY(0)' }];
  const animation = node.animate(frames, { duration: 180, easing: ease });
  entering.set(node, animation);
  return animation;
}
export async function leave(node: HTMLElement | null) {
  if (!node || reduced()) return;
  const computed = getComputedStyle(node);
  const start = { opacity: computed.opacity, transform: computed.transform };
  node.getAnimations().forEach(animation => animation.cancel());
  try {
    await node.animate([start, { opacity: 0, transform: 'translateY(5px)' }], { duration: 120, easing: ease, fill: 'forwards' }).finished;
  } catch {}
}
