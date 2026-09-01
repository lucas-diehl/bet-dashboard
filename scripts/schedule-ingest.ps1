# Registers a Windows Scheduled Task that runs the ingest job on a schedule,
# pushing any new feed files into the database. Requires DATABASE_URL to be set
# (as a machine/user env var) so ingest has somewhere to write.
#
#   powershell -ExecutionPolicy Bypass -File scripts\schedule-ingest.ps1
#
# Edit the time/interval below to taste. Removes-and-recreates the task if it exists.

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$taskName = "BetHub Ingest"

# Runs: pnpm --filter @bet/ingest start   (validate + upsert the feed)
$pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
if (-not $pnpm) { throw "pnpm not found on PATH." }

$action = New-ScheduledTaskAction -Execute "pwsh.exe" `
  -Argument "-NoProfile -Command `"Set-Location '$repo'; pnpm --filter @bet/ingest start`""

# Every 30 minutes, all day. Adjust as needed.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddHours(6) `
  -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Hours 24)

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "Validates the dashboard feed folder and upserts new picks/results into the database."

Write-Host "Registered scheduled task '$taskName' (every 30 min). Requires DATABASE_URL to be set for the task's user."
