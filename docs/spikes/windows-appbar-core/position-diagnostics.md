# Windows AppBar position diagnostics

## Purpose and limits

This follow-up adds read-only measurements to the isolated AppBar PoC so a human can identify the first point at which its window geometry differs from the accepted AppBar rectangle. It does not change the requested window placement, AppBar registration/update/removal order, shutdown guard, or recovery behavior. It does not automatically reposition the window. Codex must not launch Electron or call AppBar APIs for this procedure.

The supplied measurements are evidence of a mismatch, not a root-cause finding. Keep the API return values, Windows work-area values, and window rectangles as separate observations.

## Existing human observations

Environment reported for the run: Windows 11 Pro, one 1920×1080 display, 96 DPI.

The human reported successful `ABM_NEW`, `ABM_QUERYPOS`, `ABM_SETPOS`, and `SetWindowPos` calls; work-area changes for 90 px and 34 px, restoration to 90 px, `ABM_REMOVE`, and restoration of the pre-registration work area. These results establish that those calls and work-area observations succeeded in that run. They do not establish that the AppBar window occupied the accepted rectangle.

### 90 px reservation

| Measurement | Value |
|---|---|
| Proposed / queried / accepted rectangle | `(0,0)-(1920,90)` |
| Windows work area after reservation | `(0,90)-(1920,1032)` |
| `ABM_QUERYPOS` / `ABM_SETPOS` | `1` / `1` |
| `SetWindowPos` return | `true` |
| `matchesExpectedTop` | `true` |
| AppBar `GetWindowRect` immediately after reservation | `(0,90)-(1936,188)` |

### 34 px reservation

| Measurement | Value |
|---|---|
| Accepted rectangle | `(0,0)-(1920,34)` |
| Windows work area after reservation | `(0,34)-(1920,1032)` |
| AppBar `GetWindowRect` | `(0,34)-(1936,132)` |

Before registration, the AppBar `GetWindowRect` was `(-8,0)-(1928,98)`, despite the Electron creation request being based on the primary display bounds and a height of 90. The supplied records do not include the corresponding Electron outer/content bounds or DWM visible-frame bounds.

The human also supplied `release-verification` with `apiAccepted: true`, `workAreaRestored: true`, `appBarHidden: true`, and `operatorWindowUnchanged: true`, followed by `safe-shutdown-confirmed`. A PowerShell exit code and an independent work-area measurement after process exit were not supplied. Therefore this is evidence for the PoC's in-process explicit release check, not a complete `SC-006` PASS.

## Static analysis and hypotheses

The current call sequence is `ABM_NEW` → `ABM_QUERYPOS` → `ABM_SETPOS` → `SetWindowPos` using the accepted rectangle → `showInactive()`. Existing operation and shutdown behavior is retained. The direct samples around these calls can distinguish their positions in the sequence; hooked Windows-message and BrowserWindow-event samples are deferred and describe geometry at their later measurement time, not at the event instant.

| Hypothesis | Evidence to inspect in the new log | What would weaken/refute it |
|---|---|---|
| A. The HWND rectangle is already displaced immediately after `SetWindowPos`. | Compare `before-setwindowpos` with `after-setwindowpos`, especially Win32 `getWindowRect`, Electron bounds, requested arguments, and accepted rectangle. | `after-setwindowpos` matches the accepted rectangle in comparable coordinate spaces, with mismatch first appearing later. |
| B. `showInactive()` is followed by the displacement. | Compare `before-showinactive`, `after-showinactive`, the `show`/`move`/`resize` and `WM_WINDOWPOSCHANGED` samples, and the finite `after-show-settled` sample. | All measurements remain consistent across the show call and mismatch is present earlier. The API documentation describes `showInactive()` as showing without focus; it does not establish whether this PoC's window geometry changes. |
| C. Windows/AppBar work-area changes coincide with a relocation. | Compare `before-appbar-new` / `after-appbar-new`, query and set-position samples, and their `monitorAndWorkArea` rectangles against window samples. | The mismatch is already present before registration or first appears after a later step without a corresponding work-area change. Timing correlation alone does not prove causation. |
| D. The measured rectangles describe different frame or coordinate spaces. | Compare `GetWindowRect`, Electron `getBounds()` / `getContentBounds()`, and DWM extended-frame bounds; record display scale and DPI. | Comparable measurements in the same coordinate space and frame definition still differ. |

