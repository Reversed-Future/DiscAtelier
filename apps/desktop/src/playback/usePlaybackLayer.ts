import { useEffect, useState } from 'react';

// Native modal dialogs occupy the top layer: the dock must live inside the
// visible dialog to stay clickable. Queue/playback state stays at the app root.
export function usePlaybackLayer() {
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
