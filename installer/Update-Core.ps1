Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Assert-ManagedChild([string]$Root, [string]$Child) {
    $rootPath = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    $childPath = [IO.Path]::GetFullPath($Child)
    if (-not $childPath.StartsWith($rootPath + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Path outside installation folder.' }
    if ((Get-Item -LiteralPath $rootPath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Installation folder must not be a link.' }
    if (Test-Path -LiteralPath $childPath) {
        $items = @((Get-Item -LiteralPath $childPath)) + @(Get-ChildItem -LiteralPath $childPath -Recurse -Force)
        if (@($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Managed folders must not contain links.' }
    }
}

function Read-ExtensionManifest([string]$Folder) {
    $m = Get-Content -LiteralPath (Join-Path $Folder 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($m.manifest_version -ne 3 -or -not $m.key -or $m.version -notmatch '^\d+(\.\d+){1,3}$') { throw 'Invalid extension manifest.' }
    $v = @($m.version.Split('.') | ForEach-Object { [int]$_ })
    if (@($v | Where-Object { $_ -gt 65535 }).Count) { throw 'Invalid version component.' }
    return $m
}

function Get-VersionTuple([string]$Text) {
    $v = @($Text.Split('.') | ForEach-Object { [int]$_ })
    while ($v.Count -lt 4) { $v += 0 }
    return [version]($v -join '.')
}

function Get-RemoteFile([string]$Url, [string]$Destination, [long]$Limit) {
    # These URLs are fixed by the helper, never supplied by a webpage or message.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $request = [Net.HttpWebRequest]::Create($Url)
    $request.UserAgent = 'KSeF-Extension-Updater/1.0'
    $request.Timeout = 30000
    $request.ReadWriteTimeout = 30000
    $request.AllowAutoRedirect = $false
    $response = $null; $inputStream = $null; $outputStream = $null
    try {
        $response = $request.GetResponse()
        if ([int]$response.StatusCode -ne 200) { throw 'Download failed.' }
        if ($response.ContentLength -gt $Limit) { throw 'Download is too large.' }
        $inputStream = $response.GetResponseStream()
        $outputStream = [IO.File]::Create($Destination)
        $buffer = New-Object byte[] 16384
        [long]$total = 0
        while (($count = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $total += $count
            if ($total -gt $Limit) { throw 'Download is too large.' }
            $outputStream.Write($buffer, 0, $count)
        }
    } finally {
        if ($outputStream) { $outputStream.Dispose() }
        if ($inputStream) { $inputStream.Dispose() }
        if ($response) { $response.Dispose() }
    }
}

function Expand-ExtensionArchive([string]$ZipPath, [string]$Destination) {
    $zip = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        $manifests = @($zip.Entries | Where-Object { $_.FullName -match '^[^/]+/extension/manifest\.json$' })
        if ($manifests.Count -ne 1) { throw 'Archive must contain one extension/manifest.json.' }
        $prefix = $manifests[0].FullName.Substring(0, $manifests[0].FullName.Length - 'manifest.json'.Length)
        $root = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
        $seen = @{}; [long]$total = 0
        foreach ($entry in $zip.Entries) {
            if (-not $entry.FullName.StartsWith($prefix, [StringComparison]::Ordinal)) { continue }
            $relative = $entry.FullName.Substring($prefix.Length)
            if (-not $relative -or $relative.EndsWith('/')) { continue }
            # Refuse traversal, alternate streams, executable files and ambiguous Windows names.
            if ($relative.Contains('\') -or $relative.Contains(':') -or $relative -match '(^|/)(\.{1,2}|[^/]*[. ])(/|$)') { throw 'Unsafe archive path.' }
            foreach ($segment in $relative.Split('/')) {
                if ($segment -match '[<>"|?*\x00-\x1f]' -or $segment -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') { throw 'Unsafe Windows filename.' }
            }
            if ([IO.Path]::GetExtension($relative) -notin @('.js','.json','.html','.css','.png','.jpg','.jpeg','.gif','.svg','.webp','.ico','.txt','.woff','.woff2')) { throw 'Unexpected file type in extension.' }
            $target = [IO.Path]::GetFullPath((Join-Path $Destination $relative))
            if (-not $target.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or $seen.ContainsKey($target)) { throw 'Unsafe or duplicate archive path.' }
            $seen[$target] = $true
            $total += $entry.Length
            if ($seen.Count -gt 2000 -or $total -gt 30MB) { throw 'Extracted extension is too large.' }
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
        }
    } finally { $zip.Dispose() }
}

function Install-ExtensionCandidate([string]$Candidate, [string]$Root) {
    $installed = Join-Path $Root 'extension'
    $backup = Join-Path $Root 'previous-extension'
    Assert-ManagedChild $Root $installed
    Assert-ManagedChild $Root $backup
    Assert-ManagedChild $Root $Candidate
    $newManifest = Read-ExtensionManifest $Candidate
    $oldManifest = Read-ExtensionManifest $installed
    if ($newManifest.key -ne $oldManifest.key) { throw 'Extension identity changed. Keep the original manifest key.' }
    if ((Get-VersionTuple $newManifest.version) -le (Get-VersionTuple $oldManifest.version)) { return $false }
    # Keep native updater support in every release.
    if ('nativeMessaging' -notin $newManifest.permissions -or 'alarms' -notin $newManifest.permissions -or
        -not (Test-Path -LiteralPath (Join-Path $Candidate 'auto-update.js'))) { throw 'New version lacks updater support.' }
    if ((Get-Item -LiteralPath $installed).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Extension folder must not be a link.' }
    # Preserve the extension root path (and its ID/storage) while replacing its contents.
    if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
    Copy-Item -LiteralPath $installed -Destination $backup -Recurse
    try {
        Get-ChildItem -LiteralPath $installed -Force | Remove-Item -Recurse -Force
        Get-ChildItem -LiteralPath $Candidate -Force | Copy-Item -Destination $installed -Recurse
        $verified = Read-ExtensionManifest $installed
        if ($verified.version -ne $newManifest.version) { throw 'Version verification failed.' }
    } catch {
        Get-ChildItem -LiteralPath $installed -Force | Remove-Item -Recurse -Force
        Get-ChildItem -LiteralPath $backup -Force | Copy-Item -Destination $installed -Recurse
        throw
    }
    return $true
}

function Invoke-KsefUpdate([string]$Root) {
    $lock = $null; $temp = $null
    try {
        $lock = [IO.File]::Open((Join-Path $Root 'update.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
        $installed = Join-Path $Root 'extension'
        $local = Read-ExtensionManifest $installed
        $temp = Join-Path $Root ('stage-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $temp | Out-Null
        $remoteFile = Join-Path $temp 'manifest.json'
        # GitHub's CDN may cache main for several minutes after publication.
        $check = [guid]::NewGuid().ToString('N')
        Get-RemoteFile ('https://raw.githubusercontent.com/dwacwelesixseven-coder/wtyczka1/main/extension/manifest.json?check=' + $check) $remoteFile 1MB
        $remote = Read-ExtensionManifest $temp
        if ((Get-VersionTuple $remote.version) -le (Get-VersionTuple $local.version)) {
            return @{ ok = $true; updated = $false; version = $local.version; message = 'Masz aktualna wersje.' }
        }
        $archive = Join-Path $temp 'release.zip'
        Get-RemoteFile ('https://codeload.github.com/dwacwelesixseven-coder/wtyczka1/zip/refs/heads/main?check=' + $check) $archive 20MB
        $candidate = Join-Path $temp 'candidate'
        New-Item -ItemType Directory -Path $candidate | Out-Null
        Expand-ExtensionArchive $archive $candidate
        $m = Read-ExtensionManifest $candidate
        if ($m.version -ne $remote.version) { throw 'Release changed during download. Will retry later.' }
        $updated = Install-ExtensionCandidate $candidate $Root
        return @{ ok = $true; updated = $updated; version = $m.version; message = 'Aktualizacja gotowa. Odswiez otwarte strony Symfonii.' }
    } finally {
        if ($temp -and (Test-Path -LiteralPath $temp)) {
            Assert-ManagedChild $Root $temp
            Remove-Item -LiteralPath $temp -Recurse -Force
        }
        if ($lock) { $lock.Dispose() }
    }
}
