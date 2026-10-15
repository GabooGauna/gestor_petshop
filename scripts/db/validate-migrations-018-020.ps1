[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Connection,
  [string]$BaselinePath,
  [switch]$SyntheticPre001,
  [switch]$Current022,
  [switch]$Current023,
  [string]$Psql = 'psql',
  [string]$DockerContainer
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

if ($Connection -match '(?i)postgres(?:ql)?://[^/@:]+:[^/@]+@' -or $Connection -match '(?i)(^|\s)password=') {
  throw 'Do not put passwords in -Connection. Use a temporary PGPASSFILE or an interactive prompt.'
}
if (@($SyntheticPre001, $Current022, $Current023).Where({ $_ }).Count -gt 1) {
  throw 'Use only one baseline mode: -SyntheticPre001, -Current022 or -Current023.'
}
if ($SyntheticPre001) {
  if ($BaselinePath) { throw 'Do not combine -SyntheticPre001 with -BaselinePath.' }
  $BaselinePath = Join-Path $repoRoot 'tests/sql/synthetic_pre_001_baseline.sql'
} elseif (-not $BaselinePath) {
  throw 'Supply -BaselinePath for an external dump, or use -SyntheticPre001.'
}
if (-not (Test-Path -LiteralPath $BaselinePath -PathType Leaf)) { throw "Baseline not found: $BaselinePath" }
$clientCommand = if ($DockerContainer) { 'docker' } else { $Psql }
if (-not (Get-Command $clientCommand -ErrorAction SilentlyContinue)) { throw "Database client not found: $clientCommand" }
if ($env:PGOPTIONS -notmatch '(^|\s)-c\s*petstock\.environment=e2e(\s|$)') {
  throw 'PGOPTIONS must contain: -c petstock.environment=e2e'
}

function Start-PsqlInput([string]$Sql) {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $clientCommand
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  $psi.StandardInputEncoding = $utf8NoBom
  $psi.StandardOutputEncoding = $utf8NoBom
  $psi.StandardErrorEncoding = $utf8NoBom
  if ($DockerContainer) {
    if ($DockerContainer -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]+$') { throw 'Invalid Docker container name.' }
    $psi.ArgumentList.Add('exec')
    $psi.ArgumentList.Add('-i')
    $psi.ArgumentList.Add('-e')
    $psi.ArgumentList.Add('PGOPTIONS=-c petstock.environment=e2e')
    $psi.ArgumentList.Add($DockerContainer)
    $psi.ArgumentList.Add($Psql)
  }
  $psi.ArgumentList.Add('-X')
  $psi.ArgumentList.Add('--no-psqlrc')
  $psi.ArgumentList.Add('--no-align')
  $psi.ArgumentList.Add('--tuples-only')
  $psi.ArgumentList.Add('--set=ON_ERROR_STOP=1')
  $psi.ArgumentList.Add("--dbname=$Connection")
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $psi
  [void]$process.Start()
  $outTask = $process.StandardOutput.ReadToEndAsync()
  $errTask = $process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($Sql)
  $process.StandardInput.Close()
  [pscustomobject]@{ Process = $process; OutTask = $outTask; ErrTask = $errTask }
}

function Complete-Psql($Run, [string]$Label, [bool]$AllowSqlFailure = $false) {
  if (-not $Run.Process.WaitForExit(30000)) {
    $Run.Process.Kill($true)
    throw "$Label timed out (possible database deadlock)"
  }
  $stdout = $Run.OutTask.GetAwaiter().GetResult()
  $stderr = $Run.ErrTask.GetAwaiter().GetResult()
  if ($stdout) { Write-Host $stdout.TrimEnd() }
  if ($stderr) { Write-Host $stderr.TrimEnd() }
  if ($Run.Process.ExitCode -ne 0 -and -not $AllowSqlFailure) {
    throw "$Label failed with psql exit code $($Run.Process.ExitCode)"
  }
}

function Invoke-PsqlInput([string]$Sql, [string]$Label) {
  $run = Start-PsqlInput $Sql
  Complete-Psql $run $Label
}

function Invoke-PsqlFile([string]$RelativePath, [string]$Label) {
  $path = Join-Path $repoRoot $RelativePath
  Invoke-PsqlInput ([IO.File]::ReadAllText($path)) $Label
}

$probe = @'
select current_database() || '|' || coalesce(inet_server_addr()::text, 'local-socket') || '|' ||
       coalesce(current_setting('petstock.environment', true), '');
'@
$probeRun = Start-PsqlInput $probe
if (-not $probeRun.Process.WaitForExit(30000)) {
  $probeRun.Process.Kill($true)
  throw 'Isolation probe timed out'
}
$probeOut = $probeRun.OutTask.GetAwaiter().GetResult().Trim()
$probeErr = $probeRun.ErrTask.GetAwaiter().GetResult()
if ($probeRun.Process.ExitCode -ne 0) { throw "Isolation probe failed: $probeErr" }
$parts = $probeOut.Split('|')
if ($parts.Count -ne 3 -or $parts[0] -notmatch '^petstock_(e2e|test)_[a-z0-9_]+$' -or
    $parts[1] -notin @('127.0.0.1','::1','local-socket') -or $parts[2] -ne 'e2e') {
  throw "Isolation guard rejected database='$($parts[0])', server='$($parts[1])', environment='$($parts[2])'."
}

$runtimeSql = @"
select
  (select count(*) from pg_roles where rolname in ('anon','authenticated')) || '|' ||
  case when to_regprocedure('auth.uid()') is null then '0' else '1' end;
"@
$runtimeRun = Start-PsqlInput $runtimeSql
if (-not $runtimeRun.Process.WaitForExit(30000)) {
  $runtimeRun.Process.Kill($true)
  throw 'Supabase runtime prerequisite probe timed out'
}
$runtimeOut = $runtimeRun.OutTask.GetAwaiter().GetResult().Trim()
$runtimeErr = $runtimeRun.ErrTask.GetAwaiter().GetResult()
if ($runtimeRun.Process.ExitCode -ne 0) { throw "Supabase runtime prerequisite probe failed: $runtimeErr" }
if ($runtimeOut -ne '2|1') {
  throw "Target lacks the Supabase runtime prerequisites (anon/authenticated roles and auth.uid()). Use a disposable Supabase-compatible instance; this runner does not create cluster-wide roles or auth shims. Probe='$runtimeOut'."
}

$existingSql = "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ('categories','suppliers','products','product_presentations','sales','sale_items','purchases','purchase_items','inventory_movements');"
$existingRun = Start-PsqlInput $existingSql
if (-not $existingRun.Process.WaitForExit(30000)) {
  $existingRun.Process.Kill($true)
  throw 'Empty-schema probe timed out'
}
$existing = $existingRun.OutTask.GetAwaiter().GetResult().Trim()
if ($existingRun.Process.ExitCode -ne 0 -or $existing -ne '0') {
  throw 'The disposable database is not empty. Create a fresh database; the runner never overwrites an existing schema.'
}

$baselineResolved = (Resolve-Path -LiteralPath $BaselinePath).Path
$baseline = [IO.File]::ReadAllText($baselineResolved)
$baselineHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $baselineResolved).Hash.ToLowerInvariant()
if (-not $SyntheticPre001 -and -not $Current022 -and -not $Current023 -and $baseline -match '(?im)^\s*(copy\s+|insert\s+into\s+)') {
  throw 'Baseline contains data statements. Supply a reviewed plain-text schema-only SQL dump through migration 017.'
}
if (($Current022 -or $Current023) -and $baselineResolved.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The current production-derived backup must remain outside the repository.'
}
if ($baseline -match '(?im)CREATE\s+TABLE\s+(auth|storage)\.' -or
    $baseline -match '(?im)sb_secret_|postgres(?:ql)?://\S+:\S+@|password\s*=') {
  throw 'Baseline contains a managed-schema object or possible secret.'
}
Write-Host $(if ($SyntheticPre001) { 'Restoring synthetic pre-001 test fixture...' } elseif ($Current022 -or $Current023) { 'Restoring reviewed current public backup with data...' } else { 'Restoring reviewed schema-only baseline 017...' })
Invoke-PsqlInput $baseline 'baseline restore'

