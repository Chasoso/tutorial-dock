# Manual Electron Startup Diagnostic

This procedure lets a person run a minimal Electron app from a normal Windows 11 PowerShell or VS Code terminal. It separates Electron startup (Test A) from Koffi loading and a read-only monitor query (Test B). It does not test Windows AppBar behavior.

The diagnostic apps are isolated under `experiments/windows-appbar-core/startup-diagnostic/`. The parent experiment's existing `package.json` already pins Electron `45.2.3` and Koffi `3.3.7` for the PoC; this addition reuses those installed packages and does not modify that manifest or lockfile. The two diagnostic package manifests declare no dependencies. Do not run `npm install`, `npm ci`, `npm start`, or an Electron installer for these checks: invoke the existing `electron.exe` directly. If the binary or pinned packages are missing or the versions do not match, stop and report that state; do not download replacements.

The JSONL file is the primary diagnostic record. The current Test A, Test B, and AppBar PoC loggers do not write diagnostic events to stdout or stderr. Start each Electron process directly from the interactive terminal; do not pipe its output or redirect stdout/stderr. A JSONL write failure sets a nonzero exit code and is not a passing result.

## Safety and prerequisites

- Use an interactive Windows 11 desktop session, not a background/non-interactive runner. This machine may differ from the earlier Codex execution environment.
- Use one ordinary desktop session and the current display configuration. Do not change display, resolution, scaling, security, or system settings.
- These apps do not register an AppBar and contain no work-area mutation call. Test B reads monitor/work-area information only. No AppBar acceptance condition is tested here.
- Before starting, close only prior diagnostic or Spike app windows that you started and can identify. Do not terminate all `electron.exe` processes: other applications may use Electron. Do not force-kill a process. If an existing Spike process or uncertain reservation is present, stop and ask its owner to close it normally before continuing.
- Keep the PowerShell terminal visible. The Electron process runs in the foreground until the test window is closed. Run the executable directly, without `Tee-Object`, an output pipeline, or stdout/stderr redirection.
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
& $electron $diag
$exitCode = $LASTEXITCODE
Write-Output "Electron exit code: $exitCode"
Get-ChildItem .\logs -Filter 'startup-test-a-*.jsonl' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
```

The window identifies itself as **Electron startup diagnostic — Test A**. Click **Close test window** (or the window's normal close button). The foreground command should return. The lifecycle JSONL file is `logs/startup-test-a-<timestamp>.jsonl`; it records main-process start, Electron module load/readiness, window creation, page load, show, normal close, and process exit. No console fallback is used. A JSONL failure changes the window title to a logging-failure warning where possible and sets a nonzero process exit code; it does not intentionally block normal close.

Mark Test A window display `PASS` only if the window was actually visible. Mark normal close `PASS` only if the window closed through its normal UI, the command returned with exit code 0, and the `process-exit` event records code 0; record the actual exit code and JSONL log. A blank window, no window, an immediate exit, a missing/invalid JSONL log, or insufficient output is `FAIL` or `INCONCLUSIVE` according to the evidence. Do not start Test B unless the visible window loaded and closed normally.

The earlier human Test A `PASS` was observed on the pre-change Test A source. The current logger/UI source has not been rerun; that earlier evidence is retained for the previous version and is not a runtime check of the edited source. Test A does not need to be repeated solely to retry Test B unless the operator wants to verify the logger change as well.

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
& $electron $diag
$exitCode = $LASTEXITCODE
Write-Output "Electron exit code: $exitCode"
Get-ChildItem .\logs -Filter 'startup-test-b-*.jsonl' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
```

The JSONL file `logs/startup-test-b-<timestamp>.jsonl` separates Koffi load, Win32 binding, and monitor-query events. Successful query entries contain monitor bounds, work-area bounds, and primary-monitor status; the query is repeated immediately before normal window close for comparison. A failed Koffi load or read-only API call is logged separately where possible. Close the window with **Close test window** and record the command exit code. Do not run the command through a pipe or redirect its standard streams; the previous manual attempt encountered `EPIPE` at `console.log` after capturing the work-area event, and the reason the output pipe closed is unknown.

Treat Koffi loading/version as `PASS` only when `koffi-loaded` is present and the separate `koffi-runtime-version` event reports `3.3.7`. Treat the Win32 read as `PASS` only when `readonly-monitor-measurement` is present for both phases and the values are captured. Treat Test B normal close as `PASS` only after normal UI close, command return with exit code 0, and `process-exit` code 0. If the two work-area readings differ, record the values and any observed external display changes; do not assume the diagnostic caused or resolved a system change.

For the next Test B run, use the command above exactly from the experiment root after the Test A prerequisite is satisfied. Inspect the newest JSONL file first. Expected lifecycle evidence includes `main-process-started`, `koffi-loaded`, `koffi-runtime-version`, `readonly-win32-binding-ready`, `readonly-monitor-measurement`, `browser-window-shown`, `browser-window-closed`, and `process-exit` with code `0`. Missing events are not inferred as success. If JSONL logging fails, the app should show a logging-failure title when possible and return nonzero; report that as a diagnostic failure even if the monitor query succeeded.

## If a problem occurs

