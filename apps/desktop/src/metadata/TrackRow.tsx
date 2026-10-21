import { useId, useState } from 'react';
import type { ReleaseTrack } from './gateway';
import { Credits } from './ReleaseDetails';

export interface TrackPlayback { playing: boolean; busy: boolean; play(): void }

/** Playback covers this row; the small credit toggle is an independent control. */
export function TrackRow({ track, playback }: { track: ReleaseTrack; playback?: TrackPlayback }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <>
    <div className="track-row" data-playing={playback?.playing || undefined}>
      {playback && <button type="button" className="track-play-target" disabled={playback.busy} aria-label={`播放 ${track.title}`} aria-current={playback.playing ? 'true' : undefined} onClick={playback.play}/>}
      <span className="track-position">{track.position}</span>
      <span className="track-heading-content"><span className="track-name">{track.title}</span>
        {!!track.extraartists?.length && <button type="button" className="track-credits-toggle" aria-label={`${track.title} 的 Credits`} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(v => !v)}>Credits</button>}
      </span>
      <span className="track-duration">{track.duration}</span>
    </div>
    {!!track.extraartists?.length && <div className="track-credits identifier-disclosure" id={id} data-open={expanded} inert={!expanded}><div><Credits rows={track.extraartists}/></div></div>}
  </>;
}
