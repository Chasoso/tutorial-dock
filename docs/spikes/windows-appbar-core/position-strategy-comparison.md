# Windows AppBar position strategy comparison

## Purpose and status

This Technical Spike compares the existing `SetWindowPos` flags with the same flags plus `SWP_NOSENDCHANGING`. The only intended runtime difference between the two runs is this one flag. It tests a cause hypothesis; it does not implement a position correction or establish production readiness.

The comparison is **`MANUAL_PENDING`** until a human runs both variants on the same Windows environment and records the JSONL, work-area readings, process exit codes, and visible placement. Codex must not launch Electron or invoke AppBar APIs for this procedure.

Related approved behavior is described by [the Windows AppBar specification](../../../specs/windows-appbar/spec.md), especially AB-002 and SC-002a. Existing position-diagnostic labels and measurement caveats are in [position-diagnostics.md](position-diagnostics.md). The existing staged Windows/AppBar safety procedure is in [manual-appbar-validation.md](manual-appbar-validation.md).

## Question and evidence

### Existing observations

Human-run baseline evidence from Windows 11 Pro reported a 90 px reservation with accepted rectangle `(0,0)-(1920,90)` and work area `(0,90)-(1920,1032)`. Electron coordinates were `(0,0)` at `after-setpos` and `before-setwindowpos`, then `(8,90)` at `after-setwindowpos`, `after-showinactive`, and `after-show-settled`. The reported `SetWindowPos` return was `true`; `showInactive()` continued normally. Thus the first observed displacement was during `SetWindowPos` or synchronous window-position handling before it returned, not first at `showInactive()`.

The earlier run reported successful `ABM_REMOVE`, in-process release verification, and Safe exit. It did not provide a numeric external process exit code or an independent work-area measurement after process exit; those remain separate evidence requirements for each comparison run.

### Hypothesis

Electron/Chromium may respond to `WM_WINDOWPOSCHANGING` while `SetWindowPos` is moving the AppBar window, and may alter the requested position using the work area changed by AppBar reservation. If that message path contributes to the observed Y displacement, a `SetWindowPos` call with `SWP_NOSENDCHANGING` may produce a different measured and visible position.

This is unconfirmed. The experiment does not identify Chromium internals, and the flag result alone cannot prove the exact internal cause.

Microsoft documents `SWP_NOSENDCHANGING` as preventing the target window from receiving `WM_WINDOWPOSCHANGING`. That message is sent before a window's size, position, or Z order changes; its `WINDOWPOS` data can be modified during processing and affect the resulting placement. These documented semantics make the comparison relevant, but do not predict that the AppBar window will land at the screen top. The flag is applied only to the tested `SetWindowPos` request; later window operations may still cause geometry changes. See [SetWindowPos and its flags](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos) and [WM_WINDOWPOSCHANGING](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-windowposchanging).

## Variants

The process reads `TUTORIAL_DOCK_SPIKE_POSITION_VARIANT` once, before Electron is loaded. The selection is immutable for that process. An unset variable selects `baseline`; only the exact values below are accepted. Any other value, including an empty string, throws a clear error before an AppBar registration can start. There is no automatic fallback between variants.

| Variant | Flags passed to `SetWindowPos` | Decimal | Hex |
|---|---|---:|---:|
| `baseline` | `SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW` | 84 | `0x0054` |
| `nosendchanging` | baseline plus `SWP_NOSENDCHANGING` (`0x0400`) | 1108 | `0x0454` |

The AppBar API order, accepted reservation rectangle, target HWND, coordinates, width, height, `BrowserWindow` options, `showInactive()`, diagnostics, release path, and Windows environment must otherwise remain the same between runs.

## Safety gates

