# Manual Electron Startup Diagnostic

This procedure lets a person run a minimal Electron app from a normal Windows 11 PowerShell or VS Code terminal. It separates Electron startup (Test A) from Koffi loading and a read-only monitor query (Test B). It does not test Windows AppBar behavior.

The diagnostic apps are isolated under `experiments/windows-appbar-core/startup-diagnostic/`. They reuse the existing Electron `45.2.3` and Koffi `3.3.7` installations. Their package manifests declare no dependencies. Do not run `npm install`, `npm ci`, `npm start`, or an Electron installer for these checks: invoke the existing `electron.exe` directly. If the binary or pinned packages are missing or the versions do not match, stop and report that state; do not download replacements.

## Safety and prerequisites

- Use an interactive Windows 11 desktop session, not a background/non-interactive runner. This machine may differ from the earlier Codex execution environment.
- Use one ordinary desktop session and the current display configuration. Do not change display, resolution, scaling, security, or system settings.
- These apps do not register an AppBar and contain no work-area mutation call. Test B reads monitor/work-area information only. No AppBar acceptance condition is tested here.
- Before starting, close only prior diagnostic or Spike app windows that you started and can identify. Do not terminate all `electron.exe` processes: other applications may use Electron. Do not force-kill a process. If an existing Spike process or uncertain reservation is present, stop and ask its owner to close it normally before continuing.
- Keep the PowerShell terminal visible. The Electron process runs in the foreground until the test window is closed.
- Logs go under the ignored `experiments/windows-appbar-core/logs/` directory. Do not commit those logs. Scrub usernames, local paths, tokens, and other personal data before sharing them.

## Preflight

From the repository root, open a normal PowerShell 5.1/7 or VS Code PowerShell terminal and run:

```powershell
Set-Location .\experiments\windows-appbar-core
node --version
if ($LASTEXITCODE -ne 0) { throw 'Node.js is unavailable. Stop.' }
npm --version
if ($LASTEXITCODE -ne 0) { throw 'npm is unavailable. Stop.' }
$electron = Join-Path (Get-Location).Path 'node_modules\electron\dist\electron.exe'
$electronVersion = node -p "require('./node_modules/electron/package.json').version"
if ($LASTEXITCODE -ne 0) { throw 'Electron package metadata is unavailable. Stop; do not reinstall.' }
Write-Output "Electron package: $electronVersion"
if (-not (Test-Path -LiteralPath $electron -PathType Leaf)) { throw 'Existing Electron executable is missing. Stop; do not download or reinstall it.' }
if ($electronVersion -ne '45.2.3') { throw 'Electron package version mismatch. Stop.' }
New-Item -ItemType Directory -Force -Path '.\logs' | Out-Null
```

The Electron version check reads local package metadata and does not contact npm. Koffi is not a prerequisite for Test A; its package/version check belongs to Test B below. Check that no prior diagnostic window/process is still active. Do not use `Stop-Process` or task-kill commands.

## Test A — Electron only

Run only Test A first. It creates one window and makes no Koffi, Win32, or AppBar call.

```powershell
$diag = Join-Path (Get-Location).Path 'startup-diagnostic\electron-only'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdout = Join-Path (Get-Location).Path "logs\startup-a-$stamp.stdout.log"
$stderr = Join-Path (Get-Location).Path "logs\startup-a-$stamp.stderr.log"
& $electron $diag 1> $stdout 2> $stderr
$exitCode = $LASTEXITCODE
Write-Output "Electron exit code: $exitCode"
Write-Output "stdout: $stdout"
Write-Output "stderr: $stderr"
```