if ($SyntheticPre001) {
  $through017 = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'supabase/migrations') -File |
    Where-Object { $_.Name -match '^202610(09|10)00(0[1-9]|1[0-7])_' } |
    Sort-Object Name
  if ($through017.Count -ne 17) { throw "Expected exactly 17 migrations through 017; found $($through017.Count)." }
  foreach ($migrationFile in $through017) {
    if ($migrationFile.Name -match '0005_authenticated_rls_cutover') {
      Invoke-PsqlInput @"
insert into auth.users(id)
values ('30000000-0000-4000-8000-000000000099')
on conflict (id) do nothing;
"@ 'create synthetic Auth prerequisite'
    }
    Write-Host "Applying prerequisite $($migrationFile.Name)..."
    Invoke-PsqlInput ([IO.File]::ReadAllText($migrationFile.FullName)) $migrationFile.Name
    if ($migrationFile.Name -match '0005_authenticated_rls_cutover') {
      Invoke-PsqlInput @"
delete from auth.users where id = '30000000-0000-4000-8000-000000000099';
do `$`$
begin
  if exists (select 1 from auth.users where id = '30000000-0000-4000-8000-000000000099') then
    raise exception 'PETSTOCK_SYNTHETIC_AUTH_CLEANUP_FAILED';
  end if;
end
`$`$;
"@ 'remove synthetic Auth prerequisite'
    }
  }
}
if ($Current022) {
  Invoke-PsqlFile 'tests/sql/production_preflight_022.sql' 'current 020/021 schema preflight for 022'
} elseif ($Current023) {
  Invoke-PsqlFile 'tests/sql/production_preflight_023.sql' 'current 020/021/022 schema preflight for 023'
} else {
  Invoke-PsqlFile 'tests/sql/preflight_017.sql' 'baseline 017 preflight'
}

