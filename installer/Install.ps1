$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'KSeFUpdater'
$helper = Join-Path $root 'helper'
$extension = Join-Path $root 'extension'
$source = Join-Path (Split-Path $PSScriptRoot -Parent) 'extension'
$expectedId = 'oinnmnoanfppijpbgacpoojmdioaicmj'
try {
    . (Join-Path $PSScriptRoot 'Update-Core.ps1')
    $manifest = Read-ExtensionManifest $source
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = $sha.ComputeHash([Convert]::FromBase64String($manifest.key)) } finally { $sha.Dispose() }
    $hex = ([BitConverter]::ToString($hash)).Replace('-','').Substring(0,32).ToLowerInvariant()
    $id = -join ($hex.ToCharArray() | ForEach-Object { [char](97 + [Convert]::ToInt32([string]$_,16)) })
    if ($id -ne $expectedId) { throw 'Unexpected extension identity.' }
    New-Item -ItemType Directory -Path $helper -Force | Out-Null
    if (-not (Test-Path -LiteralPath $extension)) {
        Copy-Item -LiteralPath $source -Destination $extension -Recurse
    } else {
        Write-Host 'Wtyczka jest juz zainstalowana. Zachowano jej obecne pliki i dane.'
    }
    foreach ($name in @('NativeHost.ps1','Update-Core.ps1','Uninstall.ps1')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $helper -Force
    }
    $launcher = '@echo off' + "`r`n" + '"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0NativeHost.ps1"' + "`r`n"
    [IO.File]::WriteAllText((Join-Path $helper 'host.cmd'), $launcher, [Text.Encoding]::ASCII)
    $hostManifest = @{
        name = 'com.ksef_pobieranie.updater'; description = 'KSeF automatic extension updater'
        path = (Join-Path $helper 'host.cmd'); type = 'stdio'
        allowed_origins = @("chrome-extension://$expectedId/")
    }
    $hostFile = Join-Path $helper 'host.json'
    [IO.File]::WriteAllText($hostFile, ($hostManifest | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    $registryPath = 'Software\Microsoft\Edge\NativeMessagingHosts\com.ksef_pobieranie.updater'
    $registryKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($registryPath)
    try { $registryKey.SetValue('', $hostFile, [Microsoft.Win32.RegistryValueKind]::String) } finally { $registryKey.Dispose() }
    Set-Clipboard -Value $extension
    Write-Host ''
    Write-Host 'Gotowe. Folder wtyczki skopiowano do schowka:'
    Write-Host $extension
    Write-Host ''
    Write-Host '1. W Edge otworz edge://extensions i wlacz Tryb dewelopera.'
    Write-Host '2. Wylacz stara kopie wtyczki. Kliknij Zaladuj rozpakowane.'
    Write-Host '3. Wklej powyzszy folder (Ctrl+V) i zatwierdz.'
    Write-Host '4. Odswiez otwarte strony Symfonii.'
    Write-Host 'Nowe wersje beda sprawdzane co godzine, gdy Edge jest uruchomiony.'
    Write-Host 'Poprzednie ustawienia starej kopii nie sa automatycznie przenoszone.'
    Start-Process explorer.exe -ArgumentList ('"' + $root + '"')
} catch {
    Write-Host ('BLAD: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
