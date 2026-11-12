import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const EQ_BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
export const EQ_MIN = -12;
export const EQ_MAX = 12;

export interface EqualizerProfile {
  id: string;
  name: string;
  preamp: number;
  bands: number[];
}
export interface EqualizerState {
  version: number;
  enabled: boolean;
  activeProfile: string;
  preamp: number;
  bands: number[];
  profiles: EqualizerProfile[];
}

const zeros = () => EQ_BANDS.map(() => 0);
export const BUILTIN_PROFILES: EqualizerProfile[] = [
  { id: 'flat', name: '平直', preamp: 0, bands: zeros() },
  { id: 'pop', name: '流行', preamp: 0, bands: [-1, 0, 1, 2, 2, 1, 0, -1, -1, -2] },
  { id: 'rock', name: '摇滚', preamp: 0, bands: [3, 2, 1, 0, -1, 0, 1, 2, 3, 3] },
  { id: 'jazz', name: '爵士', preamp: 0, bands: [2, 1, 0, 1, 2, 2, 0, 1, 2, 3] },
  { id: 'classical', name: '古典', preamp: 0, bands: [3, 2, 1, 0, 0, 0, -1, -2, -2, -3] },
  { id: 'vocal', name: '人声', preamp: 0, bands: [-2, -1, 0, 1, 3, 3, 2, 1, 0, -1] },
  { id: 'bass', name: '低音增强', preamp: 0, bands: [5, 4, 3, 1, 0, 0, 0, 0, 0, 0] },
  { id: 'treble', name: '高音增强', preamp: 0, bands: [0, 0, 0, 0, 0, 1, 2, 4, 5, 5] },
];

export const defaultEqualizer = (): EqualizerState => ({
  version: 1,
  enabled: false,
  activeProfile: 'flat',
  preamp: 0,
  bands: zeros(),
  profiles: [],
});

export function allProfiles(state: EqualizerState) {
  return [...BUILTIN_PROFILES, ...state.profiles];
}
export function activeProfile(state: EqualizerState) {
  return allProfiles(state).find(profile => profile.id === state.activeProfile)
    || BUILTIN_PROFILES[0];
}
export function profileState(state: EqualizerState, id: string, enabled = true): EqualizerState {
  const profile = allProfiles(state).find(value => value.id === id);
  return profile
    ? { ...state, enabled, activeProfile: profile.id, preamp: profile.preamp, bands: [...profile.bands] }
    : { ...state, enabled };
}

let cached: EqualizerState | null = null;
let loading: Promise<EqualizerState> | null = null;

export async function loadEqualizer(force = false): Promise<EqualizerState> {
  if (!force && cached) return cached;
  if (!force && loading) return loading;
  loading = invoke<EqualizerState>('equalizer_get')
    .then(value => { cached = value; return value; })
    .finally(() => { loading = null; });
  return loading;
}
export async function saveEqualizer(value: EqualizerState): Promise<EqualizerState> {
  const saved = await invoke<EqualizerState>('equalizer_save', { state: value });
  cached = saved;
  window.dispatchEvent(new Event('equalizer-changed'));
  return saved;
}

export function useEqualizer() {
  const [state, setState] = useState<EqualizerState | null>(cached);
  const [busy, setBusy] = useState(!cached);
  const [error, setError] = useState('');
  const load = useCallback((force = false) => {
    setBusy(true);
    void loadEqualizer(force).then(value => {
      setState(value); setError('');
    }).catch(cause => setError(String(cause))).finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    load();
    const changed = () => load(true);
    window.addEventListener('equalizer-changed', changed);
    return () => window.removeEventListener('equalizer-changed', changed);
  }, [load]);
  const save = useCallback(async (value: EqualizerState) => {
    setBusy(true); setError('');
    try {
      const saved = await saveEqualizer(value);
      setState(saved);
      return saved;
    } catch (cause) {
      setError(String(cause));
      throw cause;
    } finally { setBusy(false); }
  }, []);
  return { state, busy, error, save, reload: () => load(true) };
}