$meta = @"
create schema if not exists petstock_test;
create table if not exists petstock_test.migration_history(
  version text primary key, sha256 text not null, applied_at timestamptz not null default clock_timestamp()
);
insert into petstock_test.migration_history(version,sha256) values('$(if ($Current023) { 'baseline_current_022' } elseif ($Current022) { 'baseline_current_021' } else { 'baseline_017' })','$baselineHash');
"@
Invoke-PsqlInput $meta 'create isolated migration history'

$migrations = if ($Current023) { @(
  @{ Version='023'; File='supabase/migrations/202610150023_configurable_presentation_min_stock.sql'; Post='tests/sql/postconditions_023.sql' }
) } elseif ($Current022) { @(
  @{ Version='022'; File='supabase/migrations/202610120022_logical_presentation_lifecycle.sql'; Post='tests/sql/postconditions_022.sql' },
  @{ Version='023'; File='supabase/migrations/202610150023_configurable_presentation_min_stock.sql'; Post='tests/sql/postconditions_023.sql' }
) } else { @(
  @{ Version='018'; File='supabase/migrations/202610110018_decimal_presentation_response.sql'; Post='tests/sql/postconditions_018.sql' },
  @{ Version='019'; File='supabase/migrations/202610110019_logical_product_removal.sql'; Post='tests/sql/postconditions_019.sql' },
  @{ Version='020'; File='supabase/migrations/202610110020_last_purchase_cost_snapshot.sql'; Post='tests/sql/postconditions_020.sql' },
  @{ Version='021'; File='supabase/migrations/202610120021_reconcile_historical_transaction_hardening.sql'; Post='tests/sql/postconditions_021.sql' },
  @{ Version='022'; File='supabase/migrations/202610120022_logical_presentation_lifecycle.sql'; Post='tests/sql/postconditions_022.sql' },
  @{ Version='023'; File='supabase/migrations/202610150023_configurable_presentation_min_stock.sql'; Post='tests/sql/postconditions_023.sql' }
) }
if ($Current022) {
  Invoke-PsqlFile 'tests/sql/current_022_preservation_setup.sql' 'capture current data preservation snapshot'
} elseif ($Current023) {
  Invoke-PsqlFile 'tests/sql/current_023_preservation_setup.sql' 'capture current 022 data preservation snapshot'
  Invoke-PsqlInput "select row_to_json(s) from petstock_test.current_023_snapshot s;" 'current 022 backup fingerprint'
}
foreach ($migration in $migrations) {
  $migrationPath = Join-Path $repoRoot $migration.File
  $body = [IO.File]::ReadAllText($migrationPath)
  if ($body -match '(?im)^\s*(begin|commit|rollback)\s*;') {
    throw "$($migration.Version) unexpectedly contains transaction control; review the runner contract."
  }
  $post = [IO.File]::ReadAllText((Join-Path $repoRoot $migration.Post))
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $migrationPath).Hash.ToLowerInvariant()
  $wrapped = "begin;`n$body`n$post`ninsert into petstock_test.migration_history(version,sha256) values('$($migration.Version)','$hash');`ncommit;"
  Write-Host "Applying migration $($migration.Version) in its own transaction..."
  Invoke-PsqlInput $wrapped "migration $($migration.Version)"
}

