# No Write-Host or other text on stdout: Edge uses it for binary framed JSON.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$outputPipe = [Console]::OpenStandardOutput()
try {
    $inputPipe = [Console]::OpenStandardInput()
    $reader = New-Object IO.BinaryReader($inputPipe)
    $length = $reader.ReadUInt32()
    if ($length -gt 4096) { throw 'Request too large.' }
    $bytes = $reader.ReadBytes([int]$length)
    if ($bytes.Length -ne $length) { throw 'Incomplete request.' }
    $request = [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
    if ($request.action -ne 'update') { throw 'Unsupported action.' }
    . (Join-Path $PSScriptRoot 'Update-Core.ps1')
    $result = Invoke-KsefUpdate (Split-Path $PSScriptRoot -Parent)
} catch {
    $result = @{ ok = $false; updated = $false; error = $_.Exception.Message }
}
$json = ConvertTo-Json -InputObject $result -Compress -Depth 6
$body = [Text.Encoding]::UTF8.GetBytes($json)
$header = [BitConverter]::GetBytes([uint32]$body.Length)
$outputPipe.Write($header, 0, 4)
$outputPipe.Write($body, 0, $body.Length)
$outputPipe.Flush()