None of A–D is confirmed or ruled out by the supplied measurements. In particular, the 16 px width and 8 px height differences are not attributed to invisible resize borders without the DWM and Electron measurements. Microsoft documents that `GetWindowRect` can include invisible resize borders and is DPI-virtualized; the DWM extended frame excludes those borders and is not DPI-adjusted. Electron returns its own `Rectangle` values, and the Electron Screen API distinguishes physical screen points from DIP points. Do not compare or convert these values without accounting for their coordinate systems and frame definitions.

## Diagnostic fields and event labels

Each JSONL record includes an ISO timestamp in `at` (record creation time). New geometry records use `event: "position-diagnostic"` plus a `label`; failures to collect a sample use `event: "position-diagnostic-capture-error"`. `measurementCapturedAt` marks when the geometry read completed. If capture throws before a complete sample is recorded, `captureFailedAt` identifies the failure time instead. Deferred event samples also include `captureMode: "deferred"`, the original `messageObservedAt` or `eventObservedAt`, and the event sequence/time range. The captured rectangle is a later observation and must not be described as the rectangle at the original message time. A failed measurement is represented as `status: "unavailable"` with a reason where possible. The diagnostics catch measurement failures and continue the existing operation path; they do not claim that a missing measurement passed.

Window measurements are separated by role (`appbar-window` and `operator-window`) and include:

- `getWindowRect`: Win32 rectangle from the corresponding HWND.
- `electronGetBounds`: `BrowserWindow.getBounds()` outer rectangle.
- `electronGetContentBounds`: `BrowserWindow.getContentBounds()` content/client rectangle.
- `isVisible`: `BrowserWindow.isVisible()`.
- `dwmExtendedFrameBounds`: optional `DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)` result, including its HRESULT and returned rectangle. Binding or call failures are recorded as unavailable; no fallback value is substituted.
- `monitorAndWorkArea`: `GetMonitorInfoW` monitor and work-area rectangles.
- `requestedAppBarCreationBounds`, `lastSetWindowPosRequest`, `details`, and `appBarState` / `registrationState`.

The new labels are:

| Label | Capture point |
|---|---|
| `startup-baseline` | Initial window baseline after the operator window is shown. |
| `before-appbar-new` / `after-appbar-new` | Immediately before and after `ABM_NEW`. The after sample also records a thrown call as `callError`. |
| `before-querypos` / `after-querypos` | Immediately before and after `ABM_QUERYPOS`; after includes the result and queried rectangle, or the thrown-call error. |
| `before-setpos` / `after-setpos` | Immediately before and after `ABM_SETPOS`; after includes return value and accepted rectangle when available. |
| `before-setwindowpos` / `after-setwindowpos` | Immediately before and after `SetWindowPos`; includes exact HWND role, x/y, width/height, flags, accepted rectangle, return value, and last error if false. |
| `before-showinactive` / `after-showinactive` | Immediately before and after the existing `showInactive()` call. |
| `after-show-settled` | One finite read-only sample 250 ms after `showInactive()`. The delay is only a sample point, not a guarantee that all OS processing has settled. |
| `before-remove` / `after-remove` | Not emitted in the current diagnostic revision. Dedicated geometry reads were removed from the release path so they cannot run ahead of `ABM_REMOVE`, hiding the bar, or the release check. The `ABM_REMOVE` result/error and existing `after-removal` measurement plus `release-verification` remain. |
| `electron-event:show`, `electron-event:move`, `electron-event:resize` | Read-only samples scheduled after the AppBar `BrowserWindow` event callback returns. Repeated pending events of the same type are coalesced. |
| `win32-message:appbar-callback`, `win32-message:WM_WINDOWPOSCHANGED` | Read-only samples scheduled after the hooked message callback returns. The callback only copies bounded scalar/Buffer data into a bounded in-memory queue. No re-query, re-registration, or relocation is performed. |

