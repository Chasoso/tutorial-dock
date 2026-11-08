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

The current call sequence is `ABM_NEW` → `ABM_QUERYPOS` → `ABM_SETPOS` → `SetWindowPos` using the accepted rectangle → `showInactive()`. Existing operation and shutdown behavior is retained. Previously, the first post-position geometry measurement was after `showInactive()`, so the provided logs could not identify whether the mismatch first appeared during `SetWindowPos`, showing, or later OS/window processing.

| Hypothesis | Evidence to inspect in the new log | What would weaken/refute it |
|---|---|---|
| A. The HWND rectangle is already displaced immediately after `SetWindowPos`. | Compare `before-setwindowpos` with `after-setwindowpos`, especially Win32 `getWindowRect`, Electron bounds, requested arguments, and accepted rectangle. | `after-setwindowpos` matches the accepted rectangle in comparable coordinate spaces, with mismatch first appearing later. |
| B. `showInactive()` is followed by the displacement. | Compare `before-showinactive`, `after-showinactive`, the `show`/`move`/`resize` and `WM_WINDOWPOSCHANGED` samples, and the finite `after-show-settled` sample. | All measurements remain consistent across the show call and mismatch is present earlier. The API documentation describes `showInactive()` as showing without focus; it does not establish whether this PoC's window geometry changes. |
| C. Windows/AppBar work-area changes coincide with a relocation. | Compare `before-appbar-new` / `after-appbar-new`, query and set-position samples, and their `monitorAndWorkArea` rectangles against window samples. | The mismatch is already present before registration or first appears after a later step without a corresponding work-area change. Timing correlation alone does not prove causation. |
| D. The measured rectangles describe different frame or coordinate spaces. | Compare `GetWindowRect`, Electron `getBounds()` / `getContentBounds()`, and DWM extended-frame bounds; record display scale and DPI. | Comparable measurements in the same coordinate space and frame definition still differ. |

None of A–D is confirmed or ruled out by the supplied measurements. In particular, the 16 px width and 8 px height differences are not attributed to invisible resize borders without the DWM and Electron measurements. Microsoft documents that `GetWindowRect` can include invisible resize borders and is DPI-virtualized; the DWM extended frame excludes those borders and is not DPI-adjusted. Electron returns its own `Rectangle` values, and the Electron Screen API distinguishes physical screen points from DIP points. Do not compare or convert these values without accounting for their coordinate systems and frame definitions.

## Diagnostic fields and event labels

Each JSONL record includes an ISO timestamp in `at`. New geometry records use `event: "position-diagnostic"` plus a `label`; failures to collect a sample use `event: "position-diagnostic-capture-error"`. A failed measurement is represented as `status: "unavailable"` with a reason where possible. The diagnostics catch measurement failures and continue the existing operation path; they do not claim that a missing measurement passed.

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
| `before-remove` / `after-remove` | Immediately before and after `ABM_REMOVE`, including a thrown-call error if present. |
| `electron-event:show`, `electron-event:move`, `electron-event:resize` | Event-driven read-only samples from the AppBar `BrowserWindow`. |
| `win32-message:appbar-callback`, `win32-message:WM_WINDOWPOSCHANGED` | Read-only sample when the existing hooked message is observed. No re-query, re-registration, or relocation is performed. |

Existing `measurement`, `reservation-size`, `ABM_NEW`, `ABM_REMOVE`, `release-verification`, and state events remain in the log. `position-diagnostic-capture-error` means only that a diagnostic sample failed; it must not be confused with an AppBar API result. JSONL write failures continue to be handled by the existing non-throwing `record()` path and do not intentionally short-circuit `ABM_REMOVE` or the shutdown guard.

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

The next reviewer should order `position-diagnostic` entries by `at` and compare the same AppBar HWND across labels. Determine the earliest sample at which each rectangle diverges, separately compare Electron and DWM measurements, and note whether a `move`, `resize`, `show`, or `WM_WINDOWPOSCHANGED` event preceded it. Only then propose the smallest placement change. Until that new human evidence exists, the cause remains undetermined and no automatic correction is approved.
