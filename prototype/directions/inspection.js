import { el, caseObject, shouldAnimate } from './elements.js';
import { statuses, formatAmount, parseAmount, currencies } from '../domain.js';
import { syncSelects } from './select-control.js';
import { enter, switchTab } from './motion.js';

export function createInspection({ changed, locate, notify }) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#inspection');
  const model = $('#inspection-cover');
  const form = $('#purchase-tab');
  let item;
  let motion;
  let closing = false;
  function showTab(name) {
    switchTab([$('#metadata-tab'), form], name === 'metadata' ? $('#metadata-tab') : form);
    dialog.querySelectorAll('[data-detail-tab]').forEach(button => button.classList.toggle('active', button.dataset.detailTab === name));
  }
  function fill() {
    $('#object-title').textContent = item.title;
    $('#object-creator').textContent = item.creator || '—';
    $('#object-status').textContent = statuses[item.status];
    $('#want-label').textContent = item.status === 'wanted' ? '设为已购入' : '想购入';
    const fields = [
      ['购入价格', item.amountMinor === null ? '' : formatAmount(item.amountMinor, item.currency)],
      ['购入位置', item.seller],
    ];
    $('#metadata').replaceChildren(...fields.filter(([, value]) => value).flatMap(([key, value]) => [el('dt', '', key), el('dd', '', value)]));
    form.elements.amount.value = item.amountMinor === null ? '' : String(item.amountMinor / 10 ** currencies[item.currency]);
    form.elements.currency.value = item.currency;
    form.elements.seller.value = item.seller;
    form.elements.status.value = item.status;
    form.elements.purchaseUrl.value = item.purchaseUrl || '';
    syncSelects(form);
  }
  async function open(value, trigger) {
    item = value;
    closing = false;
    const origin = trigger.querySelector('.physical-case, .cover-art')?.getBoundingClientRect() ?? trigger.getBoundingClientRect();
    motion?.cancel();
    model.classList.remove('side');
    model.replaceChildren(caseObject(item));
    $('#rotate').lastChild.textContent = '侧面';
    fill();
    showTab('metadata');
    $('#purchase-error').textContent = '';
    dialog.showModal();
    dialog.dataset.closing = 'false';
    enter(dialog, 0);
    if (!shouldAnimate()) return;
    const target = model.getBoundingClientRect();
    motion = model.animate([
      { transform: `translate(${origin.left - target.left}px, ${origin.top - target.top}px) scale(${origin.width / target.width}, ${origin.height / target.height})` },
      { transform: 'translate(0, 0) scale(1, 1)' }
    ], { duration: 280, easing: 'cubic-bezier(.23,1,.32,1)' });
    $('.object-info').animate([{ opacity: 0, transform: 'translateX(14px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 230, easing: 'cubic-bezier(.23,1,.32,1)' });
  }
  async function close() {
    if (!dialog.open || closing) return;
    closing = true;
    dialog.dataset.closing = 'true';
    const start = getComputedStyle(model).transform;
    motion?.cancel();
    const trigger = locate(item.id);
    const destination = trigger?.querySelector('.physical-case, .cover-art')?.getBoundingClientRect();
    model.classList.remove('side');
    if (shouldAnimate()) {
      const rect = model.getBoundingClientRect();
      const end = destination && destination.width > 0 ? { transform: `translate(${destination.left - rect.left}px, ${destination.top - rect.top}px) scale(${destination.width / rect.width}, ${destination.height / rect.height})`, opacity: 1 } : { transform: 'scale(.98)', opacity: 0 };
      motion = model.animate([{ transform: start, opacity: 1 }, end], { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' });
      dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, delay: 130, fill: 'forwards' });
      $('.object-info').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }).finished.then(() => {}).catch(() => {});
      try { await motion.finished; } catch {}
    }
    dialog.close();
    dialog.getAnimations().forEach(animation => animation.cancel());
    $('.object-info').getAnimations().forEach(animation => animation.cancel());
    closing = false;
    trigger?.focus({ preventScroll: true });
  }
  $('#put-back').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('#rotate').addEventListener('click', () => {
    model.classList.toggle('side');
    $('#rotate').lastChild.textContent = model.classList.contains('side') ? '正面' : '侧面';
  });
  dialog.querySelectorAll('[data-detail-tab]').forEach(button => button.addEventListener('click', () => showTab(button.dataset.detailTab)));
  $('#want').addEventListener('click', () => {
    item.status = item.status === 'wanted' ? 'owned' : 'wanted';
    fill();
    enter($('#object-status'), 3);
    enter($('#want-label'), 3);
    changed();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const input = Object.fromEntries(new FormData(form));
      const amountMinor = parseAmount(input.amount.trim(), input.currency);
      if (input.purchaseUrl && !['https:', 'http:'].includes(new URL(input.purchaseUrl).protocol)) throw Error('请填写 HTTP 或 HTTPS 链接');
      if (!Object.hasOwn(statuses, input.status)) throw Error('收藏状态无效');
      Object.assign(item, { amountMinor, currency: input.currency, seller: input.seller.trim(), status: input.status, purchaseUrl: input.purchaseUrl });
      $('#purchase-error').textContent = '';
      fill();
      changed();
      showTab('metadata');
      notify('已保存到本次演示');
    } catch (error) { $('#purchase-error').textContent = error.message; }
  });
  return { open, close };
}
