$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
$container = docker compose ps -q db
if (-not $container) { throw 'PostgreSQL Docker container is not running' }
Write-Host "LOCAL DB STATUS (does not modify any data)"
$sql = @'
SELECT 'tracks_total' AS metric, count(*)::text AS value FROM tracks
UNION ALL SELECT 'tracks_r2', count(*)::text FROM tracks WHERE storage_driver='r2'
UNION ALL SELECT 'tracks_local', count(*)::text FROM tracks WHERE storage_driver='local'
UNION ALL SELECT 'r2_audio_bytes', coalesce(sum(size_bytes),0)::text FROM tracks WHERE storage_driver='r2'
UNION ALL SELECT 'covers_local', count(*)::text FROM tracks WHERE cover_key IS NOT NULL AND cover_storage_driver='local'
UNION ALL SELECT 'playlists', count(*)::text FROM playlists
UNION ALL SELECT 'users', count(*)::text FROM users
ORDER BY metric;
'@
$sql | docker exec -i $container psql -v ON_ERROR_STOP=1 -U vibebox -d vibebox -X -A -F ' : '
if ($LASTEXITCODE -ne 0) { throw 'Database audit failed' }
Write-Host 'IMPORTANT: production host needs 0 tracks_local and 0 covers_local.'
