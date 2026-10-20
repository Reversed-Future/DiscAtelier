import { useEffect } from 'react';

/** Small overflows remain scrollable without adding a visible scrollbar. */
export function useScrollbars() {
  useEffect(() => {
    const watched = new Set<HTMLElement>();
    let frame = 0;
    function schedule() { if (!frame) frame = requestAnimationFrame(measure); }
    const resize = new ResizeObserver(schedule);
    function measure() {
      frame = 0;
      const nodes = new Set([document.documentElement, ...document.querySelectorAll<HTMLElement>(
        '.panel-dialog, .inspection-dialog, .organizer, .backup-list, .select-list, #tools-popover, textarea',
      )]);
      for (const node of watched) if (!nodes.has(node)) { resize.unobserve(node); watched.delete(node); }
      for (const node of nodes) {
        if (!watched.has(node)) { watched.add(node); resize.observe(node); }
        const longY = node.clientHeight > 0 && node.scrollHeight - node.clientHeight > Math.max(320, node.clientHeight);
        const longX = node.clientWidth > 0 && node.scrollWidth - node.clientWidth > Math.max(320, node.clientWidth);
        node.toggleAttribute('data-long-scroll', longY || longX);
      }
    }
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('input', schedule);
    document.addEventListener('toggle', schedule, true);
    schedule();
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect();
      window.removeEventListener('resize', schedule); document.removeEventListener('input', schedule);
      document.removeEventListener('toggle', schedule, true);
    };
  }, []);
}