- Run only on the human's normal Windows desktop. The first comparison environment is one display, 96 DPI, Windows 11, and the standard visible bottom taskbar.
- Do not proceed if an earlier PoC process may remain, the original work area has not been restored, the AppBar state is uncertain, required dependencies are absent, or the setup differs from the recorded baseline without an understood reason.
- Complete Phase A and verify release, process exit, and external work-area restoration before starting Phase B in a separate Electron process.
- Register 90 px once per run. Do not change height, maximize other applications, or attempt a corrective move in this comparison.
- If registration, removal, release verification, process exit, or work-area restoration is unconfirmed, stop. Do not force-close a process, restart Explorer/Windows, change registry or security settings, or use administrator recovery.
- Do not commit generated `experiments/windows-appbar-core/logs/session-*.jsonl` files. Keep each log associated with its variant and commit SHA in the human's result record.

## Phase 0 — Preflight (repeat for each terminal)

Open an ordinary PowerShell 5.1/7 or VS Code terminal inside the repository. Run this block in each new terminal. It derives the experiment path from Git rather than appending repeated relative paths.

```powershell
$ErrorActionPreference = 'Stop'
$repoRootOutput = & git rev-parse --show-toplevel
$gitExitCode = $LASTEXITCODE
if ($gitExitCode -ne 0) { throw 'Cannot locate the repository root from the current directory. Stop.' }
$repoRootText = (@($repoRootOutput) -join [Environment]::NewLine).Trim()
if ([string]::IsNullOrWhiteSpace($repoRootText)) { throw 'Repository root is empty. Stop.' }
$repoRoot = [System.IO.Path]::GetFullPath($repoRootText)
$experimentDir = Join-Path $repoRoot 'experiments\windows-appbar-core'
$logDir = Join-Path $experimentDir 'logs'
$electronExe = Join-Path $experimentDir 'node_modules\electron\dist\electron.exe'
$electronPackagePath = Join-Path $experimentDir 'node_modules\electron\package.json'
$koffiPackagePath = Join-Path $experimentDir 'node_modules\koffi\package.json'

$branch = (& git -C $repoRoot branch --show-current).Trim()
$gitExitCode = $LASTEXITCODE
if ($gitExitCode -ne 0) { throw 'Could not read the current branch. Stop.' }
$commit = (& git -C $repoRoot rev-parse HEAD).Trim()
$gitExitCode = $LASTEXITCODE
if ($gitExitCode -ne 0) { throw 'Could not read the current commit. Stop.' }
Write-Output "Branch: $branch"
Write-Output "Commit: $commit"
if ($branch -ne 'spike/windows-appbar-nosendchanging') { throw 'Unexpected branch; do not run the experiment.' }

$packagePath = Join-Path $experimentDir 'package.json'
$mainPath = Join-Path $experimentDir 'main.cjs'
foreach ($required in @(
  $packagePath,
  $mainPath,
  (Join-Path $experimentDir 'preload.cjs'),
  (Join-Path $experimentDir 'renderer.js'),
  (Join-Path $experimentDir 'position-variant.cjs'),
  (Join-Path $experimentDir 'deferred-diagnostic-queue.cjs'),
  (Join-Path $experimentDir 'index.html'),
  (Join-Path $experimentDir 'appbar.html'),
  $electronPackagePath,
  $koffiPackagePath
)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required PoC file is missing: $required" }
}
if (-not (Test-Path -LiteralPath $electronExe -PathType Leaf)) { throw 'Pinned electron.exe is absent. Do not download or reinstall it for this test.' }
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
if ($package.devDependencies.electron -ne '45.2.3' -or $package.devDependencies.koffi -ne '3.3.7') {
  throw 'Electron/Koffi pins differ from 45.2.3/3.3.7. Stop.'
}
$installedElectron = Get-Content -LiteralPath $electronPackagePath -Raw | ConvertFrom-Json
$installedKoffi = Get-Content -LiteralPath $koffiPackagePath -Raw | ConvertFrom-Json
if ($installedElectron.version -ne '45.2.3' -or $installedKoffi.version -ne '3.3.7') {
  throw 'Installed Electron/Koffi versions differ from 45.2.3/3.3.7. Stop.'
}

node --version
Write-Output "Electron installed version: $($installedElectron.version)"
Write-Output "Koffi installed version: $($installedKoffi.version)"
```

Record the branch and commit for each run; they should be identical for A and B. Confirm Windows 11, one display, 100% scaling/96 DPI, and a visible standard bottom taskbar. Do not change display settings to meet these conditions.

