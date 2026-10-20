import type { EditionSource } from '../library/types';
import { SourceLink } from './SourceLink';

export function CollectionSource({ source }: { source: EditionSource | null }) {
  if (source?.providerId !== 'discogs' || !/^[1-9]\d*$/.test(source.externalId) || !Number.isSafeInteger(Number(source.externalId))) return null;
  return <div className="collection-source" title={`导入时间：${new Date(source.fetchedAt).toLocaleString('zh-CN')}`}>
    <SourceLink id={Number(source.externalId)}/>
  </div>;
}
