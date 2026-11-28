import type { Descriptor, EditionDraft } from '../library/types';
import { Select } from '../ui/Select';

export function EditionFields({ value, onChange, categories }: {
  value: EditionDraft; onChange(value: EditionDraft): void; categories: Descriptor[];
}) {
  const change = (key: keyof EditionDraft, text: string) => onChange({ ...value, [key]: text });
  return <>
    <label>名称<input aria-label="名称" autoFocus value={value.title} maxLength={200} onChange={event => change('title', event.target.value)}/></label>
    <div className="form-row"><label>作者<input aria-label="作者" value={value.creator} maxLength={200} onChange={event => change('creator', event.target.value)}/></label>
      <label>分区<Select label="分区" value={value.categoryId} options={categories} onChange={text => change('categoryId', text)}/></label></div>
    <label>版本<input aria-label="版本" value={value.editionLabel} maxLength={200} placeholder="如：初回限定版" onChange={event => change('editionLabel', event.target.value)}/></label>
    <div className="form-row"><label>条码<input aria-label="条码" value={value.barcode} maxLength={200} onChange={event => change('barcode', event.target.value)}/></label>
      <label>品番<input aria-label="品番" value={value.catalogNumber} maxLength={200} onChange={event => change('catalogNumber', event.target.value)}/></label></div>
  </>;
}
