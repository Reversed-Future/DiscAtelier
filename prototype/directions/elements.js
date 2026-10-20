export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const paths = {
  more: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M3 6h.1M3 12h.1M3 18h.1"/>',
  spines: '<path d="M4 4v16M9 4v16M14 4v16M18 4l3 15"/>',
  drive: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6 14h12M17 9h.1"/>',
  spark: '<path d="M12 3 14.5 9.5 21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  previous: '<path d="m15 5-7 7 7 7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>',
  heart: '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-4 4 0 9 8 15 8-6 12-11 8-15Z"/>'
};
export function icon(name) {
  const span = el('span', 'icon');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  return span;
}
export function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(host => host.replaceChildren(icon(host.dataset.icon)));
}
export function cover(item) {
  const node = el('div', 'cover-art');
  if (item.cover) {
    const img = el('img');
    img.src = item.cover;
    img.alt = `${item.title} 封面`;
    img.draggable = false;
    node.append(img);
  } else {
    node.classList.add('empty-cover');
    node.append(el('span', '', item.category === 'music' ? 'MUSIC' : 'FILM'), el('strong', '', item.title), el('small', '', item.creator || '—'));
  }
  return node;
}
export function caseObject(item, isSpine = false) {
  const object = el('div', `physical-case${isSpine ? ' spine-case' : ''}`);
  object.append(cover(item));
  const edge = el('div', 'case-edge');
  edge.append(el('span', '', item.title), el('small', '', item.creator));
  object.append(edge);
  return object;
}
export const shouldAnimate = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
