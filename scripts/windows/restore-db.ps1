param(
  [Parameter(Mandatory = $true)] [string] $DatabaseUrl,
  [Parameter(Mandatory = $true)] [string] $BackupFile
)

$env:DATABASE_URL = $DatabaseUrl

Write-Host "Restoring database from $BackupFile ..."
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$env:DATABASE_URL" "$BackupFile"

if ($LASTEXITCODE -ne 0) {
  Write-Error "Restore failed."
  exit 1
}

Write-Host "Restore completed."
