param([string] $BackupDir = 'backups')
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
$container = docker compose ps -q db
if (-not $container) { throw 'PostgreSQL Docker container is not running' }
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$file = Join-Path (Resolve-Path $BackupDir) "music-fuq-me-$stamp.dump"
$remote = '/tmp/music-fuq-me-export.dump'
try {
  docker exec $container pg_dump -U vibebox -d vibebox -Fc -f $remote
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
  docker cp "${container}:$remote" $file
  if ($LASTEXITCODE -ne 0) { throw 'docker cp failed' }
  if ((Get-Item $file).Length -lt 1024) { throw 'Dump unexpectedly small; not safe to use' }
  $hash = (Get-FileHash -Algorithm SHA256 $file).Hash
  Write-Host "DATABASE DUMP: $file"
  Write-Host "SHA256: $hash"
  Write-Host 'The dump contains private data; keep it outside the public GitHub repository.'
} finally {
  docker exec $container rm -f $remote | Out-Null
}
