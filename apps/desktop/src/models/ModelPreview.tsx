import type { ReactNode } from 'react';
import { useStaticArtwork } from '../library/useStaticArtwork';

interface Props { assetId: string; fallback: ReactNode; authored?: boolean }
export function ModelPreview(props: Props) { return <PreviewSession key={props.assetId} {...props}/>; }
/** Browse only reads the authored image; it never loads or renders a 3D model. */
function PreviewSession({ assetId, fallback, authored = true }: Props) {
  const image = useStaticArtwork('model-preview', authored ? assetId : null);
  if (!authored) return fallback;
  if (image.url) return <img className="model-preview" src={image.url} alt="模型预览"/>;
  if (image.loading) return <div className="model-preview artwork-pending" aria-hidden="true"/>;
  return fallback;
}
