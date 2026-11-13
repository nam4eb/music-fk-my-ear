param([Parameter(Mandatory=$true)][string]$ApiUrl)
$ErrorActionPreference = 'Stop'
if (-not $ApiUrl.StartsWith('https://')) { throw 'Production URL must use HTTPS' }
$ApiUrl = $ApiUrl.TrimEnd('/')
$alive = Invoke-RestMethod -Uri "$ApiUrl/health" -TimeoutSec 45
$ready = Invoke-RestMethod -Uri "$ApiUrl/ready" -TimeoutSec 45
if ($alive.ok -ne $true -or $alive.storage -ne 'r2' -or $ready.ready -ne $true) {
  throw 'Production API is not ready with R2 and PostgreSQL'
}
$config = Invoke-RestMethod -Uri "$ApiUrl/api/config" -TimeoutSec 45
if (-not $config.googleClientId -or $config.storageDriver -ne 'r2') { throw 'Google/R2 production configuration is missing' }
Write-Host 'PASS: HTTPS API liveness, DB readiness, R2 configuration, Google ID'
Write-Host 'NEXT: manually sign in as owner; verify library count, playlist, and playback using a single test track.'
