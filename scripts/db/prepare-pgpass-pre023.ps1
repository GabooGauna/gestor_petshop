[CmdletBinding()]
param(
  [string]$ProjectRef = 'xueodcsudebgflvvozti',
  [string]$HostName = 'aws-0-sa-east-1.pooler.supabase.com',
  [int]$Port = 5432,
  [string]$Destination = (Join-Path $env:LOCALAPPDATA 'PetStock\Credentials\pre023.pgpass')
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$databaseUser = "postgres.$ProjectRef"
$destinationDirectory = Split-Path -Parent $Destination

if ($ProjectRef -notmatch '^[a-z0-9]{20}$') { throw 'Invalid Supabase project reference.' }
if ($HostName -notmatch '^[a-zA-Z0-9.-]+$') { throw 'Invalid database host.' }
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Invalid database port.' }
if ([IO.Path]::GetFullPath($Destination).StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The temporary PGPASSFILE must remain outside the repository.'
}

function Escape-PgPassValue([string]$Value) {
  $Value.Replace('\', '\\').Replace(':', '\:')
}

New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
& icacls $destinationDirectory '/inheritance:r' '/grant:r' "$env:USERDOMAIN\$env:USERNAME`:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to restrict credential directory ACLs.' }

if (Test-Path -LiteralPath $Destination) {
  throw "A temporary credential already exists and was not overwritten: $Destination"
}

$securePassword = Read-Host 'Contraseña NUEVA de la base Supabase (entrada oculta)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  if ([string]::IsNullOrEmpty($plainPassword)) { throw 'The database password cannot be empty.' }
  $line = "$(Escape-PgPassValue $HostName):$Port`:postgres:$(Escape-PgPassValue $databaseUser):$(Escape-PgPassValue $plainPassword)`n"
  [IO.File]::WriteAllText($Destination, $line, [Text.UTF8Encoding]::new($false))
} finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  $plainPassword = $null
  $securePassword = $null
  $line = $null
}

& icacls $Destination '/inheritance:r' '/grant:r' "$env:USERDOMAIN\$env:USERNAME`:F" '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
if ($LASTEXITCODE -ne 0) {
  Remove-Item -LiteralPath $Destination -Force
  throw 'Failed to restrict temporary PGPASSFILE ACLs.'
}

Write-Host ''
Write-Host 'Credencial temporal creada con ACL restringida.'
Write-Host "Ruta: $Destination"
Write-Host 'No se probó la conexión ni se inició el respaldo.'
Read-Host 'Presioná Enter para cerrar esta ventana'
