import { el, cover } from './elements.js';
import { enter } from './motion.js';

export function renderStore(host, items, { selectedId, choose, open }) {
  let index = Math.max(0, items.findIndex(item => item.id === selectedId));
  const store = el('div', 'record-store');
  const stage = el('div', 'record-stage');
  const title = el('div', 'record-caption');
  let stageButtons = [];
  function update(nextIndex) {
    index = Math.max(0, Math.min(items.length - 1, nextIndex));
    choose(items[index].id);
    stageButtons.forEach((button, itemIndex) => {
      const distance = itemIndex - index;
      button.style.setProperty('--distance', distance);
      button.style.setProperty('--abs-distance', Math.abs(distance));
      button.dataset.current = String(distance === 0);
      button.dataset.offstage = String(Math.abs(distance) > 2);
      button.inert = Math.abs(distance) > 2;
      button.setAttribute('aria-hidden', String(Math.abs(distance) > 2));
      button.tabIndex = distance === 0 ? 0 : -1;
      button.setAttribute('aria-label', distance === 0 ? `取出 ${items[itemIndex].title}` : `选择 ${items[itemIndex].title}`);
    });
    title.replaceChildren();
    const counter = el('span', 'record-counter', `${String(index + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`);
    title.append(counter, el('h1', '', items[index].title), el('p', '', items[index].creator));
    enter(title, 4);
  }
  stageButtons = items.map((item, itemIndex) => {
    const button = el('button', 'record-sleeve');
    button.dataset.item = item.id;
    button.append(cover(item));
    button.addEventListener('click', () => itemIndex === index ? open(item, button) : update(itemIndex));
    stage.append(button);
    return button;
  });
  store.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    update(index + (event.key === 'ArrowRight' ? 1 : -1));
    stageButtons[index].focus();
  });
  let startX;
  stage.addEventListener('pointerdown', event => { startX = event.clientX; });
  stage.addEventListener('pointerup', event => {
    const delta = event.clientX - startX;
    if (Math.abs(delta) > 65) {
      const block = click => { click.preventDefault(); click.stopImmediatePropagation(); };
      stage.addEventListener('click', block, { capture: true, once: true });
      update(index + (delta < 0 ? 1 : -1));
    }
  });
  stage.addEventListener('pointercancel', () => { startX = undefined; });
  store.append(stage, title);
  update(index);
  host.append(store);
}
