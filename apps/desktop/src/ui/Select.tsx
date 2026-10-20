import { useEffect, useId, useRef, useState } from 'react';
import type { Descriptor } from '../library/types';

export function Select({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: Descriptor[]; onChange(value: string): void; disabled?: boolean;
}) {
  const id = useId();
  const wrapper = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.findIndex(option => option.id === value);
  function close(focus = false) { list.current?.hidePopover(); setOpen(false); if (focus) trigger.current?.focus(); }
  function show() {
    if (disabled || !list.current || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    list.current.style.width = `${Math.max(110, rect.width)}px`;
    list.current.style.left = `${Math.min(rect.left, innerWidth - Math.max(110, rect.width) - 8)}px`;
    list.current.showPopover();
    const height = list.current.getBoundingClientRect().height;
    list.current.style.top = `${Math.max(8, rect.bottom + height + 8 > innerHeight ? rect.top - height - 5 : rect.bottom + 5)}px`;
    setOpen(true);
    list.current.querySelectorAll<HTMLButtonElement>('button')[Math.max(0, selected)]?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(true); } };
    const resize = () => close();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); window.removeEventListener('resize', resize); };
  }, [open]);
  return <span className="select-control" ref={wrapper}>
    <button type="button" ref={trigger} className="select-trigger" role="combobox" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={id} disabled={disabled}
      onClick={() => open ? close(true) : show()} onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); show(); } }}>
      <span>{options[selected]?.label || ''}</span>
    </button>
    <div ref={list} id={id} popover="manual" role="listbox" aria-label={label} className="select-list" onKeyDown={event => {
      const buttons = [...list.current!.querySelectorAll<HTMLButtonElement>('button')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next: Record<string, number> = { ArrowDown: Math.min(buttons.length - 1, index + 1), ArrowUp: Math.max(0, index - 1), Home: 0, End: buttons.length - 1 };
      if (event.key in next) { event.preventDefault(); buttons[next[event.key]]?.focus(); }
      if (event.key === 'Tab') close(true);
    }}>
      {options.map(option => <button type="button" key={option.id} role="option" tabIndex={-1} aria-selected={option.id === value} className="select-option" onClick={() => { close(true); onChange(option.id); }}>{option.label}</button>)}
    </div>
  </span>;
}