Existing `measurement`, `reservation-size`, `ABM_NEW`, `ABM_REMOVE`, `release-verification`, and state events remain in the log. `position-diagnostic-capture-error` means only that a diagnostic sample failed; it must not be confused with an AppBar API result. Deferred queue overflow, lifecycle discard, callback capture failure, and deferred diagnostic failure have separate events. The queue holds at most eight distinct event labels, coalesces same-label events, and processes at most two samples per batch with a minimum 100 ms interval between batches. Pending geometry diagnostics are cancelled when removal or safe shutdown begins. The `REMOVING` state is applied and announced before `ABM_REMOVE`, while its JSONL state record, release-start notification errors, and any pending-drop summary are written after the API attempt and release checks. The release path has no dedicated `positionDiagnosticSnapshot()` before or after `ABM_REMOVE`; its existing `after-removal` `currentSnapshot()` and release flags are retained. The post-removal sample is captured without immediately writing its JSONL record; after the work-area/window flags and final release state are determined, the measurement, API result, verification, and deferred state records are written. `measurementCapturedAt`, `observedAt`, and `transitionObservedAt` distinguish capture/state time from later JSONL `at` write time. Only one `after-show-settled` timer is pending; a newer show/update replaces its pending sample, and removal or safe shutdown cancels it. JSONL write failures continue to be handled by the existing non-throwing `record()` path and do not intentionally short-circuit `ABM_REMOVE` or the shutdown guard.

The window rectangle APIs are measurement-only here. Microsoft documents `GetWindowRect` as screen coordinates, potentially including invisible resize borders and virtualized for DPI. `DWMWA_EXTENDED_FRAME_BOUNDS` is the visible frame measurement and is not DPI adjusted. Electron's `getBounds()` reports the outer bounds and `getContentBounds()` the content-area bounds; Electron Screen documentation distinguishes physical screen points from DIP points. The diagnostic records values as returned and performs no normalization. See [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window), [Electron Screen coordinate spaces](https://www.electronjs.org/docs/latest/api/screen), [Microsoft GetWindowRect](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect), and [Microsoft DWMWINDOWATTRIBUTE](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwmwindowattribute).

## Human-only 90 px procedure

Run this only in an interactive Windows 11 desktop session, on one display at 96 DPI with the ordinary taskbar configuration. Do not run from Codex. Do not use stdout/stderr redirection. No dependency install or download is part of this procedure.

### 1. Resolve and validate the experiment path

Run this block from any directory inside the repository. Use the same block again if a new terminal is opened for another phase. It resolves the repository root from Git each time and refuses to continue if the expected files or pinned dependencies are missing.

```powershell
$repoRoot = (& git rev-parse --show-toplevel 2>$null | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoRoot)) {
    throw 'Current directory is not inside the Tutorial Dock Git repository.'
}
$repoRoot = [System.IO.Path]::GetFullPath($repoRoot.Trim())
$experimentDir = Join-Path $repoRoot 'experiments\windows-appbar-core'
$packagePath = Join-Path $experimentDir 'package.json'
$mainPath = Join-Path $experimentDir 'main.cjs'
$electronExe = Join-Path $experimentDir 'node_modules\electron\dist\electron.exe'

foreach ($requiredPath in @($packagePath, $mainPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required PoC file is missing: $requiredPath"
    }
}
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
if ($package.devDependencies.electron -ne '45.2.3' -or $package.devDependencies.koffi -ne '3.3.7') {
    throw 'The experiment dependency pins differ from Electron 45.2.3 / Koffi 3.3.7; stop and report.'
}
if (-not (Test-Path -LiteralPath $electronExe -PathType Leaf)) {
    throw 'The pinned Electron executable is absent. Do not download or install it as part of this procedure.'
}

Set-Location -LiteralPath $experimentDir
Get-Location
```

Before running, inspect Electron process command lines and confirm this experiment is not already running. Do not stop unrelated Electron processes:

```powershell
Get-CimInstance -ClassName Win32_Process -Filter "Name = 'electron.exe'" |
    Select-Object ProcessId, ExecutablePath, CommandLine
```

Confirm the display count, scale, and taskbar configuration manually. If they do not match the baseline, record that and do not register the AppBar.

### 2. Read the work area without changing it

The following PowerShell 5.1/7-compatible C# interop reads the primary monitor's `MONITORINFO`; it does not call an AppBar API or change Windows state. Run once before launching, and again after the PoC exits. On the single-display baseline this is the target display.

