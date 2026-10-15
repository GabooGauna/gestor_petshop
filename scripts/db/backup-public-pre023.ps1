[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$PgPassFile,
  [string]$ProjectRef = 'xueodcsudebgflvvozti',
  [string]$HostName = 'aws-0-sa-east-1.pooler.supabase.com',
  [int]$Port = 5432,
  [string]$Image = 'public.ecr.aws/supabase/postgres:17.11.0.004',
  [string]$BackupRoot = (Join-Path $env:LOCALAPPDATA 'PetStock\Backups')
)

$ErrorActionPreference = 'Stop'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDirectory = Join-Path $BackupRoot "pre-023-$timestamp"
$archiveName = 'petstock-public-pre023.dump'
$archivePath = Join-Path $backupDirectory $archiveName
$encryptedPath = "$archivePath.dpapi"
$tocPath = Join-Path $backupDirectory 'petstock-public-pre023.toc.txt'
$manifestPath = Join-Path $backupDirectory 'manifest.json'
$containerName = "petstock-backup-023-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
$databaseUser = "postgres.$ProjectRef"
$entropyLabel = 'PetStock migration 023 backup v1'
$containerStarted = $false
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is required and was not found.'
}
if ($ProjectRef -notmatch '^[a-z0-9]{20}$') { throw 'Invalid Supabase project reference.' }
if ($HostName -notmatch '^[a-zA-Z0-9.-]+$') { throw 'Invalid database host.' }
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Invalid database port.' }
if (Test-Path -LiteralPath $backupDirectory) { throw "Backup directory already exists: $backupDirectory" }
$pgPassResolved = (Resolve-Path -LiteralPath $PgPassFile -ErrorAction Stop).Path
if ($pgPassResolved.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The temporary PGPASSFILE must remain outside the repository.'
}

function Invoke-CapturedProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FileName,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$StandardInput,
    [switch]$AllowFailure
  )

  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $FileName
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.RedirectStandardInput = $null -ne $StandardInput
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  $psi.StandardOutputEncoding = $utf8NoBom
  $psi.StandardErrorEncoding = $utf8NoBom
  if ($null -ne $StandardInput) { $psi.StandardInputEncoding = $utf8NoBom }
  foreach ($argument in $Arguments) { [void]$psi.ArgumentList.Add($argument) }

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $psi
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  if ($null -ne $StandardInput) {
    $process.StandardInput.Write($StandardInput)
    $process.StandardInput.Close()
  }
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0 -and -not $AllowFailure) {
    throw "$FileName failed with exit code $($process.ExitCode): $stderr"
  }
  [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout; Stderr = $stderr }
}

New-Item -ItemType Directory -Path $backupDirectory | Out-Null