if ($Current022) {
  Invoke-PsqlFile 'tests/sql/current_022_preservation_verify.sql' 'verify current data preservation after 022'
  Invoke-PsqlFile 'tests/sql/production_postdeploy_022.sql' 'production postdeploy contracts for 022'
} elseif ($Current023) {
  Invoke-PsqlFile 'tests/sql/current_023_preservation_verify.sql' 'verify current data preservation and minimum backfill after 023'
  Invoke-PsqlFile 'tests/sql/production_postdeploy_023.sql' 'production postdeploy contracts for 023'
}

Invoke-PsqlFile 'tests/sql/transactional_hardening.sql' 'transactional contract suite'
Invoke-PsqlFile 'tests/sql/presentation_lifecycle_contract.sql' 'presentation lifecycle contract suite'
Invoke-PsqlFile 'tests/sql/configurable_min_stock_contract.sql' 'configurable minimum stock contract suite'
Invoke-PsqlFile 'tests/sql/concurrency_setup.sql' 'concurrency fixtures'

$auth = "select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000099',false);"
function SaleWorker([string]$scenario,[string]$worker,[string]$items) {
  "$auth select set_config('petstock.test_worker','$scenario`:$worker',false); set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin begin perform public.process_sale('efectivo','$items'::jsonb); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('$scenario','$worker','ok',extract(epoch from clock_timestamp()-v_started)*1000); exception when raise_exception then insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('$scenario','$worker',sqlerrm,extract(epoch from clock_timestamp()-v_started)*1000); end; end `$`$;"
}

