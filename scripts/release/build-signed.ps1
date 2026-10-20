param([string]$SigningDirectory = (Join-Path $env:LOCALAPPDATA 'DiscAtelierSigning'))
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$privateKey = Join-Path $SigningDirectory 'updater.key'
$passwordFile = Join-Path $SigningDirectory 'password.dpapi'
if (!(Test-Path -LiteralPath $privateKey) -or !(Test-Path -LiteralPath $passwordFile)) {
    throw 'Missing signing key or Windows-protected password. Restore the existing signing identity; do not replace it.'
}
$secret = (Get-Content -Raw -LiteralPath $passwordFile).Trim() | ConvertTo-SecureString
$passwordPointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$previousKey = $env:TAURI_SIGNING_PRIVATE_KEY
$previousPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
try {
    $env:TAURI_SIGNING_PRIVATE_KEY = $privateKey
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    Push-Location $root
    try {
        npm run release:notices
        if ($LASTEXITCODE -ne 0) { throw 'Dependency notice generation failed' }
        npm run release:check
        if ($LASTEXITCODE -ne 0) { throw 'Release preflight failed' }
        npm run release:build
        if ($LASTEXITCODE -ne 0) { throw 'Signed release build failed' }
    } finally { Pop-Location }
} finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    $env:TAURI_SIGNING_PRIVATE_KEY = $previousKey
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $previousPassword
}
