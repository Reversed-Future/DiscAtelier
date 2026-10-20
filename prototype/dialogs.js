const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const running = new WeakMap();

export function openDialog(dialog) {
  const computed = getComputedStyle(dialog);
  const start = dialog.open ? { opacity: computed.opacity, transform: computed.transform } : { opacity: 0, transform: 'translateY(12px) scale(.98)' };
  running.get(dialog)?.cancel();
  dialog.dataset.closing = 'false';
  if (!dialog.open) dialog.showModal();
  if (!reduced()) running.set(dialog, dialog.animate([start, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 230, easing: 'cubic-bezier(.23,1,.32,1)' }));
}

export async function closeDialog(dialog) {
  if (!dialog.open) return;
  dialog.dataset.closing = 'true';
  const computed = getComputedStyle(dialog);
  const start = { opacity: computed.opacity, transform: computed.transform };
  running.get(dialog)?.cancel();
  if (!reduced()) {
    const animation = dialog.animate([start, { opacity: 0, transform: 'translateY(8px) scale(.99)' }], { duration: 130, easing: 'ease-out' });
    running.set(dialog, animation);
    try { await animation.finished; } catch { return; }
  }
  dialog.close();
}

export function wireDialogs() {
  document.addEventListener('keydown', () => { document.documentElement.dataset.keyboard = 'true'; });
  document.addEventListener('pointerdown', () => { document.documentElement.dataset.keyboard = 'false'; });
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(dialog)));
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
    });
  }
}
