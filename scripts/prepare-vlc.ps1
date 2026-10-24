param(
    [string]$VlcVersion = '3.0.22',
    [string]$JavaVersion = '8u504b01'
)
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$downloads = Join-Path $root 'artifacts/downloads'
$vlcRoot = Join-Path $root "artifacts/vlc-runtime-$VlcVersion"
$javaRoot = Join-Path $root "artifacts/java-runtime-$JavaVersion"
$vlcZip = Join-Path $downloads "vlc-$VlcVersion-win64.zip"
$javaZip = Join-Path $downloads 'OpenJDK8U-jre_x64_windows_hotspot_8u504b01.zip'
$vlcHash = '3a75c0a4e8ee3a04f409b8953c572cea725492cbed27f93d1ce6e29f9cfb59b9'
$javaHash = '82e2cdc6693737c5998445b31f69668fa0da77c7705121053f6508ac84961123'
$vlcUrl = "https://download.videolan.org/pub/videolan/vlc/$VlcVersion/win64/vlc-$VlcVersion-win64.zip"
$javaUrl = 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u504-b01/OpenJDK8U-jre_x64_windows_hotspot_8u504b01.zip'

New-Item -ItemType Directory -Force $downloads | Out-Null
function Get-Verified([string]$Url, [string]$Path, [string]$Hash) {
    if (!(Test-Path -LiteralPath $Path)) {
        Write-Host "Downloading $Url"
        Invoke-WebRequest -Uri $Url -OutFile $Path -UseBasicParsing
    }
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    if ($actual -ne $Hash) { throw "Checksum mismatch for $Path`: $actual" }
}
Get-Verified $vlcUrl $vlcZip $vlcHash
Get-Verified $javaUrl $javaZip $javaHash
if (!(Test-Path -LiteralPath $vlcRoot)) {
    Expand-Archive -LiteralPath $vlcZip -DestinationPath $vlcRoot
}
if (!(Test-Path -LiteralPath $javaRoot)) {
    Expand-Archive -LiteralPath $javaZip -DestinationPath $javaRoot
}
$vlcLibrary = Join-Path $vlcRoot "vlc-$VlcVersion/libvlc.dll"
$vlcLicense = Join-Path $vlcRoot "vlc-$VlcVersion/COPYING.txt"
$javaExecutable = Join-Path $javaRoot 'jdk8u504-b01-jre/bin/java.exe'
$javaLicense = Join-Path $javaRoot 'jdk8u504-b01-jre/LICENSE'
if (!(Test-Path -LiteralPath $vlcLibrary)) { throw "Missing $vlcLibrary" }
if (!(Test-Path -LiteralPath $vlcLicense)) { throw "Missing $vlcLicense" }
if (!(Test-Path -LiteralPath $javaExecutable)) { throw "Missing $javaExecutable" }
if (!(Test-Path -LiteralPath $javaLicense)) { throw "Missing $javaLicense" }
Write-Host "VLC runtime: $vlcRoot"
Write-Host "Java runtime: $javaRoot"
