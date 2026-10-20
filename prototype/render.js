import { statuses, formatAmount } from './domain.js';

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function artwork(item) {
  const wrap = element('div', 'artwork');
  if (item.cover) {
    const image = element('img');
    image.src = item.cover;
    image.alt = `${item.title} 封面`;
    image.loading = 'lazy';
    wrap.append(image);
  } else {
    wrap.classList.add('fallback');
    wrap.append(element('small', '', item.category === 'music' ? '音乐' : '影像'), element('strong', '', item.title), element('span', '', item.creator || '—'));
  }
  return wrap;
}

export function renderCard(item, onOpen, index) {
  const card = element('button', 'collection-card');
  card.setAttribute('aria-label', `查看 ${item.title}`);
  const casing = element('div', `case case-${index % 4}`);
  casing.append(artwork(item), element('div', 'spine-title', item.title));
  const caption = element('div', 'caption');
  caption.append(element('strong', '', item.title), element('span', '', item.creator || '—'));
  card.append(casing, caption);
  card.addEventListener('click', () => onOpen(item, card));
  return card;
}

export function renderDetail(item, host, close) {
  host.replaceChildren();
  const visual = element('div', 'detail-visual');
  visual.append(artwork(item));
  const body = element('div', 'detail-body');
  const head = element('div', 'dialog-header');
  const closeButton = element('button', 'icon-button', '×');
  closeButton.setAttribute('aria-label', '关闭');
  closeButton.addEventListener('click', close);
  head.append(element('span', 'eyebrow', item.category === 'music' ? '音乐' : '影像'), closeButton);
  body.append(head, element('h2', '', item.title), element('p', 'creator', item.creator || '—'), element('span', `status-tag ${item.status}`, statuses[item.status]));
  const list = element('dl', 'metadata');
  const fields = [
    ['发行版本', '未登记'], ['载体', '未登记'], ['收藏时间', '未登记'],
    ['购入价格', item.amountMinor === null ? '未填写' : formatAmount(item.amountMinor, item.currency)],
    ['购入位置', item.seller || '未填写'], ['模型来源', item.modelReference || '无模型']
  ];
  for (const [label, value] of fields) list.append(element('dt', '', label), element('dd', '', value));
  body.append(list, element('p', 'inline-note', item.modelReference ? '当前展示模型包的封面。三维检视计划在 0.3 接入。' : '当前使用默认封面样式。'));
  host.append(visual, body);
}
