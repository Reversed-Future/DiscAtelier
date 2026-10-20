import { el } from './elements.js';

const controls = new Map();
let sequence = 0;
let active;

export function syncSelects(root = document) {
  for (const [select, control] of controls) if (root.contains(select)) control.sync();
}

export function enhanceSelects(root = document) {
  root.querySelectorAll('select').forEach(select => {
    if (controls.has(select)) return;
    const label = select.getAttribute('aria-label') || [...select.closest('label').childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
    const wrapper = el('span', 'select-control');
    const trigger = el('button', 'select-trigger');
    const caption = el('span');
    const list = el('div', 'select-list');
    list.id = `select-list-${++sequence}`;
    list.setAttribute('popover', 'manual');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', label);
    trigger.type = 'button';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-label', label);
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-controls', list.id);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.append(caption);
    select.before(wrapper);
    select.hidden = true;
    wrapper.append(select, trigger, list);
    const options = [...select.options].map(option => {
      const button = el('button', 'select-option', option.textContent);
      button.type = 'button';
      button.tabIndex = -1;
      button.disabled = option.disabled;
      button.setAttribute('role', 'option');
      button.addEventListener('click', event => {
        event.preventDefault();
        select.value = option.value;
        sync();
        close(true);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      list.append(button);
      return button;
    });
    function sync() {
      caption.textContent = select.selectedOptions[0]?.textContent || '';
      options.forEach((button, index) => button.setAttribute('aria-selected', String(index === select.selectedIndex)));
    }
    function close(focus = false) {
      if (list.matches(':popover-open')) list.hidePopover();
      trigger.setAttribute('aria-expanded', 'false');
      if (active?.list === list) active = undefined;
      if (focus) trigger.focus({ preventScroll: true });
    }
    function open() {
      active?.close();
      const rect = trigger.getBoundingClientRect();
      list.style.width = `${Math.max(rect.width, 110)}px`;
      list.style.left = `${Math.min(rect.left, innerWidth - Math.max(rect.width, 110) - 8)}px`;
      list.showPopover();
      const height = list.getBoundingClientRect().height;
      list.style.top = `${rect.bottom + height + 8 > innerHeight ? Math.max(8, rect.top - height - 5) : rect.bottom + 5}px`;
      trigger.setAttribute('aria-expanded', 'true');
      active = { list, wrapper, close };
      options[select.selectedIndex]?.focus({ preventScroll: true });
    }
    trigger.addEventListener('click', event => {
      event.preventDefault();
      list.matches(':popover-open') ? close(true) : open();
    });
    trigger.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); open(); }
    });
    list.addEventListener('keydown', event => {
      if (event.key === 'Tab') { close(true); return; }
      const index = options.indexOf(document.activeElement);
      const next = { ArrowDown: Math.min(options.length - 1, index + 1), ArrowUp: Math.max(0, index - 1), Home: 0, End: options.length - 1 };
      if (Object.hasOwn(next, event.key)) { event.preventDefault(); options[next[event.key]]?.focus(); }
    });
    controls.set(select, { sync });
    select.addEventListener('change', sync);
    const parentPopover = wrapper.closest('[popover]');
    parentPopover?.addEventListener('beforetoggle', event => { if (event.newState === 'closed') close(); });
    select.closest('dialog')?.addEventListener('close', () => close());
    sync();
  });
}
document.addEventListener('pointerdown', event => {
  if (active && !active.wrapper.contains(event.target)) active.close();
});
document.addEventListener('keydown', event => {
  if (active && event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    active.close(true);
  }
}, true);
window.addEventListener('resize', () => active?.close());
document.addEventListener('scroll', event => {
  if (active && event.target !== active.list) active.close();
}, true);