```powershell
if (-not ('TutorialDockWorkAreaProbe' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class TutorialDockWorkAreaProbe {
    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO {
        public uint cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }
    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr MonitorFromPoint(POINT point, uint flags);
    [DllImport("user32.dll", EntryPoint = "GetMonitorInfoW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);

    public static string ReadPrimary() {
        var point = new POINT { X = 0, Y = 0 };
        IntPtr monitor = MonitorFromPoint(point, 1); // MONITOR_DEFAULTTOPRIMARY
        if (monitor == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        var info = new MONITORINFO { cbSize = (uint)Marshal.SizeOf(typeof(MONITORINFO)) };
        if (!GetMonitorInfo(monitor, ref info)) throw new Win32Exception(Marshal.GetLastWin32Error());
        return String.Format("monitor=({0},{1})-({2},{3}); workArea=({4},{5})-({6},{7}); primary={8}",
            info.rcMonitor.Left, info.rcMonitor.Top, info.rcMonitor.Right, info.rcMonitor.Bottom,
            info.rcWork.Left, info.rcWork.Top, info.rcWork.Right, info.rcWork.Bottom,
            (info.dwFlags & 1) != 0);
    }
}
'@
}
[TutorialDockWorkAreaProbe]::ReadPrimary()
```

Record the pre-run value. If it differs from the expected baseline, stop and determine why before any registration. Also confirm the experiment is not already running. The PoC log directory is `experiments\windows-appbar-core\logs`; record the latest existing filename so the new session can be identified.

### 3. Launch, register once, then explicitly remove

Start the PoC in an interactive PowerShell terminal. The direct Electron executable is used; no `npm` command can trigger an install or binary download.

```powershell
& $electronExe $experimentDir
$pocExitCode = $LASTEXITCODE
"PoC process exit code: $pocExitCode"
```

While the process is open:

1. Confirm the operator window appears and reports `AppBar state: unregistered`.
2. Confirm the initial work-area measurement agrees with the externally recorded baseline.
3. Click **Register 90 px top AppBar** once. Do not click any height-change control.
4. Wait for the operation result. Note the `ABM_NEW`, `ABM_QUERYPOS`, `ABM_SETPOS`, and `SetWindowPos` return values separately from work-area and window-rectangle measurements.
5. If position drift is visible, do not try to move or correct the window. Save the log and proceed directly to safe release.
6. Click **Remove and verify**. Continue only if the operator reports release confirmed and the `release-verification` record has `apiAccepted`, `workAreaRestored`, `appBarHidden`, and `operatorWindowUnchanged` all true.
7. If release fails or is uncertain, stop. Keep both PoC windows open and follow its guarded message. Do not force close, restart Explorer/Windows, edit the registry, or use administrator recovery.
8. After explicit release is confirmed, click **Safe exit**. Record the PowerShell exit code returned by the launch command.

### 4. Measure after process exit and inspect JSONL

After PowerShell returns from the process, run the read-only primary work-area probe again. Compare it with the pre-run result. This external post-process reading is additional evidence; the PoC's in-process `release-verification` alone does not prove a process-exit result.

Find and inspect the newest session log:

```powershell
$logPath = Get-ChildItem -LiteralPath (Join-Path $experimentDir 'logs') -Filter 'session-*.jsonl' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $logPath) { throw 'No session JSONL file was found; do not treat the run as successful.' }
Get-Content -LiteralPath $logPath
```

To list geometry labels and times:

```powershell
Get-Content -LiteralPath $logPath |
    ForEach-Object { $_ | ConvertFrom-Json } |
    Where-Object { $_.event -eq 'position-diagnostic' -or $_.event -eq 'position-diagnostic-capture-error' } |
    Select-Object at, event, label, appBarState, details |
    Format-List
```

Keep the original JSONL intact. Before sharing it, redact user names, local paths, or unrelated personal data. Do not remove timestamps or fields needed to compare event order.

## Stop conditions

- The pre-run work area, monitor count, DPI, taskbar setup, dependency pins, or executable does not match the stated baseline.
- AppBar registration or any position/update API reports failure or an uncertain result.
- The operator reports that release is unconfirmed, any release-verification flag is false, or the AppBar remains visible after removal.
- The process does not return normally after confirmed release; do not force-terminate it.
- A JSONL write failure occurs. Preserve the UI's visible state and use the existing guarded release controls; a missing log is not proof of success.
- Any unexpected display/work-area change occurs. Stop other checks and record it; do not attempt OS-level recovery.

## Result record (human to complete)

All runtime results below are pending. API success, a changed work area, a visible position, and successful release are separate observations.

