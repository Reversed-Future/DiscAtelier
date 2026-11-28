import type { ReactNode } from 'react';

export function EditionIdentity({artwork, children}: {artwork: ReactNode; children: ReactNode}) {
  return <div className="edition-identity" data-part-covers={!artwork}>{artwork && <aside className="edition-artwork">{artwork}</aside>}<div className="edition-identifiers">{children}</div></div>;
}
