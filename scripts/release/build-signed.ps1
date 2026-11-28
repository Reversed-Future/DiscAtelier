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
$previousFlags = $env:CARGO_ENCODED_RUSTFLAGS
try {
    # Keep crash locations useful without publishing the build account or checkout path.
    $separator = [char]31
    $flags = @()
    if ($previousFlags) { $flags = @($previousFlags.Split($separator)) }
    elseif ($env:RUSTFLAGS) { $flags = @($env:RUSTFLAGS -split '\s+' | Where-Object { $_ }) }
    $profilePath = [Environment]::GetFolderPath('UserProfile')
    $env:CARGO_ENCODED_RUSTFLAGS = (@($flags) + "--remap-path-prefix=$profilePath=/build-user" + "--remap-path-prefix=$root=/src/DiscAtelier") -join $separator
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
    $env:CARGO_ENCODED_RUSTFLAGS = $previousFlags
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    $env:TAURI_SIGNING_PRIVATE_KEY = $previousKey
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $previousPassword
}
