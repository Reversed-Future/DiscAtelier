param([Parameter(Mandatory=$true)][string]$Runtime)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sdk = Join-Path $root 'artifacts/subtitle-vlc-sdk'
$archive = Join-Path $sdk 'vlc-3.0.22.tar.xz'
New-Item -ItemType Directory -Force $sdk | Out-Null
if (!(Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest -UseBasicParsing 'https://download.videolan.org/pub/videolan/vlc/3.0.22/vlc-3.0.22.tar.xz' -OutFile $archive
}
if ((Get-FileHash -LiteralPath $archive).Hash -ne 'E2CC1CF0AE0902A09DA5A37C249A8A4E4B5EC4DC095443B8E1493C6A7CC138EA') { throw 'Unexpected VLC SDK checksum' }
& tar -xf $archive -C $sdk vlc-3.0.22/include
if ($LASTEXITCODE) { throw 'Cannot unpack VLC headers' }
$source = Join-Path $root 'crates/player-vlc/native/atelier_captions.c'
$plugin = Join-Path $Runtime 'plugins/spu/libatelier_captions_plugin.dll'
& gcc -std=gnu11 -O2 -shared -DHAVE_SSIZE_T "-I$sdk/vlc-3.0.22/include" $source (Join-Path $Runtime 'libvlccore.dll') -o $plugin
if ($LASTEXITCODE) { throw 'Cannot compile VLC caption filters with MinGW-w64' }