try {
  $pgpass = [IO.File]::ReadAllText($pgPassResolved, [Text.Encoding]::UTF8)
  if ([string]::IsNullOrWhiteSpace($pgpass)) { throw 'The temporary PGPASSFILE is empty.' }

  $run = Invoke-CapturedProcess docker @(
    'run', '--detach', '--name', $containerName,
    '--mount', "type=bind,source=$backupDirectory,target=/backup",
    $Image, 'sleep', 'infinity'
  )
  $containerStarted = $true

  Invoke-CapturedProcess docker @(
    'exec', '--interactive', $containerName,
    'sh', '-c', 'umask 077 && cat > /tmp/pgpass'
  ) -StandardInput $pgpass | Out-Null
  $pgpass = $null

  $probe = Invoke-CapturedProcess docker @(
    'exec',
    '--env', 'PGPASSFILE=/tmp/pgpass',
    '--env', 'PGSSLMODE=require',
    '--env', 'PGAPPNAME=petstock_pre023_backup',
    $containerName,
    'psql', '--no-psqlrc', '--no-align', '--tuples-only', '--set=ON_ERROR_STOP=1',
    '--host', $HostName, '--port', "$Port", '--username', $databaseUser,
    '--dbname', 'postgres',
    '--command', "select current_setting('server_version') || '|' || current_database();"
  )
  if ($probe.Stdout.Trim() -ne '17.11|postgres') {
    throw "Unexpected remote database probe: $($probe.Stdout.Trim())"
  }

  $dump = Invoke-CapturedProcess docker @(
    'exec',
    '--env', 'PGPASSFILE=/tmp/pgpass',
    '--env', 'PGSSLMODE=require',
    '--env', 'PGAPPNAME=petstock_pre023_backup',
    $containerName,
    'pg_dump', '--format=custom', '--compress=9', '--serializable-deferrable',
    '--lock-wait-timeout=10000', '--no-owner', '--schema=public',
    '--host', $HostName, '--port', "$Port", '--username', $databaseUser,
    '--dbname', 'postgres', '--file', "/backup/$archiveName"
  )
  if ($dump.Stderr) { Write-Host $dump.Stderr.TrimEnd() }

  Invoke-CapturedProcess docker @('exec', $containerName, 'rm', '-f', '/tmp/pgpass') | Out-Null

  $toc = Invoke-CapturedProcess docker @('exec', $containerName, 'pg_restore', '--list', "/backup/$archiveName")
  [IO.File]::WriteAllText($tocPath, $toc.Stdout, [Text.UTF8Encoding]::new($false))
  $tableData = @($toc.Stdout -split "`r?`n" | Where-Object { $_ -match ' TABLE DATA public ' })
  $expectedTables = @(
    'categories', 'inventory_movements', 'product_presentations', 'products',
    'purchase_items', 'purchases', 'sale_items', 'sales', 'suppliers'
  )
  $actualTables = @($tableData | ForEach-Object {
    if ($_ -match ' TABLE DATA public ([^ ]+) ') { $Matches[1] }
  } | Sort-Object)
  if (($actualTables -join '|') -ne (($expectedTables | Sort-Object) -join '|')) {
    throw "Unexpected TABLE DATA set in backup: $($actualTables -join ', ')"
  }
  if ($toc.Stdout -match ' (auth|storage) ' -or $toc.Stdout -match 'postgres(?:ql)?://\S+:\S+@|password\s*=') {
    throw 'The backup TOC contains a managed schema or possible secret.'
  }

  $archiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
  $archiveLength = (Get-Item -LiteralPath $archivePath).Length
  Add-Type -AssemblyName System.Security
  $entropy = [Text.Encoding]::UTF8.GetBytes($entropyLabel)
  $archiveBytes = [IO.File]::ReadAllBytes($archivePath)
  $encryptedBytes = [Security.Cryptography.ProtectedData]::Protect(
    $archiveBytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  [IO.File]::WriteAllBytes($encryptedPath, $encryptedBytes)
  $roundTrip = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes($encryptedPath), $entropy,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  $roundTripHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($roundTrip)).ToLowerInvariant()
  if ($roundTripHash -ne $archiveHash) { throw 'DPAPI round-trip hash verification failed.' }

  $manifest = [ordered]@{
    created_at = (Get-Date).ToString('o')
    source_project_ref = $ProjectRef
    source_host = $HostName
    source_database = 'postgres'
    source_postgres_version = '17.11'
    tool_image = $Image
    scope = 'public schema and data only'
    archive = (Split-Path -Leaf $encryptedPath)
    archive_plaintext_sha256 = $archiveHash
    archive_plaintext_bytes = $archiveLength
    encryption = 'Windows DPAPI CurrentUser'
    entropy_label = $entropyLabel
    table_data = $actualTables
    toc_entries = @($toc.Stdout -split "`r?`n" | Where-Object { $_ -match '^\d+;' }).Count
  }
  [IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 4),
    [Text.UTF8Encoding]::new($false)
  )

  Remove-Item -LiteralPath $archivePath -Force
  $archiveBytes = $null
  $encryptedBytes = $null
  $roundTrip = $null

  & icacls $backupDirectory '/inheritance:r' '/grant:r' "$env:USERDOMAIN\$env:USERNAME`:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to restrict backup ACLs.' }

  Write-Host "BACKUP_DIRECTORY=$backupDirectory"
  Write-Host "ENCRYPTED_ARCHIVE=$encryptedPath"
  Write-Host "PLAINTEXT_SHA256=$archiveHash"
  Write-Host "TABLE_DATA_COUNT=$($actualTables.Count)"
  Write-Host 'PASS: encrypted public backup created and verified; plaintext and credential removed.'
} finally {
  $pgpass = $null
  if ($containerStarted) {
    Invoke-CapturedProcess docker @('exec', $containerName, 'rm', '-f', '/tmp/pgpass') -AllowFailure | Out-Null
    Invoke-CapturedProcess docker @('rm', '--force', $containerName) -AllowFailure | Out-Null
  }
  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }
  if (Test-Path -LiteralPath $pgPassResolved) {
    Remove-Item -LiteralPath $pgPassResolved -Force
  }
}
