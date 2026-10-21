import { useEffect, useState } from 'react';

// Native dialogs occupy the top layer. Floating controls follow the visible
// dialog while their controllers remain mounted at the application root.
export function useFloatingLayer() {
  const [host, setHost] = useState<HTMLElement>(document.body);
  useEffect(() => {
    const update = () => {
      const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
      setHost(dialogs.at(-1) || document.body);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    return () => observer.disconnect();
  }, []);
  return host;
}
