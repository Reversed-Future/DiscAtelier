import { useEffect, useRef, useState } from 'react';
import { allProfiles, profileState, useEqualizer } from './equalizer';

export function EqualizerQuick({ onEdit }: { onEdit(): void }) {
  const { state, busy, save } = useEqualizer();
  const wrapper = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  function close(focus = false) {
    list.current?.hidePopover();
    setOpen(false);
    if (focus) trigger.current?.focus();
  }
  function show() {
    if (!state || !list.current || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.max(300, rect.width);
    list.current.style.width = `${width}px`;
    list.current.style.left = `${Math.min(rect.left, innerWidth - width - 8)}px`;
    list.current.showPopover();
    const height = list.current.getBoundingClientRect().height;
    list.current.style.top = `${Math.max(8, rect.top - height - 8)}px`;
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) close(); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(true); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key, true); };
  }, [open]);
  if (!state) return null;
  const active = state.enabled ? allProfiles(state).find(profile => profile.id === state.activeProfile) : null;
  return <span className="equalizer-quick" ref={wrapper}>
    <button ref={trigger} type="button" className="player-icon-button equalizer-trigger" aria-label="均衡器" title="均衡器"
      aria-expanded={open} onClick={() => open ? close(true) : show()}><span>EQ</span></button>
    <div ref={list} popover="manual" className="equalizer-quick-popover" role="dialog" aria-label="均衡器快速切换">
      <header><strong>均衡器</strong><button type="button" className="text-button" onClick={() => { close(); onEdit(); }}>进入编辑界面</button></header>
      <p className="setting-hint">{active ? `${active.name} · 已启用` : '当前已关闭'}</p>
      <div className="equalizer-quick-grid">
        <button type="button" className="equalizer-quick-option" aria-pressed={!state.enabled}
          onClick={() => { close(true); void save({ ...state, enabled: false }); }}>关闭 EQ</button>
        {allProfiles(state).map(profile => <button type="button" key={profile.id}
          className="equalizer-quick-option" aria-pressed={state.enabled && state.activeProfile === profile.id}
          disabled={busy} onClick={() => { close(true); void save(profileState(state, profile.id)); }}>{profile.name}</button>)}
      </div>
    </div>
  </span>;
}
