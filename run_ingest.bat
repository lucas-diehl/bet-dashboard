@echo off
REM Bet Hub ingest launcher (Task Scheduler). DATABASE_URL is auto-loaded from
REM apps\web\.env.local by @bet/db loadEnv(), so no secret is needed here.
cd /d C:\dev\bet-dashboard
echo ================ %DATE% %TIME% ================ >> ingest.log
call "C:\Users\ljdie\AppData\Roaming\npm\pnpm.cmd" ingest >> ingest.log 2>&1
echo exit %ERRORLEVEL% >> ingest.log
