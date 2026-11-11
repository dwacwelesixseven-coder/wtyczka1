# Disconnect the helper without deleting extension data or downloaded invoices.
$ErrorActionPreference = 'Stop'
$registryPath = 'Software\Microsoft\Edge\NativeMessagingHosts\com.ksef_pobieranie.updater'
[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKey($registryPath, $false)
Write-Host 'Pomocnik aktualizacji zostal odlaczony. Wtyczka i jej dane zostaly zachowane.'
Write-Host 'Mozesz tez wylaczyc aktualizacje przelacznikiem w oknie wtyczki.'