| Item | Result | Evidence |
|---|---|---|
| Environment: Windows build / monitor count / DPI / taskbar | `MANUAL_PENDING` | |
| External work area before launch | `MANUAL_PENDING` | |
| Startup baseline / initial unregistered state | `MANUAL_PENDING` | |
| `ABM_NEW` return | `MANUAL_PENDING` | |
| `ABM_QUERYPOS`: proposed / queried rectangle and return | `MANUAL_PENDING` | |
| `ABM_SETPOS`: submitted / accepted rectangle and return | `MANUAL_PENDING` | |
| `SetWindowPos`: exact x/y/width/height/flags and return | `MANUAL_PENDING` | |
| Work area after reservation | `MANUAL_PENDING` | |
| First label where AppBar geometry differs from accepted rectangle | `MANUAL_PENDING` | |
| `GetWindowRect` / Electron outer and content bounds / DWM bounds | `MANUAL_PENDING` | |
| Explicit `ABM_REMOVE` and in-process release verification | `MANUAL_PENDING` | |
| Safe exit and PowerShell process exit code | `MANUAL_PENDING` | |
| External work area after process exit | `MANUAL_PENDING` | |

When reporting the result, include the full new-session JSONL (with private paths redacted), the pre/post external work-area values, and the first diagnostic label that shows a geometry difference. Do not propose a coordinate correction in the same run.

## Next analysis

At the time of this earlier note, the next reviewer was asked to order `position-diagnostic` entries by `at` and compare the same AppBar HWND across labels before proposing a placement change. The human run recorded below supplies the first reported divergence stage; the implementation mechanism remains undetermined and no automatic correction is approved.

## Follow-up: deferred diagnostics after the 2026-11-08 stalled run

### New human observation

In the human run on Windows 11 Pro (1920×1080, one display, 96 DPI; Electron 45.2.3 and Koffi 3.3.7), `ABM_NEW`, `ABM_QUERYPOS`, `ABM_SETPOS`, and the 90 px work-area reservation succeeded. Before `SetWindowPos`, the request was `(x=0, y=0, width=1920, height=90, flags=84)`; Electron bounds were `(0,0,1920,90)` and the AppBar window was not visible.

During `WM_WINDOWPOSCHANGED`, the recorded work-area top was 90. `GetWindowRect` was `(0,90)-(1936,188)`, Electron bounds were `(x=8,y=90,width=1920,height=90)`, DWM extended-frame bounds were `(7,90)-(1929,181)`, and the window was visible. The JSONL ended at the `position-diagnostic` for that message. It contained no `after-setwindowpos`, show samples, `ABM_REMOVE`, `release-verification`, or `safe-shutdown-confirmed`. The human later observed Electron main/child processes still present and the work area at `(0,0)-(1920,1032)`. That external work-area value does not establish that the AppBar registration was removed.

The prior message callback synchronously called `record()` and `positionDiagnosticSnapshot()`. That performed native geometry reads, Electron bounds reads, DWM, JSON serialization, and synchronous JSONL file append while handling the hooked message. This is a credible investigation target, not a proven explanation for the stall or the missing later entries.

### Diagnostic design change

The hooked Windows-message callbacks now only read the notification/scalar message data, copy at most 16 bytes from Buffer parameters, capture an observation timestamp and sequence number, and enqueue the event. They do not call Win32/DWM/Electron geometry APIs, serialize JSON, write files, or call AppBar APIs. BrowserWindow `show`, `move`, and `resize` listeners use the same deferred route.

After callbacks return, a bounded scheduler performs the JSONL event record and read-only geometry sample. Same-label events are coalesced while queued; the queue accepts at most eight distinct labels, each batch captures at most two labels, and batches are separated by at least 100 ms. Overflow and lifecycle drops are counted while the stop summary is pending. Measurement errors are isolated from AppBar operations. Removal/safe-shutdown start cancels queued diagnostic work and the finite show-settled timer; a newer show/update replaces the one pending settled sample. During removal, the state change to `REMOVING` is applied and announced before `ABM_REMOVE`, but its JSONL entry is buffered. The success-path release sequence still calls `ABM_REMOVE`, attempts to hide the AppBar window, reads the post-removal work area/window state, and decides whether release is confirmed in that order. Release-path JSONL records are written only after those checks; `transitionObservedAt`, the `ABM_REMOVE` `observedAt`, and `measurementCapturedAt` preserve when their facts were observed. This prevents synchronous file writes from preceding the API attempt or release-state decision. No periodic polling, automatic repositioning, retry loop, or AppBar call was added.

