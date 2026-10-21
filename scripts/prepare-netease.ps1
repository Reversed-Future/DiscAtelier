$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$packageRoot = Join-Path $projectRoot 'packages/netease-sidecar'
$runtimeRoot = Join-Path $projectRoot 'artifacts/netease-runtime'
$archivePath = Join-Path $projectRoot 'artifacts/node-v22.23.3-win-x64.zip'
$zipHash = '2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71'
$nodeHash = '9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e'
function Get-Sha256([string] $Path) {
  $stream = [IO.File]::OpenRead($Path)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $algorithm.Dispose(); $stream.Dispose() }
}
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $archivePath)) {
  $download = New-Object Net.WebClient
  try { $download.DownloadFile('https://nodejs.org/dist/v22.23.3/node-v22.23.3-win-x64.zip', $archivePath) }
  finally { $download.Dispose() }
}
if ((Get-Sha256 $archivePath) -ne $zipHash) { throw 'Node archive checksum mismatch' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  foreach ($name in @('node.exe', 'LICENSE')) {
    $entry = $archive.GetEntry("node-v22.23.3-win-x64/$name")
    if ($null -eq $entry) { throw "Missing runtime file: $name" }
    $destination = Join-Path $runtimeRoot $(if ($name -eq 'LICENSE') { 'NODE-LICENSE.txt' } else { $name })
    if (-not (Test-Path -LiteralPath $destination)) {
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $false)
    }
  }
} finally { $archive.Dispose() }
if ((Get-Sha256 (Join-Path $runtimeRoot 'node.exe')) -ne $nodeHash) { throw 'Node binary checksum mismatch' }
# Install only into a previously absent directory; never clean or replace a tree.
if (-not (Test-Path -LiteralPath (Join-Path $packageRoot 'node_modules'))) {
  & npm.cmd ci --prefix $packageRoot --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'API dependency installation failed' }
}
& node (Join-Path $PSScriptRoot 'prepare-netease.mjs')
if ($LASTEXITCODE -ne 0) { throw 'API resource preparation failed' }
