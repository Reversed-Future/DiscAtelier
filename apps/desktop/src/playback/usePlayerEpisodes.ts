import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { library } from '../library/gateway';
import type { LibraryCopy } from '../library/types';
import type { VideoMetadata } from '../video/gateway';
import { fetchVideoMetadata } from '../video/useVideoMetadata';
import type { Source } from './gateway';
import { buildPlayerEpisodes, currentEpisodeIndex, normalizePath, videoBindingsForCopy, type EpisodeBinding } from './episodeGallery';

const LOCAL_VIDEO = 'local-video';
const LOCAL_PREFIX = 'local:';

let bindingCache: EpisodeBinding[] | null = null;
let bindingRequest: Promise<EpisodeBinding[]> | null = null;
let videoCopies: Promise<LibraryCopy[]> | null = null;
const copyCache = new Map<string, LibraryCopy | null>();
const metadataCache = new Map<string, Promise<VideoMetadata | null>>();

function loadBindings(force = false) {
  if (force) { bindingCache = null; bindingRequest = null; }
  if (bindingCache) return Promise.resolve(bindingCache);
  if (!bindingRequest) {
    bindingRequest = invoke<EpisodeBinding[]>('local_files_get')
      .then(values => { bindingCache = values; return values; })
      .finally(() => { bindingRequest = null; });
  }
  return bindingRequest;
}

function loadVideoCopies() {
  if (!videoCopies) {
    videoCopies = library.list({ categoryId: 'video', status: null, query: '' })
      .then(snapshot => snapshot.copies)
      .catch(() => { videoCopies = null; return []; });
  }
  return videoCopies;
}

async function loadCopy(copyId: string) {
  if (copyCache.has(copyId)) return copyCache.get(copyId) ?? null;
  const copies = await loadVideoCopies();
  const copy = copies.find(item => item.id === copyId) || null;
  if (copy) copyCache.set(copyId, copy);
  return copy;
}

function loadMetadata(copy: LibraryCopy) {
  const key = `${copy.editionId}:${copy.editionRevision}`;
  if (!metadataCache.has(key)) {
    metadataCache.set(key, fetchVideoMetadata(copy.editionId, copy.editionRevision)
      .catch(() => { metadataCache.delete(key); return null; }));
  }
  return metadataCache.get(key)!;
}

export function usePlayerEpisodes(source: Source | undefined) {
  const currentPath = source?.mediaToken === LOCAL_VIDEO && source.playlist.startsWith(LOCAL_PREFIX)
    ? source.playlist.slice(LOCAL_PREFIX.length)
    : '';
  const [bindings, setBindings] = useState<EpisodeBinding[]>([]);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [copyId, setCopyId] = useState('');
  const [loading, setLoading] = useState(false);
  const resolvedCopy = useRef('');

  useEffect(() => {
    let active = true, request = 0;
    if (!currentPath) {
      resolvedCopy.current = '';
      setBindings([]);
      setMetadata(null);
      setCopyId('');
      setLoading(false);
      return;
    }
    setLoading(true);
    async function resolve(force = false) {
      const token = ++request;
      try {
        const all = await loadBindings(force);
        if (!active || token !== request) return;
        setBindings(all);
        const normalized = normalizePath(currentPath);
        const current = all.find(binding => normalizePath(binding.path) === normalized);
        const id = current?.copyId || source?.mountPoint || '';
        if (!active || token !== request) return;
        setCopyId(id);
        if (id !== resolvedCopy.current) {
          resolvedCopy.current = id;
          setMetadata(null);
        }
        if (!id) return;
        const copy = await loadCopy(id);
        if (!active || token !== request || !copy) return;
        const value = await loadMetadata(copy);
        if (active && token === request) setMetadata(value);
      } catch {
        if (active && token === request) setMetadata(null);
      } finally {
        if (active && token === request) setLoading(false);
      }
    }
    void resolve();
    const changed = () => { void resolve(true); };
    window.addEventListener('local-files-changed', changed);
    return () => {
      active = false;
      window.removeEventListener('local-files-changed', changed);
    };
  }, [currentPath, source?.mountPoint]);

  const scoped = copyId ? videoBindingsForCopy(bindings, copyId) : [];
  const items = buildPlayerEpisodes(metadata, scoped, currentPath);
  return { items, currentIndex: currentEpisodeIndex(items, currentPath), copyId, loading };
}
