import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingLayer } from './useFloatingLayer';
import { errorMessage } from '../library/gateway';
import { getContextActions, type ContextAction } from './contextActions';
import { textContextActions } from './textContextActions';
import './context-menu.css';

export function ContextMenu({ actions, onError }: { actions?(target: Element): ContextAction[]; onError(message: string): void }) {
  const host = useFloatingLayer(), menu = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ x: number; y: number; items: ContextAction[]; focus: HTMLElement | null; target: Element } | null>(null);
  const latest = useRef(actions); latest.current = actions;
  function close(restore = false) {
    menu.current?.hidePopover();
    if (restore && state?.focus?.isConnected) state.focus.focus({ preventScroll: true });
    setState(null);
  }
  useEffect(() => {
    const open = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      const target = event.target;
      if (menu.current?.contains(target)) { event.preventDefault(); return; }
      const items = textContextActions(target, event);
      const contextual = target.closest('input, textarea') ? [] : getContextActions(event) ?? latest.current?.(target) ?? [];
      if (items.length && contextual.length) items.push({ ...contextual[0], separator: true }, ...contextual.slice(1));
      else items.push(...contextual);
      if (!items.length) { close(); return; }
      event.preventDefault(); event.stopPropagation();
      const rect = target.getBoundingClientRect();
      setState({ x: event.clientX || rect.left + 12, y: event.clientY || rect.top + 12, items, focus: document.activeElement as HTMLElement, target });
    };
    document.addEventListener('contextmenu', open);
    return () => document.removeEventListener('contextmenu', open);
  }, []);
  useEffect(() => {
    const element = menu.current;
    if (!state || !element) return;
    element.showPopover();
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(state.x, innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(state.y, innerHeight - rect.height - 8))}px`;
    element.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: Event) => { if (!element.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(true); } };
    const resize = () => close();
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('keydown', escape, true); window.removeEventListener('resize', resize); };
  }, [state]);
  return createPortal(<div ref={menu} className="app-context-menu" role="menu" aria-label="快捷操作" popover="manual" onKeyDown={event => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next: Record<string, number> = { ArrowDown: (index + 1) % buttons.length, ArrowUp: (index - 1 + buttons.length) % buttons.length, Home: 0, End: buttons.length - 1 };
    if (event.key in next) { event.preventDefault(); event.stopPropagation(); buttons[next[event.key]]?.focus(); }
    if (event.key === 'Tab') { event.preventDefault(); close(true); }
  }}>{state?.items.map((item, index) => <button type="button" role="menuitem" tabIndex={-1} key={index} data-separator={item.separator} onClick={() => {
    close(true);
    if (state.target.isConnected) void Promise.resolve().then(() => item.run()).catch(cause => onError(errorMessage(cause)));
  }}>{item.label}</button>)}</div>, host);
}
