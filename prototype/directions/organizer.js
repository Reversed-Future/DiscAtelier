import { el, cover } from './elements.js';
import { statuses, formatAmount } from '../domain.js';

export function renderOrganizer(host, items, open) {
  const container = el('div', 'organizer');
  const table = el('table');
  const head = el('thead');
  const row = el('tr');
  ['收藏', '状态', '购入价格', '购入位置'].forEach(label => row.append(el('th', '', label)));
  head.append(row);
  const body = el('tbody');
  items.forEach(item => {
    const tr = el('tr');
    const title = el('td');
    const button = el('button', 'row-title', item.title);
    button.append(el('span', '', item.creator));
    button.addEventListener('click', () => open(item, title));
    title.dataset.item = item.id;
    title.append(cover(item), button);
    tr.append(title, el('td', '', statuses[item.status]), el('td', '', item.amountMinor === null ? '—' : formatAmount(item.amountMinor, item.currency)), el('td', '', item.seller || '—'));
    body.append(tr);
  });
  table.append(head, body);
  container.append(table);
  host.append(container);
}
