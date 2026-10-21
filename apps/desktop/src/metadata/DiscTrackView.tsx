import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { ReleaseTrack } from './gateway';
import { ReleaseDetails } from './ReleaseDetails';
import type { DiscPage } from './discTracks';
import { enter } from '../ui/motion';

export function discTitle(disc: DiscPage, index: number) {
  return disc.numbered ? `Disc ${index + 1}. ${disc.name}` : disc.name;
}
export function DiscTabs({ pages, page, onChange }: { pages: DiscPage[]; page: number; onChange(page: number): void }) {
  return <nav className="disc-tabs" aria-label="碟片" role="tablist">{pages.map((disc, index) =>
    <button type="button" key={disc.key} role="tab" aria-selected={page === index} tabIndex={page === index ? 0 : -1}
      title={discTitle(disc, index)} onClick={() => onChange(index)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % pages.length : event.key === 'ArrowLeft' ? (index + pages.length - 1) % pages.length : event.key === 'Home' ? 0 : event.key === 'End' ? pages.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); onChange(next);
        (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
      }}>{discTitle(disc, index)}</button>)}</nav>;
}
export function DiscTrackPanel({ disc, index, actions }: { disc?: DiscPage; index: number; actions?(track: ReleaseTrack): ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => { panel.current?.scrollTo(0, 0); enter(panel.current, 0); }, [disc?.key]);
  const rows = disc?.tracks[0]?.type_ === 'heading' && disc.tracks[0].title === disc.name && !disc.tracks[0].extraartists?.length ? disc.tracks.slice(1) : disc?.tracks;
  return <div ref={panel} id={id} className="release-track-scroll" role="tabpanel" aria-label={disc ? discTitle(disc, index) : '曲目'} tabIndex={0}>
    {rows?.length ? <ol className="track-list">{rows.map((track, index) => <li key={index} className={track.type_ === 'heading' ? 'track-heading' : undefined}>
      {track.type_ === 'heading' ? <h4>{track.title}</h4> : <div className={actions ? 'playable-track-row' : undefined}><span>{track.position}</span><span>{track.title}</span><span>{track.duration}</span>{actions?.(track)}</div>}
      {!!track.extraartists?.length && <ReleaseDetails credits={track.extraartists}/>}
    </li>)}</ol> : <p className="utility-copy">暂无曲目</p>}
  </div>;
}