function Wait-ForWorkerSleep([string]$ApplicationName) {
  if ($ApplicationName -notmatch '^petstock_[a-z_]+$') { throw 'Invalid test application name.' }
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $run = Start-PsqlInput "select count(*) from pg_stat_activity where application_name='$ApplicationName' and wait_event='PgSleep';"
    if (-not $run.Process.WaitForExit(5000)) {
      $run.Process.Kill($true)
      throw "Barrier probe timed out for $ApplicationName"
    }
    $result = $run.OutTask.GetAwaiter().GetResult().Trim()
    $errorText = $run.ErrTask.GetAwaiter().GetResult()
    if ($run.Process.ExitCode -ne 0) { throw "Barrier probe failed for $ApplicationName`: $errorText" }
    if ($result -eq '1') { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Archive worker never reached the deterministic lock barrier: $ApplicationName"
}

$a = Start-PsqlInput (SaleWorker 'sale_sale' 'a' '[{"presentation_id":"20000000-0000-4000-8000-000000000021","mode":"unit","quantity":"1"}]')
Start-Sleep -Milliseconds 350
$b = Start-PsqlInput (SaleWorker 'sale_sale' 'b' '[{"presentation_id":"20000000-0000-4000-8000-000000000021","mode":"unit","quantity":"1"}]')
Complete-Psql $a 'sale/sale worker A'; Complete-Psql $b 'sale/sale worker B'

$purchaseSql = "$auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin perform public.process_purchase('20000000-0000-4000-8000-000000000010','CONCURRENT-PURCHASE','[{`"presentation_id`":`"20000000-0000-4000-8000-000000000022`",`"quantity`":`"1`",`"unit_cost`":`"12.00`"}]'::jsonb); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('purchase_sale','purchase','ok',extract(epoch from clock_timestamp()-v_started)*1000); end `$`$;"
$purchase = Start-PsqlInput $purchaseSql
Start-Sleep -Milliseconds 250
$sale = Start-PsqlInput (SaleWorker 'purchase_sale' 'sale' '[{"presentation_id":"20000000-0000-4000-8000-000000000022","mode":"unit","quantity":"1"}]')
Complete-Psql $purchase 'purchase/sale purchase'; Complete-Psql $sale 'purchase/sale sale'

$minUpdateSql = "set application_name='petstock_min_update'; $auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin update public.product_presentations set min_stock=4 where id='20000000-0000-4000-8000-000000000030'; insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('minimum_purchase','minimum','ok',extract(epoch from clock_timestamp()-v_started)*1000); end `$`$;"
$minimumPurchaseSql = "$auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin perform public.process_purchase('20000000-0000-4000-8000-000000000010','MINIMUM-PURCHASE-RACE','[{`"presentation_id`":`"20000000-0000-4000-8000-000000000030`",`"quantity`":`"2`",`"unit_cost`":`"12.00`"}]'::jsonb); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('minimum_purchase','purchase','ok',extract(epoch from clock_timestamp()-v_started)*1000); end `$`$;"
$minimumUpdate = Start-PsqlInput $minUpdateSql
Wait-ForWorkerSleep 'petstock_min_update'
$minimumPurchase = Start-PsqlInput $minimumPurchaseSql
Complete-Psql $minimumUpdate 'minimum/purchase threshold update'
Complete-Psql $minimumPurchase 'minimum/purchase purchase'

$archiveSql = "set application_name='petstock_archive_shrink'; $auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin perform public.delete_product('20000000-0000-4000-8000-000000000003'); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('archive_mutation','archive','ok',extract(epoch from clock_timestamp()-v_started)*1000); end `$`$;"
$mutationSql = "$auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin begin perform public.record_shrinkage('20000000-0000-4000-8000-000000000023',1,'race'); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('archive_mutation','mutation','ok',extract(epoch from clock_timestamp()-v_started)*1000); exception when raise_exception then insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('archive_mutation','mutation',sqlerrm,extract(epoch from clock_timestamp()-v_started)*1000); end; end `$`$;"
$archive = Start-PsqlInput $archiveSql
Wait-ForWorkerSleep 'petstock_archive_shrink'
$mutation = Start-PsqlInput $mutationSql
Complete-Psql $archive 'archive/mutation archive'; Complete-Psql $mutation 'archive/mutation mutation'

$archiveSaleSql = "set application_name='petstock_archive_sale'; $auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin perform public.delete_product('20000000-0000-4000-8000-000000000006'); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('archive_sale','archive','ok',extract(epoch from clock_timestamp()-v_started)*1000); end `$`$;"
$saleAfterArchiveSql = "$auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); v_before bigint; begin select count(*) into v_before from public.sales; begin perform public.process_sale('efectivo','[{`"presentation_id`":`"20000000-0000-4000-8000-000000000026`",`"mode`":`"unit`",`"quantity`":`"1`"}]'::jsonb); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms,before_rows,after_rows) values('archive_sale','sale','ok',extract(epoch from clock_timestamp()-v_started)*1000,v_before,(select count(*) from public.sales)); exception when raise_exception then insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms,before_rows,after_rows) values('archive_sale','sale',sqlerrm,extract(epoch from clock_timestamp()-v_started)*1000,v_before,(select count(*) from public.sales)); end; end `$`$;"
$archiveSale = Start-PsqlInput $archiveSaleSql
Wait-ForWorkerSleep 'petstock_archive_sale'
$saleAfterArchive = Start-PsqlInput $saleAfterArchiveSql
Complete-Psql $archiveSale 'archive/sale archive'; Complete-Psql $saleAfterArchive 'archive/sale sale'

$archivePurchaseSql = "set application_name='petstock_archive_purchase'; $auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin perform public.delete_product('20000000-0000-4000-8000-000000000007'); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('archive_purchase','archive','ok',extract(epoch from clock_timestamp()-v_started)*1000); end `$`$;"
$purchaseAfterArchiveSql = "$auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); v_before bigint; begin select count(*) into v_before from public.purchases; begin perform public.process_purchase('20000000-0000-4000-8000-000000000010','ARCHIVE-RACE','[{`"presentation_id`":`"20000000-0000-4000-8000-000000000027`",`"quantity`":`"1`",`"unit_cost`":`"12.00`"}]'::jsonb); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms,before_rows,after_rows) values('archive_purchase','purchase','ok',extract(epoch from clock_timestamp()-v_started)*1000,v_before,(select count(*) from public.purchases)); exception when raise_exception then insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms,before_rows,after_rows) values('archive_purchase','purchase',sqlerrm,extract(epoch from clock_timestamp()-v_started)*1000,v_before,(select count(*) from public.purchases)); end; end `$`$;"
$archivePurchase = Start-PsqlInput $archivePurchaseSql
Wait-ForWorkerSleep 'petstock_archive_purchase'
$purchaseAfterArchive = Start-PsqlInput $purchaseAfterArchiveSql
Complete-Psql $archivePurchase 'archive/purchase archive'; Complete-Psql $purchaseAfterArchive 'archive/purchase purchase'

$archiveUpdateSql = "set application_name='petstock_archive_update'; $auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin perform public.delete_product('20000000-0000-4000-8000-000000000008'); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('archive_direct_update','archive','ok',extract(epoch from clock_timestamp()-v_started)*1000); end `$`$;"
$directUpdateSql = "$auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); v_updated bigint; begin begin update public.product_presentations set price=21 where id='20000000-0000-4000-8000-000000000028'; get diagnostics v_updated=row_count; if v_updated<>1 then raise exception 'DIRECT_UPDATE_NOT_EXECUTED'; end if; insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('archive_direct_update','update','ok',extract(epoch from clock_timestamp()-v_started)*1000); exception when raise_exception then insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('archive_direct_update','update',sqlerrm,extract(epoch from clock_timestamp()-v_started)*1000); end; end `$`$;"
$archiveUpdate = Start-PsqlInput $archiveUpdateSql
Wait-ForWorkerSleep 'petstock_archive_update'
$directUpdate = Start-PsqlInput $directUpdateSql
Complete-Psql $archiveUpdate 'archive/direct-update archive'; Complete-Psql $directUpdate 'archive/direct-update update'

$archiveAdjustmentSql = "set application_name='petstock_archive_adjustment'; $auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin perform public.delete_product('20000000-0000-4000-8000-000000000009'); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('archive_adjustment','archive','ok',extract(epoch from clock_timestamp()-v_started)*1000); end `$`$;"
$adjustmentAfterArchiveSql = "$auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin begin perform public.record_stock_adjustment('20000000-0000-4000-8000-000000000029',1,'race'); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('archive_adjustment','adjustment','ok',extract(epoch from clock_timestamp()-v_started)*1000); exception when raise_exception then insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('archive_adjustment','adjustment',sqlerrm,extract(epoch from clock_timestamp()-v_started)*1000); end; end `$`$;"
$archiveAdjustment = Start-PsqlInput $archiveAdjustmentSql
Wait-ForWorkerSleep 'petstock_archive_adjustment'
$adjustmentAfterArchive = Start-PsqlInput $adjustmentAfterArchiveSql
Complete-Psql $archiveAdjustment 'archive/adjustment archive'; Complete-Psql $adjustmentAfterArchive 'archive/adjustment adjustment'

$createWinnerSql = "set application_name='petstock_create_presentation'; $auth select set_config('petstock.test_worker','create_archive:create',false); set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin begin perform public.create_product_presentation('20000000-0000-4000-8000-000000000012','Concurrent create winner',null,10,20,null,0); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('create_archive_create_wins','create','ok',extract(epoch from clock_timestamp()-v_started)*1000); exception when raise_exception then insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('create_archive_create_wins','create',sqlerrm,extract(epoch from clock_timestamp()-v_started)*1000); end; end `$`$;"
$archiveAfterCreateSql = "$auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin perform public.delete_product('20000000-0000-4000-8000-000000000012'); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('create_archive_create_wins','archive','ok',extract(epoch from clock_timestamp()-v_started)*1000); end `$`$;"
$createWinner = Start-PsqlInput $createWinnerSql
Wait-ForWorkerSleep 'petstock_create_presentation'
$archiveAfterCreate = Start-PsqlInput $archiveAfterCreateSql
Complete-Psql $createWinner 'create/archive create winner'; Complete-Psql $archiveAfterCreate 'create/archive trailing archive'

$archiveBeforeCreateSql = "set application_name='petstock_archive_create'; $auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin perform public.delete_product('20000000-0000-4000-8000-000000000013'); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('create_archive_archive_wins','archive','ok',extract(epoch from clock_timestamp()-v_started)*1000); end `$`$;"
$createAfterArchiveSql = "$auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin begin perform public.create_product_presentation('20000000-0000-4000-8000-000000000013','Concurrent archive winner',null,10,20,null,0); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('create_archive_archive_wins','create','ok',extract(epoch from clock_timestamp()-v_started)*1000); exception when raise_exception then insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('create_archive_archive_wins','create',sqlerrm,extract(epoch from clock_timestamp()-v_started)*1000); end; end `$`$;"
$archiveBeforeCreate = Start-PsqlInput $archiveBeforeCreateSql
Wait-ForWorkerSleep 'petstock_archive_create'
$createAfterArchive = Start-PsqlInput $createAfterArchiveSql
Complete-Psql $archiveBeforeCreate 'create/archive archive winner'; Complete-Psql $createAfterArchive 'create/archive trailing create'

$itemsAB='[{"presentation_id":"20000000-0000-4000-8000-000000000024","mode":"unit","quantity":"1"},{"presentation_id":"20000000-0000-4000-8000-000000000025","mode":"unit","quantity":"1"}]'
$itemsBA='[{"presentation_id":"20000000-0000-4000-8000-000000000025","mode":"unit","quantity":"1"},{"presentation_id":"20000000-0000-4000-8000-000000000024","mode":"unit","quantity":"1"}]'
$orderA = Start-PsqlInput (SaleWorker 'multi_order' 'ab' $itemsAB)
Start-Sleep -Milliseconds 350
$orderB = Start-PsqlInput (SaleWorker 'multi_order' 'ba' $itemsBA)
Complete-Psql $orderA 'multi-presentation worker AB'; Complete-Psql $orderB 'multi-presentation worker BA'
Invoke-PsqlFile 'tests/sql/concurrency_verify.sql' 'concurrency postconditions'

Invoke-PsqlFile 'tests/sql/presentation_lifecycle_concurrency_setup.sql' 'presentation lifecycle concurrency fixtures'

function LifecycleOutcomeSql([string]$scenario,[string]$worker,[string]$operation) {
  "$auth set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin begin $operation; insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('$scenario','$worker','ok',extract(epoch from clock_timestamp()-v_started)*1000); exception when raise_exception then insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('$scenario','$worker',sqlerrm,extract(epoch from clock_timestamp()-v_started)*1000); end; end `$`$;"
}

$lifecycleCases = @(
  @{ Scenario='presentation_archive_sale'; App='petstock_pres_archive_sale'; Id='70000000-0000-4000-8000-000000000013'; Worker='sale'; Operation="perform public.process_sale('efectivo','[{`"presentation_id`":`"70000000-0000-4000-8000-000000000013`",`"mode`":`"unit`",`"quantity`":`"1`"}]'::jsonb)" },
  @{ Scenario='presentation_archive_purchase'; App='petstock_pres_archive_purchase'; Id='70000000-0000-4000-8000-000000000014'; Worker='purchase'; Operation="perform public.process_purchase('70000000-0000-4000-8000-000000000002','PRESENTATION-RACE','[{`"presentation_id`":`"70000000-0000-4000-8000-000000000014`",`"quantity`":`"1`",`"unit_cost`":`"12.00`"}]'::jsonb)" },
  @{ Scenario='presentation_archive_adjustment'; App='petstock_pres_archive_adjust'; Id='70000000-0000-4000-8000-000000000015'; Worker='adjustment'; Operation="perform public.record_stock_adjustment('70000000-0000-4000-8000-000000000015',1,'race')" },
  @{ Scenario='presentation_archive_shrinkage'; App='petstock_pres_archive_shrink'; Id='70000000-0000-4000-8000-000000000016'; Worker='shrinkage'; Operation="perform public.record_shrinkage('70000000-0000-4000-8000-000000000016',1,'race')" }
)
foreach ($case in $lifecycleCases) {
  $archiveOperation = "perform public.archive_presentation('$($case.Id)')"
  $archiveWorkerSql = "set application_name='$($case.App)'; " + (LifecycleOutcomeSql $case.Scenario 'archive' $archiveOperation)
  $archiveWorker = Start-PsqlInput $archiveWorkerSql
  Wait-ForWorkerSleep $case.App
  $mutationWorker = Start-PsqlInput (LifecycleOutcomeSql $case.Scenario $case.Worker $case.Operation)
  Complete-Psql $archiveWorker "$($case.Scenario) archive"
  Complete-Psql $mutationWorker "$($case.Scenario) mutation"
}

$saleWinnerSql = "set application_name='petstock_pres_sale_wins'; $auth select set_config('petstock.test_worker','presentation_sale_wins:sale',false); set role authenticated; do `$`$ declare v_started timestamptz := clock_timestamp(); begin perform public.process_sale('efectivo','[{`"presentation_id`":`"70000000-0000-4000-8000-000000000017`",`"mode`":`"unit`",`"quantity`":`"1`"}]'::jsonb); insert into petstock_test.outcomes(scenario,worker,outcome,duration_ms) values('presentation_sale_wins','sale','ok',extract(epoch from clock_timestamp()-v_started)*1000); end `$`$;"
$saleWinner = Start-PsqlInput $saleWinnerSql
Wait-ForWorkerSleep 'petstock_pres_sale_wins'
$archiveLoser = Start-PsqlInput (LifecycleOutcomeSql 'presentation_sale_wins' 'archive' "perform public.archive_presentation('70000000-0000-4000-8000-000000000017')")
Complete-Psql $saleWinner 'presentation sale-wins mutation'
Complete-Psql $archiveLoser 'presentation sale-wins archive'
Invoke-PsqlFile 'tests/sql/presentation_lifecycle_concurrency_verify.sql' 'presentation lifecycle concurrency postconditions'

Invoke-PsqlInput "table petstock_test.migration_history order by applied_at;" 'migration history'
Write-Host $(if ($Current023) { 'PASS: current 020/021/022 backup plus migration 023, preservation, lifecycle, minimum-stock and concurrency contracts.' } elseif ($Current022) { 'PASS: current 020/021 backup plus migrations 022-023, preservation, lifecycle, minimum-stock and concurrency contracts.' } else { 'PASS: baseline 017 plus migrations 018-023, lifecycle, minimum-stock, transactional and concurrent backend contracts.' })
