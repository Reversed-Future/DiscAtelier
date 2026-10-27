import type { useEditionContent } from './useEditionContent';
import { ReleaseDetails } from '../metadata/ReleaseDetails';
import { useMemo } from 'react';
import { tracksWithCredits } from '../metadata/creditTracks';
import { MusicAlbumInfo } from './MusicAlbumInfo';
import { CollectionTracks } from './CollectionTracks';
import type { LinkedMusicAlbum, DiscAlbumLink, SongLink } from '../integrations/gateway';
import type { LibraryCopy } from '../library/types';
import type { PlaybackController } from '../playback/usePlayback';

export function EditionContents({ section, state, albums, links, bindings, item, player }: {
  section: 'metadata' | 'tracks'; state: ReturnType<typeof useEditionContent>; albums: LinkedMusicAlbum[]; links: SongLink[]; bindings: DiscAlbumLink[];
  item: LibraryCopy; player: PlaybackController;
}) {
  const { content, busy, error, complete, canComplete } = state;
  const tracks = useMemo(() => content ? tracksWithCredits(content, item.edition.title, item.edition.media) : [], [content, item.edition.title, item.edition.media]);
  return <section className="edition-contents" data-section={section} aria-busy={busy}>
    {section === 'metadata' && <>
      {!!content?.genres.length && <dl className="metadata"><div><dt>流派</dt><dd>{content.genres.join(' / ')}</dd></div></dl>}
      {!!content?.styles.length && <dl className="metadata"><div><dt>风格</dt><dd>{content.styles.join(' / ')}</dd></div></dl>}
      <MusicAlbumInfo albums={albums} title={item.edition.title}/>
      <ReleaseDetails credits={content?.credits} companies={content?.companies} notes={content?.notes}/>
    </>}
    {section === 'tracks' && <CollectionTracks rows={tracks} albums={albums} links={links} bindings={bindings} item={item} player={player}/>}
    {canComplete && <button className="text-button complete-content" disabled={busy} onClick={() => void complete()}>{busy ? '读取中' : '补全资料'}</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
