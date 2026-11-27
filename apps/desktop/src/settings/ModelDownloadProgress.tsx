export interface ModelProgress {
  received: number;
  total: number;
  bytesPerSecond: number;
  remainingSeconds: number | null;
}

function bytes(value: number) {
  if (value >= 1048576) return `${(value / 1048576).toFixed(1)} MiB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KiB`;
  return `${value} B`;
}

function duration(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  return `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分`;
}

export function ModelDownloadProgress({ progress }: { progress: ModelProgress }) {
  const { received, total, bytesPerSecond, remainingSeconds } = progress;
  return <div className="model-download-progress">
    <progress aria-label="模型下载进度" value={received} max={total}/>
    <div><span>{Math.floor(received * 100 / total)}% · {bytes(received)} / {bytes(total)}</span>
      <span>{bytes(bytesPerSecond)}/s</span>
      <span>{received === total ? '正在校验' : remainingSeconds === null ? '预计剩余时间待估算' : `预计剩余 ${duration(remainingSeconds)}`}</span></div>
  </div>;
}
