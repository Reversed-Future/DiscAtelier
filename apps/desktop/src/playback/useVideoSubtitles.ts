import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { errorMessage } from '../library/gateway';
import type { Snapshot } from './gateway';

import type { CaptionCue as Cue } from './captionTiming';
import { defaultAppearance, type CaptionAppearance } from './captionAppearance';
interface Started { id: string; bilingual: boolean; notice: string; appearance: CaptionAppearance }
const WINDOW = 12;

export function useVideoSubtitles(snapshot: Snapshot | null, enabled: boolean) {
  const [appearance, setAppearance] = useState(defaultAppearance);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const [pages, setPages] = useState<Map<number, Cue[]>>(new Map());
  const [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [epoch, setEpoch] = useState(0);
  const position = snapshot?.positionSeconds ?? 0;
  const block = Math.floor(position / WINDOW) * WINDOW;
  const previous = useRef(position);
  useEffect(() => {
    if (enabled && Math.abs(position - previous.current) > 3) setEpoch(n => n + 1);
    previous.current = position;
  }, [position, enabled]);
  const session = snapshot?.sessionId, track = snapshot?.selectedAudio;
  const eligible = enabled && snapshot?.source.mediaToken === 'local-video' && ['playing', 'paused', 'buffering'].includes(snapshot.phase);
  useEffect(() => {
    setPages(new Map()); setNotice(''); setError('');
    if (!eligible || !session || track == null) return;
    let disposed = false, job: Started | undefined, timer: ReturnType<typeof setTimeout>;
    const cache = new Map<number, Cue[]>(), translated = new Set<number>();
    let translating = false, translateFailed = false;
    const stop = (id: string) => { void invoke('subtitle_stop', { id }).catch(() => {}); };
    async function translate(start: number, rows: Cue[]) {
      if (!job?.bilingual || translating || translateFailed || translated.has(start) || !rows.length) return;
      translating = true;
      try {
        const lines = await invoke<string[]>('subtitle_translate', { id: job.id, lines: rows.map(r => r.text) });
        if (!disposed && cache.has(start)) {
          cache.set(start, rows.map((r, i) => ({ ...r, translation: lines[i] })));
          translated.add(start); setPages(new Map(cache));
        }
      } catch (e) { if (!disposed) { translateFailed = true; setNotice(`中文翻译已暂停，继续显示原文。 ${errorMessage(e)}`); } }
      finally { translating = false; }
    }
    async function tick() {
      const s = latest.current;
      if (disposed || !job || !s || s.sessionId !== session || s.selectedAudio !== track) return;
      const current = Math.floor(s.positionSeconds / WINDOW) * WINDOW;
      // Pausing permits the current caption to finish. Only moving playback prefetches.
      const blocks = s.paused ? [current] : [current, current + WINDOW];
      for (const old of cache.keys()) if (old < current - WINDOW || old > current + WINDOW) { cache.delete(old); translated.delete(old); }
      try {
        for (const start of blocks) {
          if (s.durationSeconds != null && start >= s.durationSeconds) continue;
          let rows = cache.get(start);
          if (!rows) {
            rows = await invoke<Cue[]>('subtitle_recognize', { id: job.id, start });
            if (disposed) return;
            cache.set(start, rows); setPages(new Map(cache));
            void translate(start, rows);
            break;
          }
          void translate(start, rows);
        }
      } catch (e) { if (!disposed) { setError(errorMessage(e)); stop(job.id); } return; }
      if (!disposed) timer = setTimeout(() => void tick(), 150);
    }
    void invoke<Started>('subtitle_start', { session, trackId: track }).then(value => {
      if (disposed) { stop(value.id); return; }
      job = value; setAppearance(value.appearance); setNotice(value.notice); void tick();
    }).catch(e => { if (!disposed) setError(errorMessage(e)); });
    return () => { disposed = true; clearTimeout(timer); if (job) stop(job.id); };
  }, [eligible, session, track, epoch]);
  const rows = pages.get(block);
  const cue = rows?.find(r => r.start <= position && position < r.end);
  return { cue, notice, error, appearance, loading: eligible && !rows && !error };
}
