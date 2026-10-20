$ErrorActionPreference = 'Stop'
$testRoot = Join-Path $PSScriptRoot 'target\dvd-menu-test'
$executable = Join-Path $testRoot 'discatelier-desktop.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw 'DVD 测试构建不存在。请先完成测试版构建。'
}
$expectedHash = 'FBC6E3886BED3F517495A443F07A168067A1F41EA5E2777E4EFB4C5EE58D00D4'
if ((Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash -ne $expectedHash) {
    throw '测试构建与此入口不一致，已停止启动，避免误用正式收藏库。'
}
if (Get-Process -Name 'discatelier-desktop' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $executable }) {
    throw 'DVD 测试窗口已经打开，请在该窗口继续操作。'
}
$savedData = $env:DISCATELIER_TEST_DATA_DIR
$savedWebview = $env:WEBVIEW2_USER_DATA_FOLDER
try {
    # User-run interactive app; independent persistent library and WebView profile.
    # Never copy, reset, or delete an existing library.
    $env:DISCATELIER_TEST_DATA_DIR = Join-Path $testRoot 'library'
    $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $testRoot 'webview'
    Start-Process -FilePath $executable -WorkingDirectory $PSScriptRoot
    Write-Host "DVD 测试库：$env:DISCATELIER_TEST_DATA_DIR"
}
finally {
    $env:DISCATELIER_TEST_DATA_DIR = $savedData
    $env:WEBVIEW2_USER_DATA_FOLDER = $savedWebview
}