- **No window appears:** do not run Test B. Record whether the interactive terminal returned, the exit code, and the JSONL file if present. A process existing briefly is not proof that the GUI displayed.
- **Electron exits immediately:** record the exact exit code, timestamp, and JSONL events. Do not retry repeatedly or reinstall Electron.
- **`EXCEPTION_BREAKPOINT` appears:** stop further tests. Record the exception code and timestamp. If accessible without elevation, open Event Viewer from the Start menu, select **Windows Logs → Application**, and inspect entries at that time from **Application Error** or **Windows Error Reporting**. Record the event ID, faulting application/module, and exception code. Do not change permissions or security settings to access logs.
- **Koffi load fails:** only report a Koffi result if Test A passed. Preserve `koffi-load-started` and failure events, version output, and exit code. Do not replace or rebuild the module in this procedure.
- **`EPIPE` or another stream error appears:** note the exact stack and whether it names `console.log`/`console.error`; record the newest JSONL file and exit code. The current diagnostic source does not intentionally write events to standard streams. Do not add output redirection or retry via another launcher to work around the error.
- **JSONL is missing, empty, or invalid:** treat the run as `FAIL` or `INCONCLUSIVE`, even if the UI appeared. The process should return nonzero when it detects a file-log failure; preserve that exit code and report the JSONL write problem separately from a Koffi/Win32 failure.
- **No standard output/error:** this is expected for diagnostic events. Inspect the app JSONL file and report its contents/status; do not infer successful startup from silence. If the JSONL evidence is unavailable, mark the affected result `INCONCLUSIVE`.
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
| Test B: window visible | `PASS` / `FAIL` / `INCONCLUSIVE` / `NOT_RUN` |
| Test B: Koffi load | `PASS` / `FAIL` / `NOT_RUN` |
| Test B: read-only Win32 query | `PASS` / `FAIL` / `NOT_RUN` |
| Test B: normal close | `PASS` / `FAIL` / `NOT_RUN` |
| Exit code; exception/event details | Actual value or unavailable |
| JSONL log | Local path; share only sanitized copies |
| Windows work-area change | No change is intended; record the Test B before-close measurements and any difference |
| AppBar registration/acceptance | `NOT_RUN`; these tests contain no AppBar operation |

These are manual execution checks. Static inspection that the code contains only benign/read-only operations does not prove runtime success or system behavior. AppBar feasibility remains undetermined until the separately authorized AppBar experiment is run and measured.

## Human run results and Test B retry (2026-11-08)

The following observations were supplied from a normal Windows desktop run of the pre-fix diagnostic sources:

| Check | Result | Evidence |
|---|---|---|
| Test A: Electron window visible | `PASS` | Human confirmed the window was displayed. This evidence is for the pre-change Test A source. |
| Test A: normal close | `PASS` | Human confirmed normal close on the pre-change source. |
| Test B: Electron 45.2.3 / Node 24.22.2 | `PASS` | JSONL recorded both versions. |
| Test B: Koffi 3.3.7 load | `PASS` | `koffi-loaded` and `koffi-runtime-version` were recorded. |
| Test B: Win32 binding | `PASS` | `readonly-win32-binding-ready` listed `MonitorFromWindow` and `GetMonitorInfoW`. |
| Test B: work-area read | `PASS` | JSONL recorded monitor `(0,0)-(1920,1080)` and work area `(0,0)-(1920,1032)`. |
| Test B: GUI display and normal close | `NOT_CONFIRMED` | A main-process JavaScript error dialog interrupted the run; the window display and normal close were not confirmed. |
| Windows work-area change during Test B | No change was requested | The diagnostic used read-only APIs; the interrupted run did not capture a post-close comparison. |
| AppBar registration or work-area reservation | `NOT_RUN` | No AppBar operation is part of either diagnostic. |

After the work-area event, the dialog reported `EPIPE: broken pipe, write` at `Socket._write`, called by `console.log` in the Test B `log()` function. This identifies the failing write path, but the reason the pipe closed is not known. It does not indicate a Koffi or Win32 API failure; those earlier events were captured. The diagnostic loggers have since been changed to write events only to JSONL and to signal a JSONL write failure with a nonzero exit code and a visible window-title warning where possible. Test A's source also changed, so its prior `PASS` is evidence for the earlier version only.

To retry Test B after the Test A prerequisite was previously met, open an interactive PowerShell terminal at `experiments/windows-appbar-core` and run this directly, without redirecting or piping stdout/stderr:

```powershell
$electron = Join-Path (Get-Location).Path 'node_modules\electron\dist\electron.exe'
$diag = Join-Path (Get-Location).Path 'startup-diagnostic\koffi-read-only'
if (-not (Test-Path -LiteralPath $electron -PathType Leaf)) { throw 'Existing Electron executable is missing; do not download it.' }
& $electron $diag
$exitCode = $LASTEXITCODE
Write-Output "Electron exit code: $exitCode"
Get-ChildItem .\logs -Filter 'startup-test-b-*.jsonl' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
```

Review the newest JSONL file for the Koffi load/version, Win32 binding, measurement, visible-window lifecycle, `browser-window-closed`, and `process-exit` code `0`. A successful query alone does not establish GUI display or normal close. The next human check remains pending. No Electron or AppBar runtime operation was performed as part of the source/document update.
