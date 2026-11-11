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

$changes = @(git -C $repoRoot status --porcelain --untracked-files=all)
$gitExitCode = $LASTEXITCODE
if ($gitExitCode -ne 0) { throw 'Git status check failed. Stop.' }
if ($changes.Count -gt 0) {
  Write-Output 'Working tree changes (staged, tracked, or untracked):'
  Write-Output $changes
  throw 'Working tree is not clean. Stop before running the comparison.'
}
Write-Output 'Working tree: clean (staged, tracked, and untracked files checked).'

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

try {
  $allProcesses = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop)
}
catch {
  throw 'Could not inspect local processes without elevation. Stop; do not launch the PoC.'
}
$electronProcesses = @($allProcesses | Where-Object { $_.Name -ieq 'electron.exe' })
$uninspectableElectronProcesses = @($electronProcesses | Where-Object {
  [string]::IsNullOrWhiteSpace([string]$_.ExecutablePath) -or
  [string]::IsNullOrWhiteSpace([string]$_.CommandLine)
})
if ($uninspectableElectronProcesses.Count -gt 0) {
  Write-Output 'Electron processes with incomplete path/command-line information:'
  $uninspectableElectronProcesses | Select-Object ProcessId, ParentProcessId, ExecutablePath, CommandLine
  throw 'Could not conclusively inspect every Electron process. Stop; do not elevate or launch the PoC.'
}

