import { useEffect, useId, useRef, useState } from 'react';
import { dateValue, localDate, monthDays, moveMonth, readDate } from './calendar';
import { enter } from './motion';

export function DatePicker({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => readDate(value) || new Date());
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const [yearStart, setYearStart] = useState(cursor.getFullYear() - 5);
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const today = dateValue(new Date());
  const cursorValue = dateValue(cursor);
  const days = monthDays(cursor);
  function close(focus = false) {
    popup.current?.hidePopover(); setOpen(false);
    if (focus) trigger.current?.focus();
  }
  function show() {
    if (!popup.current || !trigger.current || trigger.current.matches(':disabled')) return;
    const date = readDate(value) || new Date();
    setCursor(date); setMode('days'); setOpen(true);
    const rect = trigger.current.getBoundingClientRect();
    popup.current.showPopover();
    const size = popup.current.getBoundingClientRect();
    const above = rect.bottom + size.height + 8 > innerHeight;
    popup.current.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - size.width - 8))}px`;
    popup.current.style.top = `${Math.max(8, above ? rect.top - size.height - 6 : rect.bottom + 6)}px`;
    popup.current.style.transformOrigin = above ? 'bottom left' : 'top left';
  }
  function choose(date: Date) { onChange(dateValue(date)); close(true); }
  useEffect(() => {
    if (!open) return;
    const selected = mode === 'days' ? `[data-date="${cursorValue}"]` : '[aria-pressed="true"]';
    (grid.current?.querySelector<HTMLButtonElement>(selected) || grid.current?.querySelector<HTMLButtonElement>('button'))?.focus({ preventScroll: true });
  }, [open, cursorValue, mode]);
  useEffect(() => { if (open) enter(grid.current, 0); }, [open, year, month, mode, yearStart]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(true); }
    };
    const resize = () => close();
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !popup.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true);
      document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize);
    };
  }, [open]);
  function shift(offset: number) {
    if (mode === 'years') setYearStart(start => Math.max(1, Math.min(9988, start + offset * 12)));
    else {
      const next = moveMonth(cursor, offset * (mode === 'months' ? 12 : 1));
      if (next.getFullYear() >= 1 && next.getFullYear() <= 9999) setCursor(next);
    }
  }
  return <span className="date-control" ref={root}>
    <button ref={trigger} type="button" className="date-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => open ? close(true) : show()}>
      <span>{value || '选择日期'}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v5m8-5v5M4 11h16"/></svg>
    </button>
    <div id={id} ref={popup} popover="manual" role="dialog" aria-label={label} className="calendar-popover" onKeyDown={event => {
      if (event.key === 'Tab') requestAnimationFrame(() => { if (!root.current?.contains(document.activeElement)) close(); });
    }}>
      <div className="calendar-heading">
        <button type="button" aria-label={mode === 'days' ? '上个月' : '往前翻年'} onClick={() => shift(-1)}>‹</button>
        <div><button type="button" onClick={() => { setYearStart(Math.max(1, Math.min(9988, year - 5))); setMode(mode === 'years' ? 'days' : 'years'); }} aria-label="选择年份">{year} 年</button>
          <button type="button" onClick={() => setMode(mode === 'months' ? 'days' : 'months')} aria-label="选择月份">{month + 1} 月</button></div>
        <button type="button" aria-label={mode === 'days' ? '下个月' : '往后翻年'} onClick={() => shift(1)}>›</button>
      </div>
      <div className="calendar-content" ref={grid}>
        {mode === 'days' ? <>
          <div className="calendar-weekdays" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>{day}</span>)}</div>
          <div className="calendar-days" role="grid" aria-label={`${year} 年 ${month + 1} 月`}>
            {Array.from({ length: 6 }, (_, week) => <div role="row" key={week}>{days.slice(week * 7, week * 7 + 7).map(date => {
              const iso = dateValue(date);
              return <span role="gridcell" key={iso} aria-selected={value === iso}><button type="button" data-date={iso} tabIndex={iso === cursorValue ? 0 : -1}
                aria-label={iso} aria-current={iso === today ? 'date' : undefined} data-outside={date.getMonth() !== month}
                disabled={date.getFullYear() < 1 || date.getFullYear() > 9999}
                onClick={() => choose(date)} onKeyDown={event => {
                  const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -((date.getDay() + 6) % 7), End: 6 - ((date.getDay() + 6) % 7) };
                  let next: Date | undefined;
                  if (event.key in offsets) next = localDate(date.getFullYear(), date.getMonth(), date.getDate() + offsets[event.key]);
                  if (event.key === 'PageUp' || event.key === 'PageDown') next = moveMonth(date, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1));
                  if (next) { event.preventDefault(); if (next.getFullYear() >= 1 && next.getFullYear() <= 9999) setCursor(next); }
                }}>{date.getDate()}</button></span>;
            })}</div>)}
          </div>
        </> : <div className="calendar-options">{Array.from({ length: 12 }, (_, index) => {
          const number = mode === 'years' ? yearStart + index : index + 1;
          return <button type="button" key={number} aria-pressed={number === (mode === 'years' ? year : month + 1)} onClick={() => {
            setCursor(localDate(mode === 'years' ? number : year, mode === 'months' ? number - 1 : month, 1));
            setMode(mode === 'years' ? 'months' : 'days');
          }}>{number}{mode === 'months' ? ' 月' : ''}</button>;
        })}</div>}
      </div>
      <div className="calendar-footer"><button type="button" onClick={() => { onChange(''); close(true); }}>清除</button><button type="button" onClick={() => choose(new Date())}>今天</button></div>
    </div>
  </span>;
}
