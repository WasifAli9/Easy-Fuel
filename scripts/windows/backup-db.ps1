param(
  [Parameter(Mandatory = $true)] [string] $DatabaseUrl,
  [Parameter(Mandatory = $true)] [string] $OutputFile
)

$env:DATABASE_URL = $DatabaseUrl

Write-Host "Backing up database to $OutputFile ..."
pg_dump --format=custom --dbname="$env:DATABASE_URL" --file="$OutputFile"

if ($LASTEXITCODE -ne 0) {
  Write-Error "Backup failed."
  exit 1
}

Write-Host "Backup completed."