# Phase launches pass the absolute experiment directory as the Electron app argument.
$experimentArgumentPattern = '(?i)(?:^|\s)"?' + [regex]::Escape($experimentDir.TrimEnd('\')) + '"?(?=\s|$)'
$sameBinaryElectronProcesses = @($electronProcesses | Where-Object {
  [string]::Equals(
    [System.IO.Path]::GetFullPath([string]$_.ExecutablePath),
    [System.IO.Path]::GetFullPath($electronExe),
    [System.StringComparison]::OrdinalIgnoreCase
  )
})
$rootProcesses = @($sameBinaryElectronProcesses | Where-Object {
  [regex]::IsMatch([string]$_.CommandLine, $experimentArgumentPattern)
})
$ambiguousRoots = @($sameBinaryElectronProcesses | Where-Object {
  $_.CommandLine -notmatch '(?i)(?:^|\s)--type=' -and
  -not [regex]::IsMatch([string]$_.CommandLine, $experimentArgumentPattern)
})
if ($ambiguousRoots.Count -gt 0) {
  Write-Output 'Main Electron process(es) use the pinned executable, but their app argument is not identifiable:'
  $ambiguousRoots | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine
  throw 'A matching AppBar PoC or another app using the same Electron binary cannot be ruled out. Stop; do not terminate or launch.'
}
$trackedProcessIds = @($rootProcesses | ForEach-Object { [uint32]$_.ProcessId })
do {
  $knownProcessIds = @($trackedProcessIds)
  $newChildren = @($allProcesses | Where-Object {
    ($knownProcessIds -contains [uint32]$_.ParentProcessId) -and
    ($knownProcessIds -notcontains [uint32]$_.ProcessId)
  })
  if ($newChildren.Count -eq 0) { break }
  $trackedProcessIds += @($newChildren | ForEach-Object { [uint32]$_.ProcessId })
} while ($true)
$poCProcessTree = @($allProcesses | Where-Object { $trackedProcessIds -contains [uint32]$_.ProcessId })
if ($poCProcessTree.Count -gt 0) {
  Write-Output 'Existing AppBar PoC process tree (read-only):'
  $poCProcessTree | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine
  throw 'An AppBar PoC process is already running. Do not start another comparison.'
}
Write-Output 'No matching AppBar PoC process found in this process snapshot.'
```

Record the branch, full commit SHA, and Phase 0 environment output for each run. Before Phase B, explicitly compare them with Phase A: branch and commit SHA, Windows version/build, display count and monitor geometry/resolution, scaling/DPI, taskbar configuration, Node.js/Electron/Koffi versions, and initial monitor/work-area rectangles must match. If any value differs or cannot be compared, stop; do not treat the runs as a valid A/B comparison. Confirm Windows 11, one display, 100% scaling/96 DPI, and a visible standard bottom taskbar. Do not change settings to force a match.

The process query is read-only and does not require administrator privileges. It identifies the PoC root by the exact pinned Electron executable plus the explicit absolute app-directory argument, then follows `ParentProcessId` to include descendants. Other Electron executables are not treated as this PoC. A main process using the same binary with an unrecognized app argument is reported as ambiguous, not identified as this PoC; stop until a human can establish which app it belongs to. If process details are unavailable or the query fails, stop without elevation. If a matching PoC tree is found, do not launch another run or terminate it; use the existing safe-exit path if available. The absence of a matching process and restoration of the Windows work area are independent checks: neither substitutes for the other.

Use the read-only display/work-area measurement steps under “ディスプレイと作業領域の読取り” in [manual-appbar-validation.md](manual-appbar-validation.md) before each run. If Windows Forms measurement is unavailable, stop rather than substituting an unverified method. Record the initial value and verify its restoration before the next variant. The experiment's `logs/` directory is ignored by `experiments/windows-appbar-core/.gitignore`; the clean-tree check above still checks staged, tracked, and other untracked files. Do not clear or overwrite logs.

For each run, the launch terminal snapshots all existing session-log names immediately before launch. After the process exits, it identifies the new log by set difference, then pairs it with the chosen variant, commit SHA, start time, and numeric Electron process exit code. If zero or multiple new logs are found, report the ambiguity and do not infer which log belongs to the run.

### Reading logs while a run is still open

The PowerShell terminal that launched Electron remains occupied until the app exits. If registration or removal fails and live diagnostics are needed, open a **separate** ordinary PowerShell terminal in the repository and use this read-only block. Do not press `Ctrl+C` in the launch terminal, and do not run another PoC from the second terminal.

```powershell
$ErrorActionPreference = 'Stop'
$repoRootOutput = & git rev-parse --show-toplevel
$gitExitCode = $LASTEXITCODE
if ($gitExitCode -ne 0) { throw 'Cannot locate the repository root. Stop.' }
$repoRootText = (@($repoRootOutput) -join [Environment]::NewLine).Trim()
if ([string]::IsNullOrWhiteSpace($repoRootText)) { throw 'Repository root is empty. Stop.' }
$repoRoot = [System.IO.Path]::GetFullPath($repoRootText)
$logDir = Join-Path $repoRoot 'experiments\windows-appbar-core\logs'
if (-not (Test-Path -LiteralPath $logDir -PathType Container)) { throw 'No session log directory exists yet.' }
Get-ChildItem -LiteralPath $logDir -Filter 'session-*.jsonl' -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 10 Name, Length, LastWriteTime
$logPathInput = Read-Host 'Enter the full path of the active run JSONL shown above'
$logPath = [System.IO.Path]::GetFullPath($logPathInput)
$logRoot = [System.IO.Path]::GetFullPath($logDir).TrimEnd('\') + '\'
if (-not $logPath.StartsWith($logRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Selected path is outside the experiment logs directory. Stop.'
}
if ([System.IO.Path]::GetFileName($logPath) -notlike 'session-*.jsonl') {
  throw 'Selected file is not a session JSONL log. Stop.'
}
Get-Content -LiteralPath $logPath -Tail 50
```

This live-read path is for a failed or uncertain operation only. Keep the PoC windows open and follow the operator UI's existing release guidance; do not kill the process. If release cannot be confirmed, stop further tests.

## Phase A — Baseline

1. Complete Phase 0 and record the initial monitor/work-area bounds, tool versions, Windows/display configuration, branch, and full commit SHA as the Phase A comparison reference.
2. From the experiment directory, start the fixed Electron binary with the explicit baseline variant:

   ```powershell
   $phaseVariant = 'baseline'
   $priorLogNames = @()
   if (Test-Path -LiteralPath $logDir -PathType Container) {
     $priorLogNames = @(Get-ChildItem -LiteralPath $logDir -Filter 'session-*.jsonl' -File | ForEach-Object { $_.Name })
   }
   Write-Output 'Session logs present before this run:'
   if ($priorLogNames.Count -gt 0) { Write-Output $priorLogNames } else { Write-Output '(none)' }
   $runStartedAt = (Get-Date).ToString('o')
   Write-Output "Run: variant=$phaseVariant; commit=$commit; startedAt=$runStartedAt"
   Set-Location -LiteralPath $experimentDir
   $env:TUTORIAL_DOCK_SPIKE_POSITION_VARIANT = $phaseVariant
   $runExitCode = $null
   try {
     & $electronExe $experimentDir
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
7. Click **Remove and verify**. Confirm `ABM_REMOVE`, `release-verification`, and restored work area in the operator UI. Do not continue if removal is not confirmed.
8. Click **Safe exit**. Wait for the launch command to return; do not interrupt it.
9. Follow “After each run” below. Inspect the JSONL only after exit unless a registration/removal failure requires the separate-terminal live-read procedure.
10. Proceed to Phase B only if registration, removal, Safe exit, numeric exit code 0, no remaining PoC process, external work-area restoration, and exactly one identified log reporting `baseline` with flags 84 / `0x0054` are all confirmed. If any is missing or fails, stop and do not launch the other variant.

## Phase B — NoSendChanging

Use a separate Electron process and a fresh Phase 0 preflight. Before launch, compare the Phase B branch and full commit SHA, Windows version/build, monitor count/geometry/resolution, DPI/scaling, taskbar configuration, Node.js/Electron/Koffi versions, and initial monitor/work-area bounds against the Phase A reference. Require exact matches. If any item differs or its Phase A value is unavailable, stop and do not launch Phase B. Also confirm Phase A's process has exited and its work area has returned to its own baseline. Use the same single registration, **Remove and verify**, and **Safe exit** sequence as Phase A so release handling is comparable.

1. Complete a fresh Phase 0. Record the Phase B environment and work area, then complete the explicit Phase A/B equality check above. Use a new log-name snapshot for this process.
2. Launch with only the variant value changed:

   ```powershell
   $phaseVariant = 'nosendchanging'
   $priorLogNames = @()
   if (Test-Path -LiteralPath $logDir -PathType Container) {
     $priorLogNames = @(Get-ChildItem -LiteralPath $logDir -Filter 'session-*.jsonl' -File | ForEach-Object { $_.Name })
   }
   Write-Output 'Session logs present before this run:'
   if ($priorLogNames.Count -gt 0) { Write-Output $priorLogNames } else { Write-Output '(none)' }
   $runStartedAt = (Get-Date).ToString('o')
   Write-Output "Run: variant=$phaseVariant; commit=$commit; startedAt=$runStartedAt"
   Set-Location -LiteralPath $experimentDir
   $env:TUTORIAL_DOCK_SPIKE_POSITION_VARIANT = $phaseVariant
   $runExitCode = $null
   try {
     & $electronExe $experimentDir
     $runExitCode = $LASTEXITCODE
   }
   finally {
     Remove-Item Env:TUTORIAL_DOCK_SPIKE_POSITION_VARIANT -ErrorAction SilentlyContinue
   }
   Write-Output "Electron process exit code: $runExitCode"
   ```

3. Repeat Phase A's single 90 px registration, measurements, visible-edge observation, **Remove and verify**, and **Safe exit**. Follow “After each run” to check the process, work area, and new log. Do not continue if any state becomes uncertain.
4. Verify the selected variant and flags in the new log. If the variant or flags differ, treat the run as invalid; do not infer a test result.

## After each run

Use the launch terminal after the Electron command returns. Record the numeric exit code printed by the launch block. Then perform the following independently and in this order:

1. Repeat the read-only Phase 0 process-tree query. Confirm no PoC root or descendant remains. If process details are incomplete or a matching process remains, stop; do not launch the next variant or terminate anything.
2. From an ordinary PowerShell terminal, repeat the external work-area measurement in [manual-appbar-validation.md](manual-appbar-validation.md). Compare it to this run's own pre-launch value. This is independent of the process check and does not by itself prove `ABM_REMOVE` succeeded.
3. In the launch terminal, find the JSONL created during this run by comparing against `$priorLogNames`:

   ```powershell
   $newLogFiles = @()
   if (Test-Path -LiteralPath $logDir -PathType Container) {
     $newLogFiles = @(Get-ChildItem -LiteralPath $logDir -Filter 'session-*.jsonl' -File |
       Where-Object { $priorLogNames -notcontains $_.Name })
   }
   if ($newLogFiles.Count -eq 1) {
     $logPath = $newLogFiles[0].FullName
     Write-Output "Run evidence: variant=$phaseVariant; commit=$commit; startedAt=$runStartedAt; log=$($newLogFiles[0].Name); electronExitCode=$runExitCode"
   }
   else {
     Write-Warning "Expected exactly one new session log; found $($newLogFiles.Count). Do not guess which log belongs to this run."
     $newLogFiles | Select-Object Name, Length, LastWriteTime
   }
   ```

4. If exactly one log was identified, inspect it now. Confirm its `position-variant-selected` value matches the phase and compare `registration-baseline`, `ABM_NEW`, `reservation-size`, position samples, `ABM_REMOVE`, `release-verification`, and `safe-shutdown-confirmed`. Pair the log name with the recorded variant, commit SHA, start time, and numeric exit code.

Do not use a generic “newest log” selection when multiple sessions or new files exist. Never rename, delete, or overwrite session logs. If the process does not exit normally, use only the separate-terminal live-read path; do not press `Ctrl+C`.

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
| Node.js / Electron / Koffi versions |  |  |
| Branch and commit SHA |  |  |
| PowerShell run start time |  |  |
| JSONL filename |  |  |
| Phase A/B commit and environment equality gate | Phase A reference | PASS / FAIL / NOT_RUN |
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
