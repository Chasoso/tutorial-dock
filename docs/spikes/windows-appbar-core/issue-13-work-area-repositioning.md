# Issue #13 - Chromium work-area repositioning investigation

## Purpose and status

This is a Technical Spike for issue [#13](https://github.com/Chasoso/tutorial-dock/issues/13), traced to `R-01`-`R-03`, `AB-001`, `AB-002`, `AB-007`, `AB-008`, and candidates `TS-01`-`TS-03`, `TS-05`, `TS-08`. It separates diagnostic preparation from human-run Windows evidence. No position correction is implemented.

The existing evidence says the 90 px work-area reservation succeeds, while the AppBar window later moves to Y=90. Prior A/B runs had incomplete environment matching. They do not establish a causal effect for `SWP_NOSENDCHANGING`, Chromium, or `showInactive()`.

Runtime results for both runs in this Spike are `MANUAL_PENDING`. Codex did not launch Electron or call AppBar APIs.

## Changes in this Spike

- Added deferred observation hooks for `WM_SETTINGCHANGE`, `WM_WINDOWPOSCHANGING`, and `WM_WINDOWPOSCHANGED`, in addition to existing AppBar notifications and Electron `show`/`move`/`resize` events.
- Captured the message ID, safe scalar `wParam` value, raw parameter bytes, observation time, event sequence, and AppBar state. `WM_SETTINGCHANGE.wParam` is identified as `SPI_SETWORKAREA` when it equals `0x002F`.
- Kept the deferred queue bounded at 8 pending entries. Each Win32 message observation is a separate FIFO entry, so repeated message names do not coalesce timestamps, sequence numbers, or scalar wParam values. Electron move/resize observations retain their existing coalescing. Arrivals beyond the cap are counted and emitted as position-diagnostic-queue-overflow; any overflow makes the run incomplete for message-order conclusions.
- Deliberately do not dereference `WM_SETTINGCHANGE.lParam` or parse the `WINDOWPOS*` pointer. The installed Electron API exposes message parameters as Buffers, but this Spike does not establish a safe lifetime/copy contract for the pointed-to native structures.
- Added an opt-in `showInactive()` comparison. Default behavior is unchanged. The comparison mode requires `TUTORIAL_DOCK_SPIKE_POSITION_VARIANT=nosendchanging`; it only omits the call when `TUTORIAL_DOCK_SPIKE_SHOW_INACTIVE=omit`. The control uses `show`. Invalid values fail closed before Electron starts.
- Preserved AppBar registration, reservation, `SetWindowPos` flags and arguments, release verification, Safe exit, and the default Baseline mode.

## Human-run procedure

Use the same clean commit and Windows session for both runs. Follow [the existing AppBar manual-validation preflight](manual-appbar-validation.md) and stop if any precondition is uncertain. Use separate ordinary PowerShell terminals/processes for A and B; never run them concurrently.

### Preconditions for each run

1. Use Windows 11, one display, 96 DPI/100% scaling, and the standard visible bottom taskbar. Do not change system settings to force a match.
2. Confirm no prior PoC process remains and independently measure that the initial Windows work area is restored. These are separate checks.
3. Confirm the repository is clean and record the full branch and commit SHA. A and B must use the same commit.
4. Record Windows build, monitor bounds/resolution, work area, DPI, taskbar configuration, Node, Electron 45.2.3, and Koffi 3.3.7. A and B must match; otherwise stop.
5. Note the existing filenames in `experiments/windows-appbar-core/logs/`. Do not delete, rename, or overwrite logs.

### Run A - control (`SWP_NOSENDCHANGING` + `showInactive()`)

From a PowerShell terminal at the repository root:

```powershell
$ErrorActionPreference = 'Stop'
$repoRoot = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoRoot)) { throw 'Cannot identify repository root.' }
$experimentDir = Join-Path $repoRoot 'experiments\windows-appbar-core'
$beforeLogs = @((Get-ChildItem -LiteralPath (Join-Path $experimentDir 'logs') -Filter 'session-*.jsonl' -File -ErrorAction SilentlyContinue).Name)
Push-Location -LiteralPath $experimentDir
$env:TUTORIAL_DOCK_SPIKE_POSITION_VARIANT = 'nosendchanging'
$env:TUTORIAL_DOCK_SPIKE_SHOW_INACTIVE = 'show'
npm start
$runAExitCode = $LASTEXITCODE
Pop-Location
"Run A process exit code: $runAExitCode"
$afterLogs = @(Get-ChildItem -LiteralPath (Join-Path $experimentDir 'logs') -Filter 'session-*.jsonl' -File | Sort-Object LastWriteTime -Descending)
$runALogs = @($afterLogs | Where-Object { $_.Name -notin $beforeLogs })
$runALogs | Select-Object Name, LastWriteTime, Length
```

Confirm the JSONL includes `show-inactive-mode-selected` with `showInactiveMode=show`, then:

1. Confirm the initial `unregistered` state and record the baseline measurement.
2. Register the 90 px AppBar once.
3. Record the API return values, accepted rectangle, work area, Electron/Win32/DWM rectangles, visibility, and on-screen appearance.
4. Press `Remove and verify`. Continue only if the in-process release verification succeeds.
5. Press `Safe exit`; do not force-close the process.
6. Confirm PowerShell returned and record the numeric exit code.
7. Independently measure the Windows work area after process exit. Do not infer AppBar removal from process disappearance or work-area appearance alone.
8. Confirm exactly one new JSONL file is associated with Run A and record its name, commit, environment, and exit code.

Run B may proceed only when Run A release-verification confirms ABM_REMOVE, the operator used Safe exit and JSONL confirms safe-shutdown-confirmed, the Electron process exited and PowerShell recorded exit code 0, and the independent post-exit work-area measurement matches the recorded pre-run baseline. If any evidence is missing, the exit code is nonzero, or the work area differs or is unknown, stop; do not run B.

### Run B - comparison (`SWP_NOSENDCHANGING` + omitted `showInactive()`)

Only after Run A passed all release and post-exit checks, repeat the same preflight and measurements in a new PowerShell terminal/process on the same commit and unchanged Windows environment. Use the same command as A, changing only:

```powershell
$env:TUTORIAL_DOCK_SPIKE_SHOW_INACTIVE = 'omit'
```

Confirm startup logs identify `showInactiveMode=omit` and `positionVariant=nosendchanging`. Register 90 px once; make no height changes or corrective moves. Record the same measurements and visual evidence. Then execute `Remove and verify`, verify success, execute `Safe exit`, record the returned PowerShell exit code, and independently remeasure the work area after process exit.

The comparison is invalid if any other recorded environment or setup value differs. If B cannot be safely released and independently restored, stop without retries or system-level recovery.

## Evidence and interpretation

### Required event sequence

For each run, retain the complete session JSONL and inspect these events and their sequence/timestamps:

- `show-inactive-mode-selected`
- `appbar-registration-requested`
- `wm-settingchange-observed` (including whether `wParam` equals `SPI_SETWORKAREA` / `0x002F`)
- `wm-windowposchanging-observed`
- `wm-windowposchanged-observed`
- `electron-event:move` and `electron-event:resize`
- `before-setwindowpos`, `after-setwindowpos`
- `before-showinactive`, `show-inactive-experiment-step`, `after-showinactive`, `after-show-settled`
- `release-verification`, `safe-shutdown-confirmed`

Deferred geometry is captured after the observed event. Its measurement timestamp is not the native event-time geometry. `WM_SETTINGCHANGE.lParam` is a pointer and is not dereferenced. `WM_WINDOWPOSCHANGING/CHANGED.lParam` is not parsed as a `WINDOWPOS` structure.

| Evidence | Run A | Run B |
|---|---|---|
| Branch / full commit SHA | MANUAL_PENDING | MANUAL_PENDING |
| Windows build / monitor / resolution / DPI / taskbar | MANUAL_PENDING | MANUAL_PENDING |
| Node / Electron / Chromium / Koffi | MANUAL_PENDING | MANUAL_PENDING |
| JSONL filename | MANUAL_PENDING | MANUAL_PENDING |
| `ABM_NEW` / `ABM_QUERYPOS` / `ABM_SETPOS` results | MANUAL_PENDING | MANUAL_PENDING |
| Accepted rectangle / work area | MANUAL_PENDING | MANUAL_PENDING |
| Event order and first measured Y displacement | MANUAL_PENDING | MANUAL_PENDING |
| Window visible/rendered and visual placement | MANUAL_PENDING | MANUAL_PENDING |
| `ABM_REMOVE` and in-process release verification | MANUAL_PENDING | MANUAL_PENDING |
| Safe exit and PowerShell exit code | MANUAL_PENDING | MANUAL_PENDING |
| Independent post-exit work area | MANUAL_PENDING | MANUAL_PENDING |

Assess work-area reservation, window position, visibility/rendering, release verification, process exit, and external restoration separately. If B omits `showInactive()` and the window is not visible/rendered, that is not a position success.

Interpretation is limited to evidence:
- A different position in B may support an association with the `showInactive()` call path, but does not alone prove the internal cause.
- The recorded Windows messages may support or weaken the work-area-notification/position-adjustment hypothesis; event order alone does not prove Chromium's internal handler caused movement.
- A recorded queue overflow (position-diagnostic-queue-overflow), unequal environments, or inconsistent release evidence makes the message-order result inconclusive. Individual Win32 observations are not coalesced; Electron move/resize samples may be coalesced.
- Do not add a permanent offset, re-position loop, AppBar notification handling, or production behavior from these observations. Any corrective change requires a separately reviewed decision.

## Official API references

- [Electron BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window): `showInactive()` and `hookWindowMessage()`.
- [WM_SETTINGCHANGE](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-settingchange): `wParam` identifies the `SystemParametersInfo` action when applicable; `lParam` may be a pointer.
- [SPI_SETWORKAREA](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-systemparametersinfow): action value `0x002F`.
- [WM_WINDOWPOSCHANGING](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-windowposchanging) and [WM_WINDOWPOSCHANGED](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-windowposchanged): these position messages carry a `WINDOWPOS` pointer in `lParam`; this PoC records only the raw parameter value and does not dereference it.
