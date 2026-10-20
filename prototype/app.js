import { selectItems, totals, formatAmount, createDemoItem } from './domain.js';
import { element, renderCard, renderDetail } from './render.js';
import { wireDialogs, openDialog, closeDialog } from './dialogs.js';

const $ = selector => document.querySelector(selector);
const response = await fetch('/collection.json');
const items = await response.json();
const state = { section: 'music', query: '', status: 'all', sort: 'original', view: 'shelf' };
const labels = { music: '音乐', video: '影像', wanted: '想购入', transit: '在途', history: '播放历史' };
wireDialogs();

function showDetail(item) {
  renderDetail(item, $('#detail'), () => closeDialog($('#detail-dialog')));
  openDialog($('#detail-dialog'));
}

function render() {
  $('#page-title').textContent = labels[state.section];
  const result = selectItems(items, state);
  const sectionItems = selectItems(items, { section: state.section });
  const summary = totals(sectionItems);
  $('#total').textContent = summary.count;
  $('#cost').textContent = Object.entries(summary.amounts).map(([currency, amount]) => formatAmount(amount, currency)).join(' / ') || '—';
  $('#cost-label').textContent = summary.unknown ? `购入金额 · ${summary.unknown} 套未填写` : '购入金额';
  $('#result-count').textContent = `${result.length} 项`;
  $('#music-count').textContent = items.filter(item => item.category === 'music').length;
  $('#video-count').textContent = items.filter(item => item.category === 'video').length;
  const host = $('#collection');
  host.replaceChildren();
  host.className = `collection ${state.view}`;
  if (!result.length) {
    const empty = element('div', 'empty');
    empty.append(element('div', 'empty-disc', '◉'), element('h2', '', state.section === 'history' ? '还没有播放记录' : state.query ? '没有匹配的收藏' : '还没有收藏'));
    const action = element('button', 'primary', state.query ? '清除搜索' : '添加收藏');
    action.addEventListener('click', () => {
      if (state.query) { state.query = ''; $('#search').value = ''; render(); } else openAdd();
    });
    if (state.section !== 'history') empty.append(action);
    host.append(empty);
  } else result.forEach((item, index) => host.append(renderCard(item, showDetail, index)));
  document.querySelectorAll('[data-section]').forEach(button => button.classList.toggle('active', button.dataset.section === state.section));
}

function openAdd() {
  $('#add-form').reset();
  $('#form-error').textContent = '';
  $('#add-note').textContent = '仅添加到本次演示，刷新后恢复。';
  if (state.section === 'video') $('#add-form').elements.category.value = 'video';
  if (['wanted', 'transit'].includes(state.section)) $('#add-form').elements.status.value = state.section;
  openDialog($('#add-dialog'));
}

document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => {
  state.section = button.dataset.section;
  state.status = 'all';
  $('#status').value = 'all';
  state.query = '';
  $('#search').value = '';
  render();
}));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  state.view = button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(other => {
    other.classList.toggle('selected', other === button);
    other.setAttribute('aria-pressed', String(other === button));
  });
  render();
}));
$('#search').addEventListener('input', event => { state.query = event.target.value; render(); });
$('#status').addEventListener('change', event => { state.status = event.target.value; render(); });
$('#sort').addEventListener('change', event => { state.sort = event.target.value; render(); });
$('#add').addEventListener('click', openAdd);
$('#online-add').addEventListener('click', () => { $('#add-note').textContent = 'Discogs 条码与品番检索计划在 0.2 接入；当前可使用手动演示。'; });
$('#add-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const input = Object.fromEntries(new FormData(event.target));
    const item = createDemoItem(input, crypto.randomUUID());
    items.push(item);
    state.section = item.category;
    state.status = 'all';
    state.query = '';
    $('#status').value = 'all';
    $('#search').value = '';
    await closeDialog($('#add-dialog'));
    render();
  } catch (error) { $('#form-error').textContent = error.message; }
});

const info = {
  drive: ['光驱', '桌面版在 0.4 接入 Windows 光驱检测。当前原型不会读取设备，也不会模拟已插入光盘。', [['识别', '启动扫描 · 介质变化 · 多设备'], ['绑定', '盘片指纹 → 实物副本'], ['播放', '按实际后端能力提供']]],
  assistant: ['助手', '计划在 0.6 接入。采用 agent harness：工具调用、权限校验、执行记录和中断恢复。', [['模型', '可配置 API 与模型'], ['工具', '检索 · 资料查询 · 收藏操作'], ['写入', '幂等执行 · 差异预览 · 撤销']]],
  settings: ['设置', '当前为不持久化的界面设计预览。桌面版设置将管理资料来源、播放后端、备份和更新。', [['资料', 'Discogs · 网易云 · 视频接口'], ['模型', 'AtelierPublisher .ateliermodel'], ['更新', 'GitHub 私有发布 · 签名验证']]]
};
document.querySelectorAll('[data-info]').forEach(button => button.addEventListener('click', () => {
  const [title, description, rows] = info[button.dataset.info];
  $('#info-title').textContent = title;
  $('#info-body').replaceChildren(element('p', 'info-description', description));
  const list = element('dl', 'metadata');
  rows.forEach(([label, value]) => list.append(element('dt', '', label), element('dd', '', value)));
  $('#info-body').append(list);
  openDialog($('#info-dialog'));
}));
document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('#search').focus(); }
});
render();
