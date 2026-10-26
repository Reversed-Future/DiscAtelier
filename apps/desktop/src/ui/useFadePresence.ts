import { useLayoutEffect, useRef, useState } from 'react';

/** Retain a notice through its exit transition; reopening cancels removal. */
export function useFadePresence<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => {
    if (open && !mounted) { setMounted(true); return; }
    const node = ref.current;
    if (!node) return;
    if (open) {
      let second = 0;
      const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setShown(true)); });
      return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
    }
    setShown(false);
    const finish = () => setMounted(false);
    const ended = (event: TransitionEvent) => {
      if (event.target === node && event.propertyName === 'opacity') finish();
    };
    node.addEventListener('transitionend', ended);
    // Also finish when interrupted before the first frame or transitions are disabled.
    const duration = parseFloat(getComputedStyle(node).transitionDuration) * 1000 || 0;
    const timer = setTimeout(finish, duration + 50);
    return () => { clearTimeout(timer); node.removeEventListener('transitionend', ended); };
  }, [open, mounted]);
  return { ref, mounted, shown, inert: !open };
}
