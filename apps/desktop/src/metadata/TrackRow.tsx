import { useId, useState } from 'react';
import type { ReleaseTrack } from './gateway';
import { Credits } from './ReleaseDetails';
import { Icon } from '../ui/Icon';
import { NeteaseLogo } from '../ui/NeteaseLogo';

export interface TrackPlayback { playing: boolean; busy: boolean; play(): void }

export function TrackRow({ track, playback, localPlayback, positionLabel }: { track: ReleaseTrack; playback?: TrackPlayback; localPlayback?: TrackPlayback; positionLabel?: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const actions = localPlayback || playback;
  return <>
    <div className="track-row" data-playing={actions?.playing || undefined}>
      <span className="track-position">{positionLabel ?? track.position}</span>
      <span className="track-heading-content"><span className="track-name">{track.title}</span>
        {!!track.extraartists?.length && <button type="button" className="track-credits-toggle" aria-label={`${track.title} 的 Credits`} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(v => !v)}>Credits</button>}
      </span>
      <span className="track-duration">{track.duration}</span>
      {(localPlayback || playback) && <span className="track-actions">
        {localPlayback && <button type="button" className="track-action" disabled={localPlayback.busy} aria-label={`播放本地文件 ${track.title}`} title="播放本地文件" aria-current={localPlayback.playing ? 'true' : undefined} onClick={localPlayback.play}><Icon name="play"/></button>}
        {playback && <button type="button" className="track-action netease-action" disabled={playback.busy} aria-label={`网易云播放 ${track.title}`} title="网易云播放" aria-current={playback.playing ? 'true' : undefined} onClick={playback.play}><NeteaseLogo/></button>}
      </span>}
    </div>
    {!!track.extraartists?.length && <div className="track-credits identifier-disclosure" id={id} data-open={expanded} inert={!expanded}><div><Credits rows={track.extraartists}/></div></div>}
  </>;
}
