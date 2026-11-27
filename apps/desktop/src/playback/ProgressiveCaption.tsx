import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from './gateway';
import { captionSteps, type CaptionCue } from './captionTiming';

const emptyCue: CaptionCue = { start: 0, end: 0, marks: [], text: '' };
export function useProgressiveCaption(snapshot: Snapshot, cue: CaptionCue = emptyCue) {
  const steps = useMemo(() => captionSteps(cue), [cue]);
  const { positionSeconds, rate, paused, phase, sessionId, updatedAt } = snapshot;
  // Record receipt of the player's clock sample independently of translation arrival.
  const anchor = useMemo(() => performance.now(), [sessionId, positionSeconds, rate, paused, phase, updatedAt]);
  const [position, setPosition] = useState(positionSeconds);
  const clock = useRef({ sample: positionSeconds, shown: positionSeconds });
  useLayoutEffect(() => {
    // Native samples are coarser than word boundaries. A fresh reading of the
    // same timestamp must not retract words already revealed between samples.
    if (positionSeconds < clock.current.sample) clock.current.shown = positionSeconds;
    clock.current.sample = positionSeconds;
    let timer: ReturnType<typeof setTimeout>;
    const playing = !paused && phase === 'playing' && rate > 0;
    const tick = () => {
      const elapsed = playing ? Math.min(0.5, (performance.now() - anchor) / 1000) * rate : 0;
      const estimate = positionSeconds + elapsed;
      const now = Math.max(clock.current.shown, estimate);
      clock.current.shown = now;
      setPosition(now);
      if (!playing) return;
      const next = steps.find(s => s.at > now)?.at ?? cue.end;
      if (next > now && next <= positionSeconds + 0.5 * rate) {
        timer = setTimeout(tick, Math.max(1, Math.ceil((next - estimate) * 1000 / rate)));
      }
    };
    tick();
    return () => clearTimeout(timer);
  }, [steps, positionSeconds, rate, paused, phase, anchor, cue.end]);
  if (position < cue.start || position >= cue.end) return ['', ''] as const;
  let sourceEnd = 0, translationEnd = 0;
  for (const step of steps) {
    if (step.at > position) break;
    sourceEnd = Math.max(sourceEnd, step.sourceEnd);
    translationEnd = Math.max(translationEnd, step.translationEnd);
  }
  return [cue.text.slice(0, sourceEnd).trimEnd(), cue.translation?.slice(0, translationEnd).trimEnd() || ''] as const;
}
