export function FolderPicker({ value, onChange, onScan, onBrowse, busy, count }: {
  value: string;
  onChange(value: string): void;
  onScan(): void;
  onBrowse(): void;
  busy: boolean;
  count: number;
}) {
  return <div className="local-folder-picker">
    <div className="setting-row">
      <span>关联文件夹</span>
      <button type="button" className="text-button" disabled={busy} onClick={onBrowse}>选择文件夹</button>
    </div>
    <div className="path-input">
      <input aria-label="文件夹路径" value={value} onChange={event => onChange(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onScan(); } }}
        placeholder="粘贴文件夹路径，或从上方选择" spellCheck={false} disabled={busy}/>
      <button type="button" className="text-button" disabled={busy || !value.trim()} onClick={onScan}>扫描</button>
    </div>
    <p className="data-path">{value || '尚未选择文件夹'}{count ? ` · ${count} 个文件` : ''}</p>
  </div>;
}
