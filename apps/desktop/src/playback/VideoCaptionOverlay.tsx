import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { errorMessage } from '../library/gateway';
import type { Snapshot } from './gateway';
import type { CaptionCue } from './captionTiming';
import { defaultAppearance, type CaptionAppearance } from './captionAppearance';
import { useProgressiveCaption } from './ProgressiveCaption';

// Serialize paints and teardown across player mounts. Replace superseded paints
// while a native update is in flight so seeking never builds up a word queue.
type Paint = { lines: string[]; appearance: CaptionAppearance; onError?: (error: string) => void };
let next: Paint | undefined;
let painting = false;
async function paint(frame: Paint) {
  next = frame;
  if (painting) return;
  painting = true;
  try {
    while (next) {
      const { lines, appearance, onError }: Paint = next;
      next = undefined;
      try { await invoke('subtitle_overlay', { lines, appearance }); }
      catch (error) { onError?.(errorMessage(error)); }
    }
  } finally { painting = false; }
}

export function VideoCaptionOverlay({ snapshot, cue, appearance, status, notice, onError }: {
  snapshot: Snapshot; cue?: CaptionCue; appearance: CaptionAppearance; status: string; notice: string; onError(message: string): void;
}) {
  const [source, translation] = useProgressiveCaption(snapshot, cue);
  return <CaptionLines {...{ source, translation, status, notice, appearance, onError }}/>;
}
export function CaptionLines({source,translation='',status='',notice='',appearance,onError}: {
  source:string; translation?:string; status?:string; notice?:string; appearance:CaptionAppearance; onError(message:string):void;
}) {
  useEffect(() => () => { void paint({ lines: [], appearance: defaultAppearance }); }, []);
  useEffect(() => {
    void paint({ lines: [source, translation, status, notice].filter(Boolean), appearance, onError });
  }, [source, translation, status, notice, appearance, onError]);
  return <div className="video-caption-band" aria-label="AI 字幕"><span>{source}</span><strong>{translation}</strong><small>{status} {notice}</small></div>;
}