Inspect Electron process command lines read-only and make sure no prior AppBar PoC is running. Do not terminate processes. Use the read-only display/work-area measurement steps under “ディスプレイと作業領域の読取り” in [manual-appbar-validation.md](manual-appbar-validation.md) to record the work area before each run. If Windows Forms measurement is unavailable, stop rather than substituting an unverified method. Record the initial measurement and verify it is restored before the next variant.

Before each run, list current log names for comparison; do not clear or overwrite logs:

```powershell
if (Test-Path -LiteralPath $logDir) {
  Get-ChildItem -LiteralPath $logDir -Filter 'session-*.jsonl' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 5 Name, Length, LastWriteTime
}
```

The PoC appends to a new `session-*.jsonl` file for each launch. After the run, associate the newly created file with the explicitly selected variant. Avoid redirecting stdout/stderr; the JSONL file is the primary diagnostic evidence.

## Phase A — Baseline

1. Complete Phase 0 and record the initial Windows work area and the latest existing log filenames.
2. From the experiment directory, start the fixed Electron binary with the explicit baseline variant:

   ```powershell
   Set-Location -LiteralPath $experimentDir
   $env:TUTORIAL_DOCK_SPIKE_POSITION_VARIANT = 'baseline'
   $runExitCode = $null
   try {
     & $electronExe .
     $runExitCode = $LASTEXITCODE
   }
   finally {
     Remove-Item Env:TUTORIAL_DOCK_SPIKE_POSITION_VARIANT -ErrorAction SilentlyContinue
   }
   Write-Output "Electron process exit code: $runExitCode"
   ```

3. Confirm the operator UI starts in `unregistered`. If not, do not register.
4. Click **Measure work area** and record the startup measurement.
5. Click **Register 90 px top AppBar** once. Record the registration state, API returns, accepted rectangle, and work area. If registration or reservation is rejected or uncertain, proceed only with the existing safe removal flow; do not test position comparison.
6. Capture the AppBar's visible placement and record whether the visible top edge is at the monitor top. Do not attempt to move or correct it.
7. Inspect the new JSONL file and record `position-variant-selected`, `registration-baseline`, `ABM_NEW`, `reservation-size`, and the position-diagnostic samples.
8. Click **Remove and verify**. Confirm `ABM_REMOVE`, `release-verification`, and the restored work area in the UI/log. Do not continue if removal is not confirmed.
9. Click **Safe exit**. Wait for control to return to PowerShell and record the numeric exit code. From a fresh PowerShell measurement, verify that the process ended and that the work area equals the Phase 0 value. Do not treat an in-process log alone as external process-exit evidence.
10. Proceed to Phase B only if registration, removal, Safe exit, exit code 0, and external work-area restoration are all confirmed. If any is missing or fails, stop and do not launch the other variant.

## Phase B — NoSendChanging

Use a separate Electron process and a fresh Phase 0 preflight. Confirm Phase A's process has exited and its work area has returned to baseline before launch. Use the same single registration, **Remove and verify**, and **Safe exit** sequence as Phase A so release handling is comparable.

1. Record the Phase B initial work area and current log filenames.
2. Launch with only the variant value changed:

   ```powershell
   Set-Location -LiteralPath $experimentDir
   $env:TUTORIAL_DOCK_SPIKE_POSITION_VARIANT = 'nosendchanging'
   $runExitCode = $null
   try {
     & $electronExe .
     $runExitCode = $LASTEXITCODE
   }
   finally {
     Remove-Item Env:TUTORIAL_DOCK_SPIKE_POSITION_VARIANT -ErrorAction SilentlyContinue
   }
   Write-Output "Electron process exit code: $runExitCode"
   ```

3. Repeat Phase A's single 90 px registration, measurements, visible-edge observation, **Remove and verify**, **Safe exit**, process-exit check, and external work-area measurement. Do not continue if any state becomes uncertain.
4. Associate the new JSONL file with `nosendchanging`. Verify it reports `positionVariant: "nosendchanging"`, flags `1108` / `0x0454`, and the four expected flag names. If the variant or flags differ, treat the run as invalid and stop; do not infer a test result.

