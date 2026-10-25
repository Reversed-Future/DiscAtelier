export function FolderPicker({ value, onChange, onScan, onBrowse, busy }: {
  value: string;
  onChange(value: string): void;
  onScan(): void;
  onBrowse(): void;
  busy: boolean;
}) {
  return <div className="local-folder-picker">
    <div className="path-input">
      <input aria-label="文件夹路径" value={value} onChange={event => onChange(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onScan(); } }}
        placeholder="粘贴文件夹路径" spellCheck={false} disabled={busy}/>
      <button type="button" className="text-button" disabled={busy} onClick={onBrowse}>选择文件夹</button>
      <button type="button" className="text-button" disabled={busy || !value.trim()} onClick={onScan}>扫描</button>
    </div>
  </div>;
}
