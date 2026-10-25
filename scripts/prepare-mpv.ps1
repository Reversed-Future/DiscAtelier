param(
  [string]$Source = 'C:\Program Files\MPV Player',
  [string]$Destination = (Join-Path $PSScriptRoot '../artifacts/mpv-runtime')
)
$ErrorActionPreference = 'Stop'
$sourceExe = Join-Path $Source 'mpv.exe'
$sourceCompiler = Join-Path $Source 'd3dcompiler_43.dll'
if (!(Test-Path -LiteralPath $sourceExe) -or !(Test-Path -LiteralPath $sourceCompiler)) {
  throw "MPV runtime not found under '$Source'. Install MPV or pass -Source with mpv.exe and d3dcompiler_43.dll."
}
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Copy-Item -LiteralPath $sourceExe -Destination (Join-Path $Destination 'mpv.exe') -Force
Copy-Item -LiteralPath $sourceCompiler -Destination (Join-Path $Destination 'd3dcompiler_43.dll') -Force
Write-Host "MPV runtime: $(Join-Path $Destination 'mpv.exe')"
