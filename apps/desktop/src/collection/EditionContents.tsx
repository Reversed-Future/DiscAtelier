import type { useEditionContent } from './useEditionContent';
import { ReleaseDetails } from '../metadata/ReleaseDetails';
import { CollectionTracks } from './CollectionTracks';
import type { MusicSupplement } from '../integrations/gateway';
import type { LibraryCopy } from '../library/types';
import type { PlaybackController } from '../playback/usePlayback';

export function EditionContents({ section, state, album, item, player, onSaved }: {
  section: 'metadata' | 'tracks'; state: ReturnType<typeof useEditionContent>; album: MusicSupplement | null;
  item: LibraryCopy; player: PlaybackController; onSaved(): Promise<void>;
}) {
  const { content, busy, error, complete, canComplete } = state;
  return <section className="edition-contents" data-section={section} aria-busy={busy}>
    {section === 'metadata' && <>
      {!!content?.genres.length && <dl className="metadata"><div><dt>流派</dt><dd>{content.genres.join(' / ')}</dd></div></dl>}
      {!!content?.styles.length && <dl className="metadata"><div><dt>风格</dt><dd>{content.styles.join(' / ')}</dd></div></dl>}
      {album && <dl className="metadata">
        {album.title !== item.edition.title && <div><dt>网易云专辑</dt><dd>{album.title}</dd></div>}
        {(album.company || album.publishedAt > 0) && <div><dt>数字发行</dt><dd>{[album.company, album.publishedAt > 0 ? new Date(album.publishedAt).toLocaleDateString('zh-CN') : ''].filter(Boolean).join(' · ')}</dd></div>}
      </dl>}
      {album?.description && <section className="edition-introduction"><h4>简介 <small>网易云</small></h4><p>{album.description}</p></section>}
      <ReleaseDetails credits={content?.credits} companies={content?.companies} notes={content?.notes}/>
    </>}
    {section === 'tracks' && <CollectionTracks rows={content?.tracks || []} album={album} item={item} player={player} onSaved={onSaved}/>}
    {canComplete && <button className="text-button complete-content" disabled={busy} onClick={() => void complete()}>{busy ? '读取中' : '补全资料'}</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
