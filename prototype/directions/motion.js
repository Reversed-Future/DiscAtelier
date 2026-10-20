import { shouldAnimate } from './elements.js';

const ease = 'cubic-bezier(.23,1,.32,1)';
const visibility = new WeakMap();
const entrances = new WeakMap();
const tabChanges = new WeakMap();

export function enter(node, distance = 6) {
  entrances.get(node)?.cancel();
  if (!shouldAnimate()) return;
  entrances.set(node, node.animate([
    { opacity: 0, transform: `translateY(${distance}px)` },
    { opacity: 1, transform: 'translateY(0)' }
  ], { duration: 200, easing: ease }));
}

export async function setVisible(node, visible) {
  const previous = visibility.get(node);
  const style = getComputedStyle(node);
  const start = node.hidden ? { opacity: 0, transform: 'translateY(-4px)' } : { opacity: style.opacity, transform: style.transform };
  previous?.cancel();
  if (!visible && node.hidden) return;
  node.hidden = false;
  if (!shouldAnimate()) { node.hidden = !visible; return; }
  const animation = node.animate([start, {
    opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(-4px)'
  }], { duration: visible ? 180 : 120, easing: ease });
  visibility.set(node, animation);
  try { await animation.finished; } catch { return; }
  node.hidden = !visible;
  visibility.delete(node);
}

export function redraw(host, draw) {
  host.querySelector(':scope > .scene-outgoing')?.remove();
  const old = host.firstElementChild;
  if (!shouldAnimate() || !old) { host.replaceChildren(); draw(); return; }
  // Keep the previous view for its exit, but remove its identifiers and focus targets.
  const outgoing = document.createElement('div');
  outgoing.className = 'scene-outgoing';
  outgoing.inert = true;
  outgoing.setAttribute('aria-hidden', 'true');
  outgoing.append(old);
  old.querySelectorAll('[data-item]').forEach(node => node.removeAttribute('data-item'));
  host.replaceChildren();
  draw();
  const current = host.firstElementChild;
  host.append(outgoing);
  const animation = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
  animation.finished.finally(() => outgoing.remove()).catch(() => {});
  if (current) enter(current);
}

export async function switchTab(nodes, selected) {
  const parent = selected.parentElement;
  const version = Symbol();
  tabChanges.set(parent, version);
  const previous = nodes.find(node => !node.hidden && node !== selected);
  if (previous && shouldAnimate() && parent.checkVisibility()) {
    entrances.get(previous)?.cancel();
    const animation = previous.animate([{ opacity: getComputedStyle(previous).opacity }, { opacity: 0 }], { duration: 80 });
    entrances.set(previous, animation);
    try { await animation.finished; } catch {}
  }
  if (tabChanges.get(parent) !== version) return;
  nodes.forEach(node => { node.hidden = node !== selected; });
  enter(selected);
}
