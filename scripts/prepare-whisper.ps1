$ErrorActionPreference = 'Stop'
$artifacts = Join-Path $PSScriptRoot '../artifacts'
$cache = Join-Path $artifacts 'subtitle-build'
$runtime = Join-Path $artifacts 'whisper-runtime'
New-Item -ItemType Directory -Path $cache,$runtime -Force | Out-Null
function Get-VerifiedFile($path, $url, $sha) {
  if ((Test-Path -LiteralPath $path) -and ((Get-FileHash -LiteralPath $path).Hash -eq $sha)) { return }
  & curl.exe --fail --location --retry 3 --output "$path.part" $url
  if ($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath "$path.part").Hash -ne $sha) { throw "Download or checksum failed: $url" }
  Move-Item -LiteralPath "$path.part" -Destination $path -Force
}
$archive = Join-Path $cache 'engine.zip'
Get-VerifiedFile $archive 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.2/whisper-bin-x64.zip' 'b1514ebc099765e39fa37eb780b92a140a94c86bb0b3b3d98226b38825979732'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $archive))
try {
  foreach ($name in @('whisper-cli.exe','whisper.dll','ggml.dll','ggml-base.dll','ggml-cpu.dll')) {
    $entry = $zip.GetEntry("Release/$name")
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $runtime $name), $true)
  }
} finally { $zip.Dispose() }
Get-VerifiedFile (Join-Path $runtime 'LICENSE-whisper') 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.8.2/LICENSE' 'e562a2ddfaf8280537795ac5ecd34e3012b6582a147ef69ba6a6a5c08c84757d'
Get-VerifiedFile (Join-Path $runtime 'LICENSE-model') 'https://raw.githubusercontent.com/openai/whisper/main/LICENSE' 'b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d'