Expected window text: **Electron startup test — OK**. Click **Close test window** (or the window's normal close button). The foreground command should return. The app's lifecycle JSONL file is `logs/startup-test-a-<timestamp>.jsonl`; it records main-process start, Electron module load/readiness, window creation, page load, show, normal close, and process exit. Console and file logging are best-effort; file logging failure is reported to the console and must not block closing.

Mark Test A window display `PASS` only if the expected window was actually visible. Mark normal close `PASS` only if the window closed through its normal UI, the command returned with exit code 0, and the `process-exit` event records code 0; record the actual exit code and logs. A blank window, no window, an immediate exit, or insufficient output is `FAIL` or `INCONCLUSIVE` according to the evidence. Do not start Test B unless the visible window loaded and closed normally.

## Test B — Koffi and read-only Win32 monitor query

Run this only after Test A has passed. The app loads the existing Koffi module and calls only `MonitorFromWindow` and `GetMonitorInfoW` from `user32.dll`. These calls read monitor bounds and the current work area. No AppBar API is present or called.

After Test A passed and its process ended normally, confirm the local pinned Koffi version remains `3.3.7`. This reads local metadata only and does not install or download anything:

```powershell
$koffiVersion = node -p "require('./node_modules/koffi/package.json').version"
Write-Output "Koffi package: $koffiVersion"
if ($LASTEXITCODE -ne 0) { throw 'Koffi package metadata is unavailable. Stop Test B.' }
if ($koffiVersion -ne '3.3.7') { throw 'Koffi package version mismatch. Stop Test B.' }
```

Then run Test B:

```powershell
$diag = Join-Path (Get-Location).Path 'startup-diagnostic\koffi-read-only'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdout = Join-Path (Get-Location).Path "logs\startup-b-$stamp.stdout.log"
$stderr = Join-Path (Get-Location).Path "logs\startup-b-$stamp.stderr.log"
& $electron $diag 1> $stdout 2> $stderr
$exitCode = $LASTEXITCODE
Write-Output "Electron exit code: $exitCode"
Write-Output "stdout: $stdout"
Write-Output "stderr: $stderr"
```

The JSONL file `logs/startup-test-b-<timestamp>.jsonl` separates Koffi load, Win32 binding, and monitor-query events. Successful query entries contain monitor bounds, work-area bounds, and primary-monitor status; the query is repeated immediately before normal window close for comparison. A failed Koffi load or read-only API call is logged separately where possible; the window remains available for inspection and normal close. Close it with **Close test window** and record the command exit code.

Treat Koffi loading as `PASS` only when the `koffi-loaded` event is present and reports version `3.3.7`. Treat the Win32 read as `PASS` only when `readonly-monitor-measurement` is present for both phases and the values are captured. Treat Test B normal close as `PASS` only after normal UI close, command return with exit code 0, and `process-exit` code 0. If the two work-area readings differ, record the values and any observed external display changes; do not assume the diagnostic caused or resolved a system change.

## If a problem occurs

- **No window appears:** do not run Test B. Record whether the terminal returned, its exit code, both stream-log contents, and the JSONL file if present. A process existing briefly is not proof that the GUI displayed.
- **Electron exits immediately:** record the exact exit code, timestamp, JSONL events, stdout, and stderr. Do not retry repeatedly or reinstall Electron.
- **`EXCEPTION_BREAKPOINT` appears:** stop further tests. Record the exception code and timestamp. If accessible without elevation, open Event Viewer from the Start menu, select **Windows Logs → Application**, and inspect entries at that time from **Application Error** or **Windows Error Reporting**. Record the event ID, faulting application/module, and exception code. Do not change permissions or security settings to access logs.
- **Koffi load fails:** only report a Koffi result if Test A passed. Preserve `koffi-load-started` and failure events, version output, exit code, and stderr. Do not replace or rebuild the module in this procedure.
- **No standard output/error:** inspect the app JSONL file and its size. Report missing/empty streams as such; do not infer successful startup. If both streams and JSONL are unavailable, mark the result `INCONCLUSIVE`.
- **A process does not exit after normal close:** do not force-terminate it. Record its process details and ask the process owner to resolve it. Do not start another test while it remains.

Before sharing logs or Event Viewer details, redact account names, local file paths, tokens, and unrelated event data. Keep the original logs local and ignored.

## Result to report

Copy the table into the Spike report or PR comment and replace placeholders with observed evidence. Do not convert unrun checks to `PASS`.

| Item | Result / evidence |
|---|---|
| Windows version; PowerShell; Node.js; npm | Record actual values |
| Electron package/runtime version | Record actual values; expected `45.2.3` |
| Koffi package version | Record actual value; expected `3.3.7` |
| Test A: window visible | `PASS` / `FAIL` / `INCONCLUSIVE` |
| Test A: normal close | `PASS` / `FAIL` / `NOT_RUN` |
| Test B: Koffi load | `PASS` / `FAIL` / `NOT_RUN` |
| Test B: read-only Win32 query | `PASS` / `FAIL` / `NOT_RUN` |
| Test B: normal close | `PASS` / `FAIL` / `NOT_RUN` |
| Exit code; exception/event details | Actual value or unavailable |
| Log files | Local paths; share only sanitized copies |
| Windows work-area change | No change is intended; record the Test B before-close measurements and any difference |
| AppBar registration/acceptance | `NOT_RUN`; these tests contain no AppBar operation |

These are manual execution checks. Static inspection that the code contains only benign/read-only operations does not prove runtime success or system behavior. AppBar feasibility remains undetermined until the separately authorized AppBar experiment is run and measured.
