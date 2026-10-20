import { el, caseObject } from './elements.js';

export function renderRoom(host, items, { spines, open }) {
  const room = el('div', 'collection-room');
  const rows = [];
  for (let offset = 0; offset < items.length; offset += 4) rows.push(items.slice(offset, offset + 4));
  rows.forEach((rowItems, rowIndex) => {
    const shelf = el('section', 'shelf-row');
    shelf.setAttribute('aria-label', `第 ${rowIndex + 1} 层`);
    shelf.append(el('span', 'shelf-number', String(rowIndex + 1).padStart(2, '0')));
    const objects = el('div', 'shelf-objects');
    rowItems.forEach((item, index) => {
      const button = el('button', 'shelf-object');
      button.dataset.item = item.id;
      button.setAttribute('aria-label', `取出 ${item.title}`);
      const spine = spines || (rowIndex === 0 ? index === 1 || index === 2 : index === 0 || index === 2);
      if (spine) button.classList.add('narrow');
      button.append(caseObject(item, spine));
      const label = el('span', 'shelf-label');
      label.append(el('strong', '', item.title), el('span', '', item.creator));
      button.append(label);
      button.addEventListener('click', () => open(item, button));
      objects.append(button);
    });
    shelf.append(objects, el('div', 'shelf-board'));
    room.append(shelf);
  });
  host.append(room);
}
