import type { ReactNode } from 'react';

// Declared once so empty rows and populated rows share exactly the same columns.
const layouts = {
  tracks: ['150px', '95px', '100px', undefined, '80px', '80px'],
  credits: ['20%', '20%', '20%', undefined, '106px'],
  companies: [undefined, undefined, undefined, '106px'],
  facts: ['24%', undefined, '106px'],
  images: ['100px', undefined, undefined, '72px', '70px', '70px', '106px'],
  people: [undefined, undefined, '106px'],
  chapters: ['100px', '70px', undefined, undefined, '110px', '80px', undefined, '106px'],
};

export function ContentEditorTable({ kind, children }: { kind: keyof typeof layouts; children: ReactNode }) {
  return <div className="content-editor-table-wrap"><table className={`content-editor-table content-editor-table-${kind}`}>
    <colgroup>{layouts[kind].map((width, index) => <col key={index} style={{ width }}/>)}</colgroup>
    {children}
  </table></div>;
}
