$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../installer/Update-Core.ps1')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('ksef-snapshot-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$source = Join-Path $PSScriptRoot '../extension'
$installedRoot = Join-Path $testRoot 'installed'
New-Item -ItemType Directory -Path $installedRoot | Out-Null
Copy-Item -LiteralPath $source -Destination (Join-Path $installedRoot 'extension') -Recurse
function Write-Version([string]$Path, [string]$Version) {
    $manifest = Get-Content -LiteralPath (Join-Path $source 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $manifest.version = $Version
    [IO.File]::WriteAllText($Path, ($manifest | ConvertTo-Json -Depth 20))
}
Write-Version (Join-Path $installedRoot 'extension/manifest.json') '1.0.10'
$archiveSource = Join-Path $testRoot 'archive-source/repo-fixed/extension'
New-Item -ItemType Directory -Path (Split-Path $archiveSource -Parent) -Force | Out-Null
Copy-Item -LiteralPath $source -Destination $archiveSource -Recurse
Write-Version (Join-Path $archiveSource 'manifest.json') '1.0.11'
$script:archiveFile = Join-Path $testRoot 'fixed.zip'
$archiveRoot = Join-Path $testRoot 'archive-source'
$zip = [IO.Compression.ZipFile]::Open($script:archiveFile, 'Create')
try {
    Get-ChildItem -LiteralPath $archiveRoot -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($archiveRoot.Length).TrimStart('\').Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $relative) | Out-Null
    }
} finally { $zip.Dispose() }
$script:commit = 'a' * 40
$script:requests = @()
# Simulate main advancing to a newer version while the fixed commit stays 1.0.11.
function Get-RemoteFile([string]$Url, [string]$Destination, [long]$Limit) {
    $script:requests += $Url
    if ($Url -match '/main/extension/manifest.json') { Write-Version $Destination '1.0.12'; return }
    if ($Url -match '/git/ref/heads/main') {
        [IO.File]::WriteAllText($Destination, ('{"object":{"sha":"' + $script:commit + '"}}')); return
    }
    if ($Url -eq ('https://raw.githubusercontent.com/dwacwelesixseven-coder/wtyczka1/' + $script:commit + '/extension/manifest.json')) {
        Write-Version $Destination '1.0.11'; return
    }
    if ($Url -eq ('https://codeload.github.com/dwacwelesixseven-coder/wtyczka1/zip/' + $script:commit)) {
        Copy-Item -LiteralPath $script:archiveFile -Destination $Destination; return
    }
    throw ('Unexpected URL: ' + $Url)
}
$result = Invoke-KsefUpdate $installedRoot
if (-not $result.updated -or $result.version -ne '1.0.11') { throw 'Snapshot update failed.' }
if ($script:requests.Count -ne 4) { throw 'Unexpected download count.' }
if (@($script:requests | Where-Object { $_ -match '/zip/refs/heads/' }).Count) { throw 'Mutable branch archive requested.' }
if ((Read-ExtensionManifest (Join-Path $installedRoot 'previous-extension')).version -ne '1.0.10') { throw 'Backup not preserved.' }
Write-Output 'PASS: changing branch metadata cannot mix pinned manifest and archive; backup preserved.'
Write-Output ('Fixtures retained: ' + $testRoot)
