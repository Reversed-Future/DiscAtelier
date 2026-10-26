import type { MetadataRelease } from './gateway';
import { useState } from 'react';
import { DiscTabs, DiscTrackPanel } from './DiscTrackView';
import { SearchCover } from './SearchCover';
import { discPages } from './discTracks';
import { releaseMedia } from './discStructure';
import { ReleaseDetails } from './ReleaseDetails';

export function ReleasePreview({ release }: { release: MetadataRelease }) {
  const [identifiersOpen, setIdentifiersOpen] = useState(false);
  const [page, setPage] = useState(0);
  const pages = discPages(release.tracklist, release.title, releaseMedia(release.formats));
  const artwork = release.images.find(image => image.type === 'primary') || release.images[0];
  return <section className="release-preview">
    <DiscTabs pages={pages} page={page} onChange={setPage}/>
    <div className="release-summary">
    <div className="release-artwork"><SearchCover thumb={artwork?.uri || ''} cover={artwork?.uri150 || ''}/></div>
    <h3>{release.title}</h3>
    <p className="release-artists">{release.artists.map(artist => `${artist.anv || artist.name}${artist.join ? ` ${artist.join}` : ''}`).join(' ')}</p>
    <dl className="metadata">
      {!!release.genres.length && <div><dt>流派</dt><dd>{release.genres.join(' / ')}</dd></div>}
      {!!release.styles.length && <div><dt>风格</dt><dd>{release.styles.join(' / ')}</dd></div>}
      <div><dt>发行</dt><dd>{release.country} {release.released} · #{release.id}</dd></div>
      <div><dt>载体</dt><dd>{release.formats.map((format, index) => <div key={index}>{format.qty} × {format.name}{format.descriptions.length ? ` · ${format.descriptions.join(' / ')}` : ''}{format.text ? ` · ${format.text}` : ''}</div>)}</dd></div>
      <div><dt>厂牌／品番</dt><dd>{release.labels.map((label, index) => <div key={index}>{label.name} · {label.catno}</div>)}</dd></div>
    </dl>
    <ReleaseDetails credits={release.extraartists} companies={release.companies} notes={release.notes}/>
    {!!release.identifiers.length && <button type="button" className="text-button identifier-toggle" aria-expanded={identifiersOpen} onClick={() => setIdentifiersOpen(value => !value)}>标识符 · {release.identifiers.length}</button>}
    <div className="identifier-disclosure" data-open={identifiersOpen} inert={!identifiersOpen}><div><dl className="metadata">
      {release.identifiers.map((identifier, index) => <div key={index}><dt>{identifier.type}</dt><dd>{identifier.value}{identifier.description && <small> · {identifier.description}</small>}</dd></div>)}
    </dl></div></div>
    </div>
    <div className="release-tracks"><DiscTrackPanel disc={pages[page]} index={page}/></div>
  </section>;
}
