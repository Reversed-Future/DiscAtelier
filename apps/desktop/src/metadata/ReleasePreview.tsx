import type { MetadataRelease, ReleaseTrack } from './gateway';
import { SourceLink } from './SourceLink';
import { useEffect, useRef, useState } from 'react';
import { enter } from '../ui/motion';
import { SearchCover } from './SearchCover';
import { discPages } from './discTracks';

function Tracks({ tracks }: { tracks: ReleaseTrack[] }) {
  return <ol className="track-list">{tracks.map((track, index) =>
    <li key={index} className={track.type_ === 'heading' ? 'track-heading' : undefined}>{track.type_ === 'heading'
      ? <h4>{track.title === '-' ? '—' : track.title}</h4>
      : <div><span>{track.position}</span><span>{track.title}</span><span>{track.duration}</span></div>}</li>)}</ol>;
}
export function ReleasePreview({ release }: { release: MetadataRelease }) {
  const [identifiersOpen, setIdentifiersOpen] = useState(false);
  const [page, setPage] = useState(0);
  const tracks = useRef<HTMLDivElement>(null);
  const pages = discPages(release.tracklist, release.title);
  const current = pages[page];
  const artwork = release.images.find(image => image.type === 'primary') || release.images[0];
  useEffect(() => { tracks.current?.scrollTo(0, 0); enter(tracks.current, 0); }, [page]);
  const pageTitle = current && (!current.numbered
    ? '曲目' : `Disc ${pages.slice(0, page + 1).filter(disc => disc.numbered).length || 1}. ${current.name}`);
  return <section className="release-preview">
    <div className="release-summary">
    <div className="release-artwork"><SearchCover thumb={artwork?.uri || ''} cover={artwork?.uri150 || ''}/></div>
    <h3>{release.title}</h3>
    <p className="release-artists">{release.artists.map(artist => `${artist.anv || artist.name}${artist.join ? ` ${artist.join}` : ''}`).join(' ')}</p>
    <dl className="metadata">
      <div><dt>发行</dt><dd>{release.country} {release.released} · #{release.id}</dd></div>
      <div><dt>载体</dt><dd>{release.formats.map((format, index) => <div key={index}>{format.qty} × {format.name}{format.descriptions.length ? ` · ${format.descriptions.join(' / ')}` : ''}{format.text ? ` · ${format.text}` : ''}</div>)}</dd></div>
      <div><dt>厂牌／品番</dt><dd>{release.labels.map((label, index) => <div key={index}>{label.name} · {label.catno}</div>)}</dd></div>
    </dl>
    {!!release.identifiers.length && <button type="button" className="text-button identifier-toggle" aria-expanded={identifiersOpen} onClick={() => setIdentifiersOpen(value => !value)}>标识符 · {release.identifiers.length}</button>}
    <div className="identifier-disclosure" data-open={identifiersOpen} inert={!identifiersOpen}><div><dl className="metadata">
      {release.identifiers.map((identifier, index) => <div key={index}><dt>{identifier.type}</dt><dd>{identifier.value}{identifier.description && <small> · {identifier.description}</small>}</dd></div>)}
    </dl></div></div>
    <SourceLink id={release.id}/>
    </div>
    <div className="release-tracks">
      <nav className="disc-pagination" aria-label="碟片">
        <h4 title={pageTitle}>{pageTitle || '曲目'}</h4>
        {pages.length > 1 && <div>
          <button type="button" className="disc-arrow" aria-label="上一张碟片" disabled={page === 0} onClick={() => setPage(value => value - 1)}>‹</button>
          <span>{page + 1} / {pages.length}</span>
          <button type="button" className="disc-arrow" aria-label="下一张碟片" disabled={page === pages.length - 1} onClick={() => setPage(value => value + 1)}>›</button>
        </div>}
      </nav>
      <div ref={tracks} className="release-track-scroll" role="region" aria-label={pageTitle || '曲目'} tabIndex={0}>
        {current ? <Tracks tracks={current.numbered && current.tracks[0]?.type_ === 'heading' && current.tracks[0].title === current.name
          ? current.tracks.slice(1) : current.tracks}/> : <p className="utility-copy">暂无曲目</p>}
      </div>
    </div>
  </section>;
}
