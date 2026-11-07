# Windows AppBar Core Spike

## Purpose and scope

This Technical Spike tests whether an Electron `BrowserWindow` can be registered as a Windows AppBar and whether Windows reports a corresponding work-area change. It is an experiment, not the start of the production implementation. It covers TS-01 and probes SC-002a, SC-002b, SC-003, and SC-006 from [`specs/windows-appbar/spec.md`](../../../specs/windows-appbar/spec.md).

The experiment distinguishes three results:

1. `SHAppBarMessage` calls return the documented result.
2. `GetMonitorInfo` reports a changed `rcWork` for the target monitor.
3. Other applications actually avoid the reserved area when maximized.

Passing one does not imply the next passed. This Spike does not exercise display switching, mixed DPI, update failure, abnormal termination, or production packaging.

## Environment and preflight

Record actual values; do not change the machine to match the baseline.

| Item | Observed before experiment |
|---|---|
| Git base | `origin/main` = `84b572cd3e8d3a7c5524950c2d52aa319162d37b` (includes merged PR #6) |
| OS version/build | Windows 11 Pro, 26H2, build `26300.9818`; registry `ProductName` reports `Windows 10 Pro`, while `DisplayVersion=26H2`, `CurrentBuild=26300`, and `EditionID=Professional`. Microsoft identifies build 26300 as Windows 11 26H2 ([supported versions](https://learn.microsoft.com/en-us/windows/release-health/supported-versions-windows-client)). |
| Architecture | x64 |
| Node.js / npm | `v24.12.0` / `11.13.0` |
| Python | `3.13.7` |
| PowerShell | `7.6.9`; Windows PowerShell 5.1 executable is present |
| Electron / C++ build toolchain | Not installed globally at preflight |
| Monitor count and primary bounds | 1; `\\.\DISPLAY1`, `(0,0)-(1920,1080)` |
| Pre-experiment work area | `(0,0)-(1920,1032)` |
| Taskbar | Visible, bottom; `(0,1032)-(1920,1080)` |
| Other Electron, Node, Tableau, or Notepad processes | None found at preflight |
| Primary monitor DPI | 96 × 96 (100%), read with `GetDpiForMonitor` |

The local registry's legacy `ProductName` string conflicts with its `DisplayVersion` and build. The build/version mapping is recorded as Windows 11 26H2 based on Microsoft's release information; the raw registry values are retained above for reproducibility. The machine matches the requested OS family and single-monitor/100%-scale baseline, though the AppBar behavior itself remains unverified. The Spike must not change OS, display, DPI, taskbar, or security settings.

## Compared integration options

| Option | Strengths | Costs and risks |
|---|---|---|
| Node-API native addon | Direct access to the Electron `HWND`, native message handling, and AppBar lifecycle in one process; Node-API can reduce dependence on a particular V8 ABI. | Requires native build/rebuild for target architecture/runtime and packaging the `.node` module into the portable app; native memory/message bugs can crash the app. Electron documents that native modules normally need Electron-compatible rebuilding. No C++ build toolchain is present on this machine. |
| Separate Windows helper process | Can isolate Win32 code and failures; a helper-owned native window can receive AppBar notifications. A self-contained helper could be shipped beside the portable app. | Adds IPC, lifecycle, distribution, and versioning work. Registering the Electron `HWND` from another process still routes notifications to Electron's window procedure; registering a helper-owned window means the visible Electron window is a separate surface that must be synchronized. |
| Dynamic C FFI (`koffi`) | Can call Win32 APIs directly from Electron main process and pass its `HWND`; `BrowserWindow.hookWindowMessage` can receive the registered callback. A prebuilt x64 package avoids requiring a compiler for this probe. | Adds a native runtime dependency and ABI/packaging surface. FFI declarations and structure layout are easy to get wrong; Electron and Koffi update compatibility and portable packaging must be verified, including how the native package is included outside ASAR. |

**Experiment choice:** dynamic C FFI from Electron main process, with the Electron `BrowserWindow` as the AppBar window. This choice minimizes setup on the available machine and is intended to test the exact HWND/message path. It is not a production architecture decision. **Preliminary production candidate:** a narrow Node-API bridge, if the test confirms it can own the lifecycle/message integration and if build/rebuild and portable packaging are acceptable. Electron documents that native modules generally need Electron-compatible rebuilding; Node-API reduces runtime ABI coupling only when the addon uses the stable Node-API surface. A helper process remains an alternative if isolation is more important than its HWND/message synchronization cost. No approach is approved by this Spike.

## OS-state safety and recovery plan

The only intended machine-state change is a temporary top-edge AppBar reservation by the PoC window. At the recorded baseline, the Windows work area is `(0,0)-(1920,1032)` and the visible taskbar occupies the bottom 48 pixels. A successful 90-pixel top reservation is expected to change the top of `rcWork`; this is a hypothesis to measure, not a guaranteed result.

Before registration, the PoC measures the monitor bounds, `rcWork`, monitor count, window DPI, and taskbar bounds and logs them. Registration starts only from the PoC's explicit control. The PoC records each AppBar call and a fresh `GetMonitorInfo` result.

Normal exit is guarded: closing the PoC while registered first sends `ABM_REMOVE`, then checks that `rcWork` exactly matches the pre-registration baseline. If the API call fails or the work area does not return to baseline, the PoC remains open and reports the unconfirmed state; do not run more tests or force-terminate it. Stop and report the observed state for human handling. No Explorer restart, administrator action, registry edit, or process termination is part of recovery. Crash/forced-termination testing is explicitly excluded.

The PoC updates its in-memory registration state immediately after successful `ABM_NEW`/`ABM_REMOVE` results so logging failures cannot bypass cleanup state. File/UI logging errors are reported when possible and do not interrupt the release path.

The procedure is: measure baseline → register at 90 px → change to 34 px → restore to 90 px → remove and verify exact baseline → close normally. The dimensions are temporary experiment values only, not product decisions.

## Reproduction

From `experiments/windows-appbar-core/`:

```powershell
npm ci
npm start
```

The application starts without reserving any area. First inspect its measured environment and baseline. Use the UI to start the reservation, change 90 px to 34 px, restore 90 px, then release it. Do not start if the monitor count is not one or the measured DPI is not 96; record those criteria as `NOT_RUN` instead. Do not force-close the PoC.

Runtime JSONL logs are written under the experiment's ignored `logs/` directory. Copy only sanitized measurements and relevant results into this report. Do not commit machine-specific paths, window handles, tokens, or unrelated console output.

To compare normal maximized windows, maximize a newly launched Notepad and (if available) Tableau Desktop while the reservation is active. Record each window's actual bounds and whether it overlaps the bar. Close only instances launched for this Spike, using their normal UI close path. Do not close pre-existing user processes.

## Results

### What ran

- `npm install --no-audit --no-fund` installed the pinned package metadata/dependencies (`electron@45.2.3`, `koffi@3.3.7`). The Electron executable itself was not downloaded.
- `node --check main.cjs`, `preload.cjs`, and `renderer.js`: `PASS`.
- In stock Node.js `v24.12.0`, Koffi loaded `user32.dll` and `shell32.dll`. Read-only `GetMonitorInfoW`, `GetDpiForMonitor`, and `SHAppBarMessage(ABM_GETSTATE)` calls ran. `MONITORINFO` measured 40 bytes and x64 `APPBARDATA` measured 48 bytes. The monitor bounds/work area and 96 DPI matched the baseline above. `ABM_GETSTATE` returned `0`; this is a taskbar state value, not an AppBar registration result.
- No `ABM_NEW`, `ABM_QUERYPOS`, `ABM_SETPOS`, or `ABM_REMOVE` call was made. No AppBar reservation was created, and no OS work-area state was changed by this Spike.

### Execution blocker

Running the pinned Electron launcher to obtain its version failed twice with Node's `TypeError: fetch failed` while it attempted to download the Electron binary. The second attempt was the single unchanged retry. A subsequent elevated retry was rejected by automatic approval review because retrying the same download after the repository retry limit would violate the bounded-retry rule; the rejection specifically instructed not to bypass it with another path. The Electron application was not started. No alternative downloader or runtime path was used.

Tableau Desktop is installed but was not launched because there was no active AppBar reservation to test. Neither Tableau nor Notepad window bounds/overlap were measured.

A new authorized environment with official Electron binary access is required to resume the empirical AppBar test. Until then, the work-area reservation and Electron `HWND`/callback path remain unverified.

| Item | Related criterion | Result | Evidence |
|---|---|---|---|
| Electron calls AppBar API and receives callback | TS-01 | `NOT_RUN` | Electron binary unavailable; no Electron HWND was obtained |
| Work-area bounds change after reservation | SC-002a | `NOT_RUN` | Baseline read-only measurement only; no reservation call |
| Ordinary maximized app avoids the bar | SC-002b | `NOT_RUN` | No reservation was active; app was not launched for this check |
| Tableau Desktop avoids the bar | SC-002b | `NOT_RUN` | Tableau installed but not launched; no reservation was active |
| 90 px → 34 px → 90 px reservation changes | SC-003 | `NOT_RUN` | No reservation call |
| Normal exit unregisters and restores the baseline | SC-006 | `NOT_RUN` | `ABM_REMOVE` was not called |

The key hypothesis cannot yet be judged. The read-only Node/Koffi checks establish that this x64 Node process can load the FFI package and query monitor/work-area APIs. They do not show that Electron can register its window, that Windows work area changes, or that maximized applications avoid a reserved region. Conclusion: **environment restriction prevented a determination**. All production acceptance criteria remain unpassed.

## Technical references

- [Electron `BrowserWindow` API](https://www.electronjs.org/docs/latest/api/browser-window/) (`getNativeWindowHandle`, `hookWindowMessage`)
- [Microsoft `SHAppBarMessage`](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shappbarmessage)
- [Microsoft AppBar usage and lifecycle](https://learn.microsoft.com/en-us/windows/win32/shell/application-desktop-toolbars)
- [Microsoft `ABM_NEW`](https://learn.microsoft.com/en-us/windows/win32/shell/abm-new)
- [Microsoft `ABM_QUERYPOS`](https://learn.microsoft.com/en-us/windows/win32/shell/abm-querypos)
- [Microsoft `ABM_SETPOS`](https://learn.microsoft.com/en-us/windows/win32/shell/abm-setpos)
- [Microsoft `ABM_REMOVE`](https://learn.microsoft.com/en-us/windows/win32/shell/abm-remove)
- [Microsoft `MONITORINFO.rcWork`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-monitorinfo)
- [Koffi](https://koffi.dev/) (experiment-only FFI option)
