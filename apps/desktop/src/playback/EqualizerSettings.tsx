import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { errorMessage } from '../library/gateway';
import { Select } from '../ui/Select';
import SquishSwitch from '../ui/SquishSwitch';
import {
  EQ_BANDS, EQ_MAX, EQ_MIN, activeProfile, allProfiles, defaultEqualizer, profileState, useEqualizer,
  type EqualizerState,
} from './equalizer';

const label = (frequency: number) => frequency >= 1000 ? `${frequency / 1000}k` : `${frequency}`;
const clamp = (value: number) => Math.max(EQ_MIN, Math.min(EQ_MAX, Math.round(value * 2) / 2));

export function EqualizerSettings() {
  const { state, busy, error, save } = useEqualizer();
  const [draft, setDraft] = useState<EqualizerState>(() => state || defaultEqualizer());
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [levels, setLevels] = useState<number[]>(() => EQ_BANDS.map(() => 0));
  const ready = useRef(false);
  useEffect(() => {
    if (state) { setDraft(state); ready.current = true; }
  }, [state]);
  useEffect(() => {
    let live = true;
    void invoke('spectrum_start').catch(() => {});
    const subscription = listen<{ levels: number[] }>('equalizer-spectrum', event => {
      if (live) setLevels(EQ_BANDS.map((_, index) => event.payload.levels[index] || 0));
    }).catch(() => undefined);
    return () => {
      live = false;
      void invoke('spectrum_stop').catch(() => {});
      void subscription.then(stop => stop?.()).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!ready.current || !state || JSON.stringify(draft) === JSON.stringify(state)) return;
    const timer = setTimeout(() => { void save(draft).catch(() => {}); }, 180);
    return () => clearTimeout(timer);
  }, [draft, state, save]);
  const profile = useMemo(() => activeProfile(draft), [draft]);
  const custom = draft.profiles.find(value => value.id === draft.activeProfile);
  const update = (next: EqualizerState) => { setDraft(next); setMessage(''); };
  const setBand = (index: number, value: number) => update({
    ...draft,
    bands: draft.bands.map((band, at) => at === index ? clamp(value) : band),
  });
  async function persist(next: EqualizerState) {
    try { await save(next); setMessage('已保存并应用'); }
    catch (cause) { setMessage(errorMessage(cause)); }
  }
  async function saveCustom() {
    const title = name.trim();
    if (!title) { setMessage('请填写配置名称。'); return; }
    const id = `custom:${crypto.randomUUID()}`;
    const next: EqualizerState = {
      ...draft,
      enabled: true,
      activeProfile: id,
      profiles: [...draft.profiles, { id, name: title.slice(0, 40), preamp: draft.preamp, bands: [...draft.bands] }],
    };
    setName('');
    await persist(next);
  }
  return <section className="equalizer-settings">
    <div className="video-section-heading"><h3>均衡器 · VLC</h3></div>
    <p className="setting-hint">作用于本地音乐、CD、网易云和本地视频。光盘播放使用 MPV，暂不应用 EQ。</p>
    <div className="setting-row"><span>启用均衡器</span>
      <SquishSwitch checked={draft.enabled} disabled={busy} onChange={enabled => update({ ...draft, enabled })}
        ariaLabel="启用均衡器" width={36} height={20} radius={0} trackColor="#27272a" trackOnColor="#f5f5f5" colorDuration={220}/>
    </div>
    <div className="equalizer-toolbar">
      <label>配置
        <Select label="均衡器配置" value={draft.activeProfile} disabled={busy}
          options={allProfiles(draft).map(value => ({ id: value.id, label: value.name }))}
          onChange={id => update(profileState(draft, id))}/>
      </label>
      <label>前级
        <input type="range" min={EQ_MIN} max={EQ_MAX} step={0.5} value={draft.preamp} disabled={busy}
          onChange={event => update({ ...draft, preamp: clamp(Number(event.target.value)) })}/>
        <span>{draft.preamp > 0 ? '+' : ''}{draft.preamp.toFixed(1)} dB</span>
      </label>
    </div>
    <div className="equalizer-bands">
      {EQ_BANDS.map((frequency, index) => <label key={frequency}>
        <span>{label(frequency)}</span>
        <span className="equalizer-meter" aria-hidden="true"><i style={{ height: `${Math.round((levels[index] ?? 0) * 100)}%` }}/></span>
        <input type="range" min={EQ_MIN} max={EQ_MAX} step={0.5} value={draft.bands[index] ?? 0} disabled={busy}
          aria-label={`${label(frequency)} Hz`}
          onChange={event => setBand(index, Number(event.target.value))}/>
        <output>{(draft.bands[index] ?? 0) > 0 ? '+' : ''}{(draft.bands[index] ?? 0).toFixed(1)}</output>
      </label>)}
    </div>
    <div className="equalizer-actions">
      <input value={name} maxLength={40} disabled={busy} placeholder="新配置名称"
        onChange={event => setName(event.target.value)}/>
      <button type="button" className="text-button" disabled={busy} onClick={() => void saveCustom()}>另存为自定义</button>
      {custom && <button type="button" className="text-button" disabled={busy} onClick={() => void persist({
        ...draft,
        profiles: draft.profiles.map(value => value.id === custom.id ? { ...value, name: custom.name, preamp: draft.preamp, bands: [...draft.bands] } : value),
      })}>覆盖当前配置</button>}
      {custom && <button type="button" className="text-button" disabled={busy} onClick={() => void persist({
        ...draft, activeProfile: 'flat', preamp: 0, bands: EQ_BANDS.map(() => 0), profiles: draft.profiles.filter(value => value.id !== custom.id),
      })}>删除当前配置</button>}
      <button type="button" className="solid-button" disabled={busy} onClick={() => void persist(draft)}>保存并应用</button>
    </div>
    {(message || error) && <p className={message.startsWith('已') ? 'setting-hint' : 'form-error'} role="status">{message || error}</p>}
    <p className="setting-hint">{profile.name} · 当前值 {draft.enabled ? '已启用' : '已关闭'}</p>
  </section>;
}
