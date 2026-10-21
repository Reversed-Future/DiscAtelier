import { useState } from 'react';
import type { ReleaseCredit, ReleaseCompany } from './gateway';

export function Credits({ rows }: { rows: ReleaseCredit[] }) {
  return <dl className="credit-list">{rows.map((c, i) => <div key={i}><dt>{c.role}</dt><dd>{c.anv || c.name}{c.tracks && <small> · {c.tracks}</small>}</dd></div>)}</dl>;
}
export function ReleaseDetails({ credits = [], companies = [], notes = '' }: { credits?: ReleaseCredit[]; companies?: ReleaseCompany[]; notes?: string }) {
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (key: string) => setOpen(v => v.includes(key) ? v.filter(k => k !== key) : [...v, key]);
  return <div className="release-details">
    {notes && <section className="edition-introduction"><h4>发行说明</h4><p>{notes}</p></section>}
    {!!credits.length && <><button className="text-button" aria-expanded={open.includes('credits')} onClick={() => toggle('credits')}>Credits · {credits.length}</button><div className="identifier-disclosure" data-open={open.includes('credits')} inert={!open.includes('credits')}><div><Credits rows={credits}/></div></div></>}
    {!!companies.length && <><button className="text-button" aria-expanded={open.includes('companies')} onClick={() => toggle('companies')}>Companies · {companies.length}</button><div className="identifier-disclosure" data-open={open.includes('companies')} inert={!open.includes('companies')}><div><dl className="credit-list">{companies.map((c, i) => <div key={i}><dt>{c.entity_type_name}</dt><dd>{c.name}{c.catno && <small> · {c.catno}</small>}</dd></div>)}</dl></div></div></>}
  </div>;
}