For deferred samples, `messageObservedAt` / `eventObservedAt`, `firstEventSequence` / `lastEventSequence`, and `firstAppBarStateAtEvent` / `lastAppBarStateAtEvent` describe the source event(s); `measurementCapturedAt` and the top-level `appBarState` describe the later geometry read. `at` remains the JSONL record timestamp. These timestamps and states must not be conflated. `coalescedCount` is the number of additional same-label events merged into the sample. A delayed rectangle is evidence of geometry at capture time only.

The existing functional sequence and values remain unchanged: `ABM_NEW` → `ABM_QUERYPOS` → `ABM_SETPOS` → `SetWindowPos` with the accepted rectangle and existing flags → `showInactive()`. `ABM_REMOVE`, work-area/window release checks, and the safe-shutdown guard remain behaviorally unchanged; only their JSONL write timing is deferred until the release decision is available. When the bounded diagnostic queue is stopped, its summary is retained in memory until a safe drain; zero-count summaries are omitted, while pending drops and callback failures are recorded after release checks. Events arriving after removal are suppressed without extending the queue and remain countable for the next safe summary drain, including during later safe shutdown. No Windows runtime action was performed by Codex for this update.

### Human-only retest

The processing-stall question is **`MANUAL_PENDING`**. Before starting a new session, a human must inspect existing Electron process command lines and independently read the work area. If the previous PoC's release and exit cannot be confirmed, do not start another instance. Do not terminate an existing process, restart Explorer/Windows, or attempt OS-level recovery. Use the existing Phase 0 path/dependency checks above and a normal interactive Windows PowerShell session with no stdout/stderr redirection.

1. Confirm one display at 96 DPI, the expected work area, pinned Electron/Koffi availability, and no prior PoC instance whose state is unclear.
2. With `$experimentDir` and `$electronExe` set by the validated path block above, launch once in the interactive terminal. Do not redirect stdout/stderr:

   ```powershell
   & $electronExe $experimentDir
   $pocExitCode = $LASTEXITCODE
   "PoC process exit code: $pocExitCode"
   ```

3. Click **Register 90 px top AppBar** exactly once. Do not change height, move the bar, or launch comparison applications.
4. Save the new JSONL. Check for `before-setwindowpos`, `after-setwindowpos`, `before-showinactive`, `after-showinactive`, and `after-show-settled`. The message hook's lightweight event is queued during the native call; its `wm-windowposchanged-observed` and `win32-message:WM_WINDOWPOSCHANGED` records are expected only after the callback returns. Compare `messageObservedAt` / `eventObservedAt` and sequence numbers with `measurementCapturedAt`; do not assign the delayed rectangle to the original event time.
5. Click **Remove and verify**. Continue only if the PoC confirms release and all release-verification flags are true. If removal is failed or uncertain, stop and follow the existing guarded UI; do not force-close.
6. Click **Safe exit** only after release confirmation. Record the PowerShell exit code and read the work area again after PowerShell regains control.

Do not repeat registration, run height changes, or conduct additional repositioning tests in this run. Preserve the full JSONL privately and redact local paths/user names before sharing.

| Human check | Result | Evidence |
|---|---|---|
| Prior process/release state and pre-run work area confirmed | `MANUAL_PENDING` | |
| 90 px registration performed once | `MANUAL_PENDING` | |
| `after-setwindowpos` and following samples recorded | `MANUAL_PENDING` | |
| Explicit removal and all release flags confirmed | `MANUAL_PENDING` | |
| Safe exit and PowerShell exit code | `MANUAL_PENDING` | |
| Post-exit work area matches pre-run value | `MANUAL_PENDING` | |
| Deferred diagnostics prevent the prior stall | `MANUAL_PENDING` | |
| AppBar position mismatch cause / correction | `MANUAL_PENDING` | |

## Human Windows run: deferred diagnostics and first displacement stage (2026-11-10)

### Environment and scope

The human reported a Windows 11 Pro system at 1920×1080, one display, 96 DPI, Electron 45.2.3, and Koffi 3.3.7. The latest PR #9 instrumentation was run. Codex did not execute Electron or AppBar APIs and did not alter Windows state during this documentation update.

