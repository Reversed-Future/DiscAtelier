import { useEffect } from 'react';
import type { PlaybackController } from './usePlayback';
import type { SystemMediaSource } from './useSystemMedia';

export function useSystemMediaSource(player: PlaybackController, value: Omit<SystemMediaSource, 'sessionId'>) {
  const sessionId = player.snapshot?.sessionId || '';
  const ref = player.systemMedia.source;
  useEffect(() => { ref.current = { ...value, sessionId }; });
  useEffect(() => () => { if (ref.current?.sessionId === sessionId) ref.current = null; }, [sessionId, ref]);
}
