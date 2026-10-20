import { el, fillIcons } from './elements.js';
import { renderStore } from './store.js';
import { renderOrganizer } from './organizer.js';
import { createInspection } from './inspection.js';
import { selectItems, totals, formatAmount, createDemoItem } from '../domain.js';
import { openDialog, closeDialog } from '../dialogs.js';
import { enhanceSelects, syncSelects } from './select-control.js';
import { redraw, setVisible } from './motion.js';

const $ = selector => document.querySelector(selector);
fillIcons();
enhanceSelects();
document.addEventListener('keydown', () => { document.documentElement.dataset.keyboard = 'true'; });
document.addEventListener('pointerdown', () => { document.documentElement.dataset.keyboard = 'false'; });
const items = await (await fetch('../collection.json')).json();
const state = { section: 'music', query: '', status: 'all', sort: 'original', organize: false, selectedId: items[0]?.id };
let toastTimeout;
function notify(message) {
  clearTimeout(toastTimeout);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimeout = setTimeout(() => $('#toast').classList.remove('visible'), 2400);
}
const inspection = createInspection({
  changed: render,
  locate: id => document.querySelector(`#scene [data-item="${CSS.escape(id)}"]`),
  notify
});
function render() {
  const visible = selectItems(items, state);
  const summary = totals(visible);
  $('#count').textContent = `${visible.length} 套`;
  $('#amount').textContent = Object.entries(summary.amounts).map(([currency, value]) => formatAmount(value, currency)).join(' / ') || '价格未填写';
  $('#status-filter').value = state.status;
  $('#tools-toggle').classList.toggle('filtered', state.status !== 'all' || state.organize);
  document.querySelectorAll('[data-category]').forEach(button => button.classList.toggle('active', state.section === button.dataset.category));
  $('#organize-label').textContent = state.organize ? '返回收藏' : '整理';
  syncSelects();
  const scene = $('#scene');
  redraw(scene, () => {
  if (!visible.length) {
    const empty = el('div', 'empty-state');
    empty.append(el('span', 'disc-mark'), el('p', '', state.query ? '没有匹配的收藏' : state.status === 'all' ? '还没有收藏' : state.status === 'wanted' ? '还没有想购入的收藏' : '没有在途收藏'));
    const button = el('button', '', state.query ? '清除搜索' : '添加收藏');
    button.addEventListener('click', () => {
      if (state.query) { state.query = ''; $('#search').value = ''; render(); } else openAdd();
    });
    empty.append(button);
    scene.append(empty);
  } else if (state.organize) renderOrganizer(scene, visible, inspection.open);
  else renderStore(scene, visible, { selectedId: state.selectedId, choose: id => { state.selectedId = id; }, open: inspection.open });
  });
}
function openAdd() {
  $('#add-form').reset();
  $('#add-error').textContent = '';
  $('#add-form').elements.category.value = state.section;
  if (state.status !== 'all') $('#add-form').elements.status.value = state.status;
  syncSelects($('#add-form'));
  openDialog($('#add-dialog'));
}
document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
  state.section = button.dataset.category;
  state.query = '';
  $('#search').value = '';
  render();
}));
$('#status-filter').addEventListener('change', event => {
  state.status = event.target.value;
  $('#tools-popover').hidePopover();
  render();
});
function expandSearch() {
  setVisible($('#search'), true);
  $('#search-toggle').setAttribute('aria-expanded', 'true');
  $('#search').focus();
}
function collapseSearch() {
  setVisible($('#search'), false);
  $('#search-toggle').setAttribute('aria-expanded', 'false');
}
$('#search-toggle').addEventListener('click', () => {
  if ($('#search-toggle').getAttribute('aria-expanded') === 'false') expandSearch();
  else if (!state.query) collapseSearch();
  else $('#search').focus();
});
$('#search').addEventListener('input', event => { state.query = event.target.value; render(); });
$('#search').addEventListener('focus', () => {
  if ($('#search-toggle').getAttribute('aria-expanded') === 'false') expandSearch();
});
$('#search').addEventListener('blur', () => { if (!state.query) collapseSearch(); });
$('#search').addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    state.query = '';
    $('#search').value = '';
    collapseSearch();
    $('#search-toggle').focus();
    render();
  }
});
$('#organize').addEventListener('click', () => { state.organize = !state.organize; $('#tools-popover').hidePopover(); render(); });
$('#add').addEventListener('click', openAdd);
$('#add-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const item = createDemoItem(Object.fromEntries(new FormData(event.target)), crypto.randomUUID());
    items.push(item);
    state.section = item.category;
    state.status = 'all';
    state.query = '';
    $('#search').value = '';
    state.selectedId = item.id;
    await closeDialog($('#add-dialog'));
    render();
    notify('已加入本次演示');
  } catch (error) { $('#add-error').textContent = error.message; }
});
for (const dialog of [$('#add-dialog'), $('#utility-dialog')]) {
  dialog.querySelector('[data-close]').addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
}
const utilities = {
  drive: { title: '光驱', description: '当前是浏览器界面原型，未读取本机设备。', rows: [['设备', '未连接设备服务'], ['识别与播放', '待桌面版接入']] },
  assistant: { title: '助手', description: '当前原型未连接模型 API，不会向外发送收藏资料。', rows: [['模型', '未配置'], ['可用范围', 'UI 原型']] }
};
for (const [id, value] of Object.entries(utilities)) {
  $(`#${id}`).addEventListener('click', () => {
    $('#tools-popover').hidePopover();
    $('#utility-title').textContent = value.title;
    $('#utility-body').replaceChildren(el('p', 'utility-copy', value.description));
    value.rows.forEach(([key, text]) => {
      const row = el('div', 'utility-status');
      row.append(el('span', '', key), el('span', '', text));
      $('#utility-body').append(row);
    });
    openDialog($('#utility-dialog'));
  });
}
document.addEventListener('keydown', event => {
  if (event.key === '/' && !document.querySelector('dialog[open]') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) { event.preventDefault(); expandSearch(); }
});
render();
