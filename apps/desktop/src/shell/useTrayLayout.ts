import { useEffect, useRef } from 'react';
import { shell } from './gateway';

/** Measure natural content, never the native window's previous viewport height. */
export function useTrayLayout(opening: number) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    let live = true, lastHeight = 0;
    const measure = () => {
      if (!live) return;
      const height = Math.ceil(element.offsetHeight + 2); // panel borders
      if (height === lastHeight) return;
      lastHeight = height;
      void shell.resize(height).catch(() => { lastHeight = 0; });
    };
    const observer = new ResizeObserver(measure);
    // Wait for the actual menu font before the first native presentation.
    // Hidden WebViews may suspend animation frames. Measurement must not wait
    // for a frame, since this report is what permits the first window.show().
    void document.fonts.load('12px MiSans').then(() => document.fonts.ready).then(() => {
      if (live) { observer.observe(element); measure(); }
    }).catch(() => { if (live) { observer.observe(element); measure(); } });
    return () => { live = false; observer.disconnect(); };
  }, [opening]);
  return content;
}
