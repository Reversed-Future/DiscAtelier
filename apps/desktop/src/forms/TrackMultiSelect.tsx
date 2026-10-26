import { useEffect, useId, useRef, useState } from 'react';

export function TrackMultiSelect({ value, options, onChange }: {
  value: string; options: { id: string; label: string }[]; onChange(value: string): void;
}) {
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = value.split(',').map(part => part.trim()).filter(Boolean);
  const label = !selected.length ? '未指定' : selected.includes('All') ? '全部曲目'
    : selected.length === 1 ? options.find(option => option.id === selected[0])?.label || selected[0] : `已选 ${selected.length} 首曲目`;
  function close(focus = false) {
    list.current?.hidePopover(); setOpen(false);
    if (focus) trigger.current?.focus();
  }
  function place() {
    if (!trigger.current || !list.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 280), innerWidth - 16);
    list.current.style.width = `${width}px`;
    list.current.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
    const below = innerHeight - rect.bottom - 13;
    const above = rect.top - 13;
    const down = below >= Math.min(250, above);
    list.current.style.maxHeight = `${Math.max(60, Math.min(250, down ? below : above))}px`;
    list.current.style.top = `${down ? rect.bottom + 5 : Math.max(8, rect.top - list.current.getBoundingClientRect().height - 5)}px`;
  }
  function show() {
    if (!list.current || !trigger.current) return;
    list.current.showPopover();
    place();
    setOpen(true);
    list.current.querySelector<HTMLButtonElement>('[aria-selected="true"], button')?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(true); }
    };
    const scroll = (event: Event) => { if (!list.current?.contains(event.target as Node)) place(); };
    const resize = () => close();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [open]);
  function toggle(key: string) {
    if (key === 'All') { onChange(selected.includes('All') ? '' : 'All'); return; }
    onChange((selected.includes(key) ? selected.filter(item => item !== key) : [...selected.filter(item => item !== 'All'), key]).join(', '));
  }
  const rows = [{ id: 'All', label: '全部曲目' }, ...options];
  return <div className="content-editor-multi-select" ref={wrapper}>
    <button type="button" ref={trigger} className="content-editor-multi-trigger" role="combobox" aria-label="Credits 曲目"
      aria-controls={id} aria-haspopup="listbox" aria-expanded={open} title={label}
      onClick={() => open ? close(true) : show()} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); }
      }}><span>{label}</span><span className="content-editor-multi-arrow"/></button>
    <div ref={list} id={id} popover="manual" className="content-editor-multi-popover" role="listbox" aria-label="选择曲目" aria-multiselectable="true"
      onKeyDown={event => {
        const buttons = [...list.current!.querySelectorAll<HTMLButtonElement>('button')];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown' ? Math.min(buttons.length - 1, at + 1) : event.key === 'ArrowUp' ? Math.max(0, at - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
        if (next !== null) { event.preventDefault(); buttons[next]?.focus(); }
        if (event.key === 'Tab') close(true);
      }}>
      {rows.map(option => <button type="button" key={option.id} className="content-editor-multi-option" role="option" tabIndex={-1}
        aria-selected={selected.includes(option.id)} onClick={() => toggle(option.id)}>
        <span className="content-editor-multi-check" aria-hidden="true">{selected.includes(option.id) ? '✓' : ''}</span><span>{option.label}</span>
      </button>)}
    </div>
  </div>;
}
