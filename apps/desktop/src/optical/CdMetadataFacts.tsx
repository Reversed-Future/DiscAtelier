import type { CdTrackMetadata } from './gateway';

export function CdMetadataFacts({ track, number, total }: { track?: CdTrackMetadata; number?: number; total: number }) {
  const fields = [
    ['艺术家', track?.artist], ['专辑', track?.album], ['年份', track?.date],
    ['流派', track?.genre], ['曲号', number ? `${number} / ${track?.trackTotal || total}` : null],
  ];
  return <dl className="cd-metadata-facts">{fields.filter(([, value]) => value).map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
