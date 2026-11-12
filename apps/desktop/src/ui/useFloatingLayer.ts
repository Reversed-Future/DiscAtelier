import { useEffect, useState } from 'react';

// Native dialogs occupy the top layer. Floating controls follow the visible
// dialog while their controllers remain mounted at the application root.
export function useFloatingLayer(preferredSelector?: string) {
  const [host, setHost] = useState<HTMLElement>(document.body);
  useEffect(() => {
    const update = () => {
      const preferred = preferredSelector
        ? document.querySelector<HTMLDialogElement>(preferredSelector)
        : null;
      const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
      setHost(preferred || dialogs.at(-1) || document.body);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    const frame = requestAnimationFrame(update);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [preferredSelector]);
  return host;
}
