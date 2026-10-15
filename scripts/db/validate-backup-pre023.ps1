[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BackupDirectory,
  [string]$Image = 'public.ecr.aws/supabase/postgres:17.11.0.004'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backupResolved = (Resolve-Path -LiteralPath $BackupDirectory -ErrorAction Stop).Path
$encryptedPath = Join-Path $backupResolved 'petstock-public-pre023.dump.dpapi'
$manifestPath = Join-Path $backupResolved 'manifest.json'
$archivePath = Join-Path $backupResolved 'petstock-public-pre023.restore.dump'
$plainSqlPath = Join-Path $backupResolved 'petstock-public-pre023.restore.sql'
$containerName = "petstock-validate-023-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
$databaseName = 'petstock_e2e_current_023'
$containerStarted = $false

if ($backupResolved.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The production-derived backup must remain outside the repository.'
}
if (-not (Test-Path -LiteralPath $encryptedPath -PathType Leaf)) { throw 'Encrypted archive not found.' }
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Backup manifest not found.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is required and was not found.' }
if ((Test-Path -LiteralPath $archivePath) -or (Test-Path -LiteralPath $plainSqlPath)) {
  throw 'A plaintext restore artifact already exists; inspect and remove it before retrying.'
}

function Invoke-CapturedProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FileName,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$AllowFailure
  )

  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $FileName
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $utf8NoBom = [Text.UTF8Encoding]::new($false)
  $psi.StandardOutputEncoding = $utf8NoBom
  $psi.StandardErrorEncoding = $utf8NoBom
  foreach ($argument in $Arguments) { [void]$psi.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $psi
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0 -and -not $AllowFailure) {
    throw "$FileName failed with exit code $($process.ExitCode): $stderr"
  }
  [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout; Stderr = $stderr }
}

try {
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  if ($manifest.encryption -ne 'Windows DPAPI CurrentUser' -or
      $manifest.entropy_label -ne 'PetStock migration 023 backup v1') {
    throw 'Unexpected backup encryption contract.'
  }

  Add-Type -AssemblyName System.Security
  $entropy = [Text.Encoding]::UTF8.GetBytes($manifest.entropy_label)
  $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes($encryptedPath), $entropy,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  $plainHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($plainBytes)).ToLowerInvariant()
  if ($plainHash -ne $manifest.archive_plaintext_sha256) {
    throw 'Decrypted archive hash does not match the verified manifest.'
  }
  [IO.File]::WriteAllBytes($archivePath, $plainBytes)
  $plainBytes = $null

  Invoke-CapturedProcess docker @(
    'run', '--detach', '--name', $containerName,
    '--env', 'POSTGRES_PASSWORD=petstock-local-only',
    '--mount', "type=bind,source=$backupResolved,target=/backup",
    $Image
  ) | Out-Null
  $containerStarted = $true

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    $health = Invoke-CapturedProcess docker @(
      'inspect', '--format', '{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}',
      $containerName
    ) -AllowFailure
    if ($health.ExitCode -eq 0 -and $health.Stdout.Trim() -eq 'true|healthy') {
      Start-Sleep -Seconds 6
      $stableHealth = Invoke-CapturedProcess docker @(
        'inspect', '--format', '{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}',
        $containerName
      ) -AllowFailure
      $probe = Invoke-CapturedProcess docker @(
        'exec', $containerName, 'pg_isready', '--host', '/var/run/postgresql', '--username', 'postgres'
      ) -AllowFailure
      if ($stableHealth.ExitCode -eq 0 -and $stableHealth.Stdout.Trim() -eq 'true|healthy' -and
          $probe.ExitCode -eq 0) {
        $ready = $true
        break
      }
    }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) { throw 'Disposable PostgreSQL container did not become ready.' }

  Invoke-CapturedProcess docker @(
    'exec', $containerName, 'createdb', '--host', '/var/run/postgresql', '--username', 'postgres', $databaseName
  ) | Out-Null
  $authRuntime = @'
create schema if not exists auth;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
drop schema public cascade;
'@
  Invoke-CapturedProcess docker @(
    'exec', $containerName, 'psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
    '--host', '/var/run/postgresql', '--username', 'postgres', '--dbname', $databaseName,
    '--command', $authRuntime
  ) | Out-Null
  Invoke-CapturedProcess docker @(
    'exec', $containerName, 'pg_restore', '--file', '/backup/petstock-public-pre023.restore.sql',
    '/backup/petstock-public-pre023.restore.dump'
  ) | Out-Null

  $previousPgOptions = $env:PGOPTIONS
  try {
    $env:PGOPTIONS = '-c petstock.environment=e2e'
    & (Join-Path $PSScriptRoot 'validate-migrations-018-020.ps1') `
      -Connection "dbname=$databaseName host=/var/run/postgresql user=supabase_admin" `
      -BaselinePath $plainSqlPath `
      -Current023 `
      -DockerContainer $containerName
    if ($LASTEXITCODE -ne 0) { throw "Migration validation runner failed with exit code $LASTEXITCODE." }
  } finally {
    $env:PGOPTIONS = $previousPgOptions
  }

  Write-Host "BACKUP_SHA256=$plainHash"
  Write-Host 'PASS: encrypted production backup restored; migration 023 and all SQL contracts passed.'
} finally {
  $plainBytes = $null
  if ($containerStarted) {
    Invoke-CapturedProcess docker @('rm', '--force', $containerName) -AllowFailure | Out-Null
  }
  foreach ($temporaryPath in @($archivePath, $plainSqlPath)) {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
}
