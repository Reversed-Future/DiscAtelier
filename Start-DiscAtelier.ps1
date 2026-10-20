$ErrorActionPreference = 'Stop'
$executable = Join-Path $PSScriptRoot 'target\release\discatelier-desktop.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    $executable = Join-Path $PSScriptRoot 'target\debug\discatelier-desktop.exe'
}
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw '请先在项目目录运行 npm run build 和 cargo build -p discatelier-desktop --release。'
}
# This entry point explicitly opens the interactive collection application.
Start-Process -FilePath $executable -WorkingDirectory $PSScriptRoot
