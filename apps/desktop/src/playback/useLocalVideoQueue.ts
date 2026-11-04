import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Source } from './gateway';

export interface LocalVideoItem { copyId: string; path: string; label: string; episode: number | null }
const normalize = (path: string) => path.replace(/\\/g, '/').toLowerCase();

export function useLocalVideoQueue(source: Source | undefined) {
  const playlist = source?.playlist || '';
  const currentPath = playlist.startsWith('local:') ? playlist.slice('local:'.length) : '';
  const [items, setItems] = useState<LocalVideoItem[]>([]);
  useEffect(() => {
    let active = true;
    if (!currentPath) { setItems([]); return; }
    async function load() {
      try {
        const bindings = await invoke<LocalVideoItem[]>('local_files_get');
        if (!active) return;
        const current = bindings.find(binding => binding.path === currentPath)
          || bindings.find(binding => normalize(binding.path) === normalize(currentPath));
        if (!current) { setItems([]); return; }
        const unique = new Map<string, LocalVideoItem>();
        for (const binding of bindings) {
          if (binding.copyId !== current.copyId) continue;
          const key = normalize(binding.path);
          if (!unique.has(key)) unique.set(key, binding);
        }
        const queue = [...unique.values()].sort((a, b) =>
          (a.episode ?? Number.MAX_SAFE_INTEGER) - (b.episode ?? Number.MAX_SAFE_INTEGER)
          || a.label.localeCompare(b.label, 'zh-CN') || a.path.localeCompare(b.path));
        setItems(queue);
      } catch { if (active) setItems([]); }
    }
    void load();
    window.addEventListener('local-files-changed', load);
    return () => { active = false; window.removeEventListener('local-files-changed', load); };
  }, [currentPath]);
  const currentIndex = items.findIndex(item => normalize(item.path) === normalize(currentPath));
  return { items, currentPath, currentIndex };
}