No height change, maximized application/Tableau test, display reconfiguration, forced failure, or corrective positioning is part of this comparison.

## What to compare

Keep these observations separate for A and B:

| Observation | Required evidence |
|---|---|
| Variant actually selected | JSONL `position-variant-selected`, `environment`, `registration-baseline`, and `SetWindowPos` request fields |
| AppBar registration and reservation | `ABM_NEW`, `ABM_QUERYPOS`, `ABM_SETPOS` results; `acceptedRect`; before/after Windows `workArea` |
| Requested move | target HWND role, X/Y, width/height, numeric and hexadecimal flags in `before-setwindowpos` / `after-setwindowpos` |
| Position over time | `after-setpos`, `before-setwindowpos`, `after-setwindowpos`, `before-showinactive`, `after-showinactive`, `after-show-settled` |
| Window geometry | Electron `getBounds()` and `getContentBounds()`, Win32 `GetWindowRect`, DWM visible-frame bounds when available, and visibility |
| Visible placement | Human observation or screenshot showing the display edge and AppBar. Do not rely only on API return values. |
| Release | `ABM_REMOVE`, `release-verification`, `safe-shutdown-confirmed`, PowerShell numeric exit code, and independent post-exit work area |

The reservation target is `acceptedRect=(monitor-left, monitor-top, monitor-right, monitor-top+90)` and work-area top corresponding to that reservation. These values are separate from the AppBar window's display position. Judge top-edge placement using the monitor origin, Electron geometry, DWM bounds when available, and the visible result. `GetWindowRect` may include invisible resize borders and is DPI-virtualized; DWM extended-frame bounds use a different frame definition and are not DPI-adjusted. Do not declare the entire rectangle wrong solely because frame measurements differ. Record horizontal offset, visible height, and any frame difference independently.

Do not mark SC-002a or SC-006 PASS merely because an API returned success. This comparison does not test SC-002b, SC-003, or full product acceptance.

## Result record

Fill one column per independent process. If a run was not performed, use `NOT_RUN`; if it was performed but evidence is incomplete, use `MANUAL_PENDING` and explain why. Do not infer values.

| Item | Baseline A | NoSendChanging B |
|---|---|---|
| Date/time and operator |  |  |
| Windows version/build; display count/resolution/DPI/taskbar |  |  |
| Branch and commit SHA |  |  |
| JSONL filename |  |  |
| Selected variant and logged flags |  |  |
| Initial monitor/work-area bounds |  |  |
| `ABM_NEW` / `ABM_QUERYPOS` / `ABM_SETPOS` |  |  |
| `acceptedRect` |  |  |
| Work area after reservation |  |  |
| `SetWindowPos` HWND role and X/Y/width/height/flags/result |  |  |
| Electron outer/content bounds by label |  |  |
| Win32 `GetWindowRect` by label |  |  |
| DWM visible-frame bounds by label or unavailable reason |  |  |
| First sample with any position divergence |  |  |
| Visible top edge and horizontal placement |  |  |
| Visible height/frame differences |  |  |
| `ABM_REMOVE` / release-verification / Safe exit |  |  |
| PowerShell exit code |  |  |
| External process-exit check |  |  |
| Work area after process exit |  |  |
| Work area restored to initial value |  |  |
| Per-run result and evidence limitations |  |  |

### Interpretation

- **Hypothesis supported for this environment:** B visibly and measurably avoids the prior Y displacement while A reproduces it, with reservation, geometry, show, and release conditions otherwise comparable. This supports the message-adjustment hypothesis but does not prove which Electron/Chromium component caused the adjustment.
- **Hypothesis weakened:** A and B produce the same first displaced position with valid logs and comparable measurements. This does not exclude other `WM_WINDOWPOSCHANGING` effects in other conditions.
- **Inconclusive:** registration, selected flags, comparable geometry, visible placement, or safe release evidence is missing or differs materially between runs.

Even if B succeeds, X/frame differences and all other acceptance conditions remain separate. Any proposal to make B the standard or production behavior requires human review and broader validation; this Spike does not change production code or the approved specification.