This is a single 90 px registration, measurement, explicit removal, and Safe exit run. No position correction or additional height test is reported.

### Reservation and diagnostic continuation

Reported results: `ABM_NEW=1`, `ABM_QUERYPOS=1`, `ABM_SETPOS=1`, and `SetWindowPos=true`. The accepted AppBar rectangle was `(0,0)-(1920,90)`. The measured reserved work area was `(0,90)-(1920,1032)`.

The JSONL contained `before-setwindowpos`, `after-setwindowpos`, `before-showinactive`, `after-showinactive`, and `after-show-settled`. Thus the earlier behavior—logs stopping during the message diagnostic with later steps absent—did not recur in this reported run. `SetWindowPos` returned and subsequent Electron processing continued. This supports continuing with the deferred instrumentation, but does not prove that it was the exact cause of the prior stall or that other environments cannot stall.

### Earliest reported position mismatch

| Label | Electron X | Electron Y |
|---|---:|---:|
| `after-setpos` | 0 | 0 |
| `before-setwindowpos` | 0 | 0 |
| `after-setwindowpos` | 8 | 90 |
| `after-showinactive` | 8 | 90 |
| `after-show-settled` | 8 | 90 |

The Electron window's first reported displacement is already present at `after-setwindowpos`: the window is at `(8,90)` while the accepted reservation starts at `(0,0)`. It remains there in the later show samples. Therefore `showInactive()` alone did not first create the observed displacement. The evidence places its occurrence within `SetWindowPos` or its synchronous window-position handling before the call returned. It does not determine which internal routine changed the coordinates. Windows work-area-based Electron/Chromium window constraints are one hypothesis only, not a confirmed cause.

`SWP_NOSENDCHANGING` may be compared in a future, separately scoped experiment. It was not added, and its effect is unknown. Fixed offsets, flag changes, BrowserWindow changes, and repositioning loops are not authorized by this result.

### Removal evidence and SC-006 boundary

The human reported `ABM_REMOVE.returnValue=1`, `release-verification.apiAccepted=true`, `workAreaRestored=true`, `appBarHidden=true`, and `operatorWindowUnchanged=true`. The subsequent `safe-shutdown-confirmed` reported state `released`. The measured post-removal work area was `(0,0)-(1920,1032)`.

The shared JSONL does not include the PowerShell exit code or a separate work-area measurement taken after the process exited. Keep the in-process release checks separate from complete external confirmation of `SC-006`.

### Results

| Verification item | Result | Evidence boundary |
|---|---|---|
| 90 px AppBar registration | `PASS` | `ABM_NEW=1` reported |
| Windows work-area reservation | `PASS` | Accepted `(0,0)-(1920,90)`; work area `(0,90)-(1920,1032)` reported |
| `SetWindowPos` normal return | `PASS` | `true`; subsequent events recorded |
| `showInactive()` continuation | `PASS` | Before/after events and settled sample recorded |
| Deferred diagnostic logging | `PASS` | Required labels through `after-show-settled` reported |
| First displacement stage identified | `PASS` | First mismatch at `after-setwindowpos` |
| Accepted rectangle and displayed Electron position match | `FAIL` | Electron position `(8,90)` while accepted top is `0` |
| Explicit `ABM_REMOVE` | `PASS` | Return value `1` reported |
| In-process release verification | `PASS` | API and three state flags all reported true |
| Safe exit path | `PASS` (log evidence) | `safe-shutdown-confirmed`, state `released` |
| PowerShell process exit code | `NOT_CONFIRMED` | Numeric code not included |
| Independent work-area measurement after process exit | `NOT_CONFIRMED` | Not included in shared evidence |
| Exact root cause of displacement | Unresolved | Stage identified, internal mechanism unknown |

For this Spike, `PASS` on the diagnostic objective means that post-`SetWindowPos` samples were recorded and the first observed mismatch stage was identified. The `FAIL` for displayed-position alignment is a finding, not a failure to achieve this PR's diagnostic purpose. The feature acceptance criteria are not all passed by this experiment; the product specification remains unchanged.

| Follow-up status | Result |
|---|---|
| Deferred diagnostics prevent recurrence in this run | `PASS` for this observed run; causal proof and cross-environment guarantee are not established |
| Position correction | Not implemented; next Technical Spike required |
| Full external `SC-006` confirmation | `NOT_CONFIRMED` |
