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

## Follow-up: isolated operator window and read-only Electron investigation

This follow-up addresses the review risk that shrinking the AppBar window to 90 px or 34 px could also hide the controls needed to release it. It does not register an AppBar, change the Windows work area, launch Electron, or retrieve an Electron binary.

### PoC window separation and release guard

The PoC now creates two `BrowserWindow`s:

- **AppBar window** (`appbar.html` / `appbar.css`): a minimal, non-focusable strip. Its HWND alone is used in `APPBARDATA`, monitor selection, `SetWindowPos`, and AppBar message hooks. It has no experiment controls.
- **Operator window** (`index.html` / `renderer.js`): retains measurement, registration, height-change, removal, log, and safe-exit controls. Its HWND is measured separately and is never passed to an AppBar call or moved/resized by the reservation code.

The main process serializes measure/register/update/remove operations and exposes the explicit states `unregistered`, `registering`, `registered`, `updating`, `removing`, `released`, and `release-unconfirmed`. The work-area and operator-window baselines are captured immediately before `ABM_NEW`, avoiding use of an earlier startup measurement as the release baseline. A successful `ABM_REMOVE` return alone is insufficient: release is recorded only after `rcWork` exactly matches that baseline, the AppBar window is hidden, and the operator-window bounds still match. Otherwise the status remains unconfirmed and the operator window stays available for human inspection.

Close requests from either window, the safe-exit control, and `before-quit` go through the same guarded shutdown path. The AppBar window is not allowed to close until release is confirmed. If release cannot be confirmed, an error dialog is shown and both windows remain open. JSONL file and renderer logging errors are handled separately; event logging does not write to stdout/stderr or control AppBar state transitions. A JSONL write failure sets a nonzero process exit code, appears in the operator event/state display where available, and leaves the guarded removal path callable. This guard covers normal PoC shutdown only; it does not promise OS recovery after process crash or forced termination. Keeping a window open is not itself proof that the Windows reservation has been restored.

### AppBar notification limitation

The AppBar callback and `WM_WINDOWPOSCHANGED` hooks remain **log-only**. `ABN_POSCHANGED` does not trigger a new `ABM_QUERYPOS`/`ABM_SETPOS` sequence or relocation. The PoC does not send `ABM_WINDOWPOSCHANGED` after repositioning. Correct alignment between the window rectangle and reserved rectangle, shell/taskbar-induced repositioning, and notification-driven recovery therefore remain unverified. The PoC must not be described as a complete AppBar implementation.

### Read-only Electron acquisition investigation (earlier inspection)

At that inspection, no installation, download, alternate mirror, network probe, or Electron launch was performed.

| Check | Observation |
|---|---|
| Installed package metadata | `node_modules/electron/package.json` exists and reports `45.2.3`; its `install.js` and `@electron/get` `5.1.0` are present. Package metadata does not include the executable. |
| Local executable | `node_modules/electron/dist/electron.exe` and `node_modules/electron/path.txt` are absent. `electron` / `electron.exe` were not found on `PATH`. |
| Electron download cache | The default cache location was derived offline from the installed `@electron/get`/`env-paths` code and is absent or empty. No existing standalone Electron runtime was found in the inspected locations. |
| Download configuration | No project/user/global `.npmrc` with relevant Electron mirror/cache settings was found in the inspected standard locations. `ELECTRON_OVERRIDE_DIST_PATH`, `electron_config_cache`, custom Electron mirror/path variables, proxy environment variables, and `ELECTRON_GET_USE_PROXY` were unset. HKCU Internet Settings showed `ProxyEnable=0` and no `ProxyServer`/`AutoConfigURL`. |
| WinHTTP proxy | **Unknown.** The available `netsh` did not recognize the read-only `winhttp show proxy` command, so no conclusion is drawn about WinHTTP proxy configuration. |
| npm cache/log details | Standard npm debug-log locations inspected were absent/empty. An npm cache configuration query was rejected by the environment as protected; its internal error path was not inspected. No lower-level log proving the failed network stage was available. |
| Prior error | The earlier Electron launcher attempt reported `TypeError: fetch failed`; the single unchanged retry was already used. A later escalated retry was rejected by automatic approval review under the bounded-retry rule. No retry or workaround was attempted here. |

**Correction:** the URL above was incorrectly calculated by calling `getArtifactRemoteURL` with the unnormalized version. The actual `downloadArtifact` path first calls `getArtifactVersion`, which normalizes `45.2.3` to `v45.2.3`, and then builds the filename and URL. The normal package path therefore produces `electron-v45.2.3-win32-x64.zip` at `https://github.com/electron/electron/releases/download/v45.2.3/electron-v45.2.3-win32-x64.zip`. The package's bundled checksum key matches that filename. The earlier failed attempt's detailed URL was not retained, so URL mismatch is **not established as its cause**; the previous error remains unexplained.

The cause of `TypeError: fetch failed` remains **undetermined**. DNS resolution, HTTPS connectivity, TLS validation, network policy, system/WinHTTP proxy behavior, and a transient GitHub-side failure were not discriminated. A corrupt Electron cache is not supported by the observed state because the expected cache and executable are absent, but the failed request's exact point of failure is unknown. Local execute permission was not tested because there is no executable to launch.

At the time of this earlier inspection, a new human-authorized attempt to retrieve the pinned official artifact was the resume condition. That approval was provided and used once in the follow-up below.

### Follow-up verification status

Static checks performed for that PoC change: JavaScript syntax checks for `main.cjs`, `preload.cjs`, and `renderer.js`; JSON parsing of `package-lock.json`; and `git diff --check`. They do not exercise Electron IPC, Win32 calls, or OS behavior. The PoC code uses only the AppBar window handle for AppBar operations and compares the operator-window bounds at release.

| Check | Related criterion | Follow-up result |
|---|---|---|
| Separate control and AppBar windows; correct HWND references | TS-01 / safety prerequisite | Static inspection only; runtime `NOT_RUN` |
| Work-area reservation / maximized-window behavior | SC-002a / SC-002b | `NOT_RUN`; no AppBar API call or Electron launch |
| Height change and separate operator-window bounds | SC-003 | `NOT_RUN`; no AppBar API call or Electron launch |
| Release and normal shutdown verification | SC-006 | `NOT_RUN`; no AppBar API call or Electron launch |
| `ABN_POSCHANGED` relocation and `ABM_WINDOWPOSCHANGED` notification | Spike follow-up | Not implemented and `NOT_RUN`; explicitly out of the current PoC behavior |
| Electron binary retrieval failure cause | Environment investigation | Partially investigated; exact network failure stage remains unknown |

## Follow-up: official Electron retrieval and PoC startup (2026-11-08)

This follow-up used the human-approved single acquisition attempt. The official Electron release URL and bundled SHA-256 were verified before retrieval. No mirror, alternate source, administrator install, security-setting change, or AppBar registration was used.

### URL-generation verification

Read-only inspection of the installed `@electron/get` 5.1.0 source established the actual path through `downloadArtifact`: it calls `getArtifactVersion(details)` before `getArtifactFileName(details)` and `getArtifactRemoteURL(details)`. With Electron package version `45.2.3`, `artifactName=electron`, `platform=win32`, and `arch=x64`, and with no mirror/custom URL overrides present, the values were:

- normalized version: `v45.2.3`
- artifact: `electron-v45.2.3-win32-x64.zip`
- URL: `https://github.com/electron/electron/releases/download/v45.2.3/electron-v45.2.3-win32-x64.zip`
- bundled SHA-256: `489cd061908e697394b004298bf5ffd345c935d10e8ca197ba819f019ab2dec0`

The earlier investigation's direct call to `getArtifactRemoteURL` skipped the preceding normalization step and consequently reported the wrong URL. That was an error in the investigation record, not evidence of an override in the package configuration. The earlier `TypeError: fetch failed` still cannot be attributed to that incorrect recorded URL because its original full request log is unavailable.

### Retrieval and executable verification

The local Electron CLI invoked the package's `install.js` once. Its detailed diagnostic log records a cache miss followed by a download from the official URL above, artifact validation, and cache placement. The locally computed SHA-256 of the downloaded archive matched the bundled checksum exactly: `489cd061908e697394b004298bf5ffd345c935d10e8ca197ba819f019ab2dec0`. The archive size was 158,182,975 bytes. The CLI returned `v45.2.3` with exit code 0. The binary is present at the experiment dependency's expected path; no package version or repository dependency declaration changed.

The diagnostic log is under the ignored experiment `logs/` directory and is not committed. Its local paths are omitted from this document.

### PoC startup attempt and Windows state

The first `npm start` exited with code 1 and produced no PoC session log. A single diagnostic startup attempt with Electron logging enabled then exited with code `-2147483645` (`0x80000003`). Its captured output was `Received fatal exception EXCEPTION_BREAKPOINT` followed by an unresolved backtrace with no symbols. No `session-*.jsonl` file was created, and no Electron process remained. The Codex desktop window inventory showed neither the operator window nor the AppBar window.

A read-only query of recent Windows Application events for Electron failures was denied with `Attempted to perform an unauthorized operation`; it was not retried with elevated privileges. The available log does not identify the faulting module or prove whether the exception occurred in Electron startup, loading the app's native dependency, or another startup component. No cause is asserted.

After the failed startup, a read-only `GetMonitorInfoW` measurement reported one monitor `(0,0)-(1920,1080)` and work area `(0,0)-(1920,1032)`, matching the recorded pre-experiment baseline. No `SHAppBarMessage` registration/update/removal call was made, and the work area was not changed by this follow-up.

| Check | Result | Evidence / limitation |
|---|---|---|
| Actual URL generated by the normal `@electron/get` flow | `PASS` | Normalization + filename + URL generation produced the official URL above; no URL override was present. |
| Electron 45.2.3 binary retrieval | `PASS` | One authorized CLI install attempt; downloaded archive SHA-256 matched Electron's package-bundled checksum. |
| Electron executable/version | `PASS` | Local CLI returned `v45.2.3`, exit code 0. |
| PoC application startup | `FAIL` | Diagnostic launch exited `0x80000003` with `EXCEPTION_BREAKPOINT`; faulting module is unknown. |
| Operator and AppBar windows displayed | `NOT_RUN` | The app terminated before either window appeared; desktop inventory confirmed neither was present. |
| Work area unchanged | `PASS` | Post-attempt `GetMonitorInfoW` matched the recorded baseline; no AppBar API registration was called. |
| AppBar registration, height changes, and release | `NOT_RUN` | Explicitly not attempted. |

AppBar hardware verification **cannot proceed yet** because the PoC does not start. The next step is to identify the startup exception, starting with a human-accessible Windows Application/WER record for the captured time or a crash report that identifies the faulting module. This environment denied the read-only event-log query, and no further launch or privileged query was attempted. After the failure is understood and an authorized corrective change is reviewed, rerun only the no-registration startup check before proceeding to any AppBar operation.

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

## Follow-up: bounded Electron startup isolation (2026-11-08)

This follow-up distinguishes Electron's basic startup from the existing PoC initialization. It uses the already retrieved and checksum-verified Electron `v45.2.3`; it did not download or reinstall any dependency.

### Test A: Electron without Koffi or Win32 calls

A temporary diagnostic app was prepared under `startup-diagnostic/electron-only/`. It required only Electron and Node.js built-ins, created one window with inline HTML, and contained no Koffi import, Win32 call, AppBar operation, or external service. Its JavaScript passed `node --check`. The temporary diagnostic source was removed after the attempt; the existing PoC and production application were not changed.

The existing `electron.exe` was invoked directly once with Electron logging directed to stderr. The attempt did not produce an observable window in the Codex desktop inventory, and no Electron process remained afterward. The captured console file was empty (0 bytes), the app's JSONL lifecycle log was not created, and PowerShell did not provide a child exit code. The wrapper command's exit status of 0 is not evidence that Electron started successfully. No usable crash record or standard error was captured.

Therefore, GUI display and normal window close are **not confirmed**. The earlier separate PoC run's `0x80000003` (`EXCEPTION_BREAKPOINT`) remains recorded above; this minimal attempt yielded no output with which to reproduce or rule out that exception. The cause cannot be assigned to Electron itself, the diagnostic harness, or the surrounding execution environment.

### Test B: Koffi

`NOT_RUN`. Test A did not confirm a visible, functioning Electron window, so the conditional Koffi test was not started. No Koffi import or Win32 API call was executed by this follow-up.

### Windows work-area state and AppBar criteria

After the attempt, a separate read-only `GetMonitorInfo` query reported monitor bounds `(0,0)-(1920,1080)` and work area `(0,0)-(1920,1032)`, matching the previously recorded baseline. No AppBar API or other work-area-changing operation was invoked. This confirms the measured work area remained at baseline; it does not validate AppBar behavior.

| Check | Result | Evidence / limitation |
|---|---|---|
| Electron 45.2.3 basic startup and visible one-window UI | `INCONCLUSIVE` | One launch was attempted, but it produced no visible window and no usable child exit/crash result; unable to distinguish startup failure from execution/capture limitation. |
| Normal close of the minimal app | `NOT_RUN` | No functioning window was confirmed. |
| Koffi load and read-only Win32 query in Electron | `NOT_RUN` | Conditional on Test A success; not attempted. |
| Work area unchanged | `PASS` | Read-only post-attempt measurement matched baseline `(0,0)-(1920,1032)`; no AppBar API was called. |
| AppBar registration, work-area reservation, maximized-window overlap, height update, and release | `NOT_RUN` | No AppBar operation was invoked. Existing runtime acceptance criteria remain unpassed. |

### Conclusion and resume condition

Classification: **4. Environment constraints prevented isolation.** The available execution did not expose a window, a child exit code, stderr, or crash information. This is insufficient evidence to conclude that Electron's basic startup fails, and Test B cannot be meaningfully run. The previous `EXCEPTION_BREAKPOINT` remains an unresolved observation rather than a confirmed cause.

Do not continue launching Electron in this environment as part of this bounded investigation. Resume in an interactive Windows environment where the operator can verify the window and capture the actual child exit/output or an accessible crash record. First repeat only Test A using the existing verified binary; run Test B only after A visibly succeeds and closes normally. Keep all AppBar runtime criteria `NOT_RUN` until a later, separately authorized experiment.

## Manual diagnostic package

To run the bounded startup separation from a normal Windows 11 desktop session, use the [manual Electron startup diagnostic](manual-electron-startup.md). It provides separate Test A (Electron only) and conditional Test B (Koffi plus read-only monitor information) commands. The diagnostic source lives under `experiments/windows-appbar-core/startup-diagnostic/`, uses the existing pinned dependencies without installing or downloading, and contains no AppBar operation. At the time of this earlier record, manual execution was still pending; the later human results and remaining checks are recorded below. AppBar acceptance remains `NOT_RUN`.

## Follow-up: EPIPE investigation and JSONL-only diagnostics (2026-11-08)

This update records human-run evidence from the original manual diagnostic and changes only diagnostic logging plus the run instructions. Codex did not launch Electron, call AppBar APIs, or alter the Windows work area.

### Human Test A/B observations

The supplied Test A result was `PASS` for visible window and normal close. That run used the pre-change Test A source. Its main-process logger and heading have now changed; the previous result is retained as evidence for the earlier source version and does not validate the edited source.

The supplied Test B JSONL captured the following sequence: Electron `45.2.3` / Node `24.22.2`; Koffi `3.3.7` loaded; read-only bindings for `MonitorFromWindow` and `GetMonitorInfoW` were ready; and a monitor measurement returned primary bounds `(0,0)-(1920,1080)` and work area `(0,0)-(1920,1032)`. After that measurement, a JavaScript error dialog reported `EPIPE: broken pipe, write` from `Socket._write` through `console.log` in the Test B `log()` function. The path identifies the failing output write, but the reason that pipe closed is unknown. The earlier Koffi and Win32 results remain individually observed; Test B GUI visibility and normal close were not confirmed.

| Check | Result | Evidence state |
|---|---|---|
| Test A: Electron GUI display and normal close | `PASS` on prior source | Human-confirmed before the current Test A logger/UI edit; current source runtime remains unverified. |
| Test B: Koffi 3.3.7 load | `PASS` | Human-supplied JSONL has `koffi-loaded` and version `3.3.7`. |
| Test B: Win32 read-only API binding | `PASS` | Human-supplied JSONL lists `MonitorFromWindow` and `GetMonitorInfoW`. |
| Test B: work-area read | `PASS` | Human-supplied JSONL measurement is `(0,0)-(1920,1032)` on primary monitor `(0,0)-(1920,1080)`. |
| Test B: GUI display and normal close | `NOT_CONFIRMED` | EPIPE dialog followed the measurement; visibility and normal close were not confirmed. |
| Work-area change during Test B | No change was requested | Only read-only monitor APIs were used; the interrupted run did not produce a post-close comparison. |
| Windows AppBar registration/work-area reservation | `NOT_RUN` | No AppBar registration or reservation was performed. |

### Logging change and next manual run

Test A, Test B, and the existing AppBar PoC no longer send diagnostic events to `console.log` or `console.error`. JSONL remains the primary event record. Startup diagnostics set `process.exitCode = 1` on JSONL serialization/write failure and attempt to show a window-title warning if a window exists; a missing log must not be interpreted as success. The AppBar PoC records a file-log failure in memory and the operator display, marks a nonzero exit status, and keeps the record operation non-throwing so it cannot prevent `ABM_REMOVE` or the shutdown guard from running. These changes do not establish that the JSONL destination itself is available or that AppBar release works at runtime.

The [manual procedure](manual-electron-startup.md) now uses an interactive direct launch with no stdout/stderr redirection, records the observed Test A/B outcomes, and provides the exact Test B rerun command. Test B GUI display and normal close remain for human re-verification. Work-area reservation, maximized-window avoidance, height changes, and AppBar release remain `NOT_RUN`.

## Human Windows desktop run after the EPIPE logging change (2026-11-08)

The following results were supplied from a normal Windows desktop run of the JSONL-only diagnostic code. Codex did not launch Electron or call Windows APIs during this documentation update.

### Test A: Electron only

The human confirmed that the Electron window appeared and closed normally. This run used the source before the EPIPE logging change. It remains evidence for that earlier source revision; the current Test A source has not been rerun on the Windows desktop.

### Test B: Electron, Koffi, and read-only Win32 measurement

With the EPIPE logging change present, the human confirmed Electron `45.2.3`, Node.js `24.22.2`, Koffi `3.3.7`, successful Koffi loading, successful binding and invocation of `MonitorFromWindow` and `GetMonitorInfoW`, visible UI, normal UI-driven close, and JSONL `process-exit` with `exitCode: 0`. EPIPE did not recur in this run.

The recorded monitor was `(0,0)-(1920,1080)`, with primary monitor `true`. The Windows work area was `(0,0)-(1920,1032)` immediately after window creation and immediately before normal exit. These were read-only measurements; no AppBar registration or work-area reservation was attempted.

Chromium displayed an access-denied warning while creating its disk cache. The UI still appeared and closed normally in this run. The warning's root cause is unknown; this observation does not establish that the underlying issue is fixed.

| Check | Result | Evidence / limitation |
|---|---|---|
| Test A: Electron window visible and normal close | `PASS` for the earlier source | Human confirmation predates the EPIPE logging change; current Test A source has not been rerun. |
| Test B: Electron 45.2.3 / Node.js 24.22.2 | `PASS` | Human-run JSONL and supplied result. |
| Test B: Koffi 3.3.7 load | `PASS` | Human-run JSONL recorded successful load and runtime version. |
| Test B: `MonitorFromWindow` and `GetMonitorInfoW` | `PASS` | Human-run JSONL recorded binding and work-area measurement. |
| Test B: visible UI and normal close | `PASS` | Human confirmed UI-driven close; JSONL recorded `process-exit`, `exitCode: 0`. |
| Test B: EPIPE recurrence | Not observed in this run | One human run; the original broken-pipe root cause remains undetermined. |
| Chromium disk-cache access-denied warning | Observed; root cause unknown | It did not prevent the observed UI display or normal close. No fix is claimed. |
| Work area changed by this diagnostic run | No change observed | Both measurements were `(0,0)-(1920,1032)`; only read-only monitor APIs were used. |
| AppBar registration, reservation, resize, and release | `NOT_RUN` | No AppBar API was invoked. |

### Manual AppBar validation handoff

The separate [manual AppBar validation procedure](manual-appbar-validation.md) defines the human-run sequence, starting with an unregistered startup and safe exit. It requires each phase to pass before proceeding to registration, resizing, or maximized-window checks, and specifies stop conditions for an unconfirmed release. All AppBar runtime acceptance criteria remain `NOT_RUN` until the human performs and records those steps.

### Manual procedure clarification (2026-11-08)

The manual procedure now resolves the repository root with `git rev-parse --show-toplevel` and derives the experiment directory as an absolute path. Each phase started in a new terminal reruns the same bootstrap; no repeated relative `Set-Location` is needed. Phase 2 is split into 2A (explicit `Remove and verify`) and 2B (Safe exit while registered), with 2B allowed only after 2A passes. Phase 2B records the automatic `ABM_REMOVE`, release verification, PowerShell exit code, and post-exit work-area measurement separately. This documentation update did not run Electron or AppBar APIs; Windows AppBar registration, reservation, and release remain unverified and `NOT_RUN`.

## Follow-up: AppBar window position diagnostics (2026-11-08)

This follow-up records later human-run AppBar observations and adds read-only geometry diagnostics plus a bounded manual procedure. Codex did not start Electron, call an AppBar API, or change the Windows work area. The original AppBar register, reserve, show, remove, and guarded-shutdown behavior was not intentionally changed.

### Human observations supplied for this follow-up

The reported environment was Windows 11 Pro, one 1920×1080 display, 96 DPI. The human reported successful `ABM_NEW`, `ABM_QUERYPOS`, `ABM_SETPOS`, `SetWindowPos`, work-area reservation at 90 px and 34 px, return to 90 px, `ABM_REMOVE`, and restoration of the pre-registration work area.

For a 90 px request, the proposed, queried, and accepted rectangle was `(0,0)-(1920,90)`, and the work area became `(0,90)-(1920,1032)`. `ABM_QUERYPOS` and `ABM_SETPOS` returned `1`, `SetWindowPos` returned `true`, and `matchesExpectedTop` was `true`. The subsequent AppBar `GetWindowRect` was `(0,90)-(1936,188)`. For 34 px, the accepted rectangle was `(0,0)-(1920,34)`, work area `(0,34)-(1920,1032)`, and AppBar `GetWindowRect` `(0,34)-(1936,132)`. Before registration, `GetWindowRect` was `(-8,0)-(1928,98)`.

The supplied in-process `release-verification` reported `apiAccepted`, `workAreaRestored`, `appBarHidden`, and `operatorWindowUnchanged` as true, followed by `safe-shutdown-confirmed`. No PowerShell exit code or independent work-area measurement after process exit was supplied. This is not a complete `SC-006` PASS.

These values show a mismatch between the accepted AppBar rectangle and the subsequent Win32 window rectangle. They do not identify when or why that mismatch began. In particular, the 16 px width and 8 px height differences have not been attributed to a frame border, DPI conversion, `showInactive()`, AppBar work-area processing, or any other cause.

### Diagnostic instrumentation and remaining status

At that revision, the isolated PoC emitted timestamped `position-diagnostic` JSONL entries around `ABM_NEW`, `ABM_QUERYPOS`, `ABM_SETPOS`, `SetWindowPos`, `showInactive()`, and `ABM_REMOVE`; its `show`/`move`/`resize` and hooked Windows-message diagnostics ran synchronously in their callbacks. This instrumentation detail is superseded by the deferred-callback follow-up below. Each sample separately captures the work area, the AppBar and operator HWND `GetWindowRect`, Electron `getBounds()` / `getContentBounds()` / visibility, and (when available) DWM extended-frame bounds. A single 250 ms post-show sample is read-only. Measurement failures are recorded as unavailable; no value is normalized, interpreted as a cause, or used to move/re-register the window. No correction loop was added.

The measurement APIs may describe different coordinate spaces and frame boundaries. Windows documents `GetWindowRect` as DPI-virtualized and potentially inclusive of invisible resize borders; DWM extended-frame bounds exclude those borders and are not DPI adjusted. Electron geometry is recorded separately without conversion. Compare the values only after accounting for those distinctions.

The human-only, 90 px diagnostic sequence is documented in [position-diagnostics.md](position-diagnostics.md). It performs one registration and explicit verified removal, then exits safely; it does not include 34 px changes, external maximized-app checks, or automatic repositioning. All new Windows runtime measurements remain `MANUAL_PENDING`; AppBar placement cause remains undetermined. Codex performed static checks only.

## Follow-up: deferred diagnostics after the stalled SetWindowPos run (2026-11-08)

### Human evidence and uncertainty

In a human-run Windows 11 Pro session (1920×1080, one display, 96 DPI; Electron 45.2.3, Koffi 3.3.7), the AppBar reservation succeeded at 90 px: the accepted rectangle was `(0,0)-(1920,90)` and the work area became `(0,90)-(1920,1032)`. Immediately before `SetWindowPos`, the requested values were `x=0`, `y=0`, `width=1920`, `height=90`, `flags=84`; Electron bounds were `(0,0,1920,90)` and `isVisible` was false.

While `WM_WINDOWPOSCHANGED` was being observed, the work-area top was 90, `GetWindowRect` was `(0,90)-(1936,188)`, Electron bounds were `(8,90,1920,90)`, DWM extended-frame bounds were `(7,90)-(1929,181)`, and the AppBar window was visible. The log then ended at that message's `position-diagnostic`: `after-setwindowpos`, show samples, `ABM_REMOVE`, `release-verification`, and `safe-shutdown-confirmed` were absent. The human later saw Electron main and child processes still present and an external work-area reading of `(0,0)-(1920,1032)`. The work-area reading alone does not prove that `ABM_REMOVE` completed or that the AppBar registration was cleared.

The synchronous message-hook diagnostic is a plausible source of reentrancy or processing delay because it called native/Electron/DWM measurement and synchronous JSONL output from the hook callback. This remains a hypothesis. The supplied log does not establish why the callback stopped producing entries or why the processes remained.

### Deferred diagnostic change

The Windows-message and AppBar-message callbacks now capture only bounded message data, timestamp/sequence metadata, and enqueue it in memory. `show`, `move`, and `resize` use the same queue. Geometry reads, JSONL records, and serialization occur later on the Node.js event loop. The queue is capped at eight distinct labels, coalesces repeat events by label, captures at most two labels per batch, and spaces batches by at least 100 ms. Overflow and lifecycle drops are counted. Callback capture failures are held in memory and reported later. Removal or safe shutdown cancels pending diagnostic batches and the finite show-settled timer. The stop summary is buffered in memory and written after the release checks; later suppressed callbacks are counted for the next safe summary drain.

Deferred records separate source-event time (`messageObservedAt` or `eventObservedAt`, with first/last sequence and coalesced count) from `measurementCapturedAt`. The JSONL `at` field remains record time. A deferred rectangle describes the later read only, not the original message-time rectangle. The `ABM_NEW` → `ABM_QUERYPOS` → `ABM_SETPOS` → `SetWindowPos` → `showInactive()` functional sequence, arguments/flags, `ABM_REMOVE`, release checks, and safe-shutdown conditions were not changed. For removal, the `REMOVING` state is applied and announced before `ABM_REMOVE`, but its JSONL entry and release-start notification errors are buffered; release-path JSONL writes occur only after the API attempt, hide attempt, post-removal measurements, and release-state decision. Deferred state records carry `transitionObservedAt` so their event time is distinct from the later JSONL write time. No automatic repositioning or AppBar call was added.

An independent review found that the initial deferred-diagnostic revision still synchronously wrote the `REMOVING` transition before `ABM_REMOVE` and the post-removal measurement before evaluating release flags. Those writes are now buffered until the release-state decision is complete; post-removal measurement data carries `measurementCapturedAt`, and deferred state/API records carry their observation timestamps. The review also identified stopped-event counters that could outlive an empty summary; suppression counts now remain bounded and are included in the next safe summary drain. These changes address the review findings statically; they do not establish a runtime stall fix.

### Retest state

Codex performed static analysis only and did not launch Electron, register/remove an AppBar, or change Windows state. `node --check`, the bounded-queue unit test, and diff checks are recorded with the PR. Whether deferring the callbacks lets `SetWindowPos` return and produces the later samples remains **`MANUAL_PENDING`**; the position mismatch also remains unexplained.

Before a human retest, inspect existing Electron process command lines and read the work area. If the prior PoC's release and exit are not known to be complete, do not start another PoC. Do not terminate processes, restart Explorer/Windows, or perform other OS recovery. In an interactive Windows terminal, start one session, register 90 px once, save the JSONL and check `after-setwindowpos` and following samples, then use **Remove and verify** and **Safe exit**. Record the PowerShell exit code and read the work area after exit. Do not change height or try repositioning. The full sequence and stop conditions are in [position-diagnostics.md](position-diagnostics.md).

| Check | Result |
|---|---|
| Static JavaScript syntax (`main.cjs`, queue module, queue test) | `PASS` with Node.js `v24.12.0`; no Electron launch |
| Bounded queue unit tests | `PASS` (4 tests: coalescing, overflow limit, batch limit, lifecycle clear) |
| Callback static scan | `PASS`; geometry APIs, JSONL serialization/I/O, `record()`, and AppBar/placement APIs are absent from the hooked callback bodies |
| Existing API sequence and arguments | Static diff confirms the AppBar registration/reservation/removal calls and `SetWindowPos` request arguments/flags are unchanged |
| `git diff --check` | `PASS` for the working diff; the committed base-to-HEAD check is also run before push |
| Release-path JSONL writes follow the release-state checks | `PASS` by static inspection; log timing only changed, API order and release criteria retained |
| Human retest of deferred callback diagnostics | `MANUAL_PENDING` |
| SetWindowPos processing stall resolved | `MANUAL_PENDING` |
| AppBar position mismatch explained or fixed | `MANUAL_PENDING` |
| AppBar release and post-exit state in a new run | `MANUAL_PENDING` |

The table above records the state before the human run below. The selected items were rechecked on 2026-11-10; unreported external process-exit evidence remains unconfirmed.

## Follow-up: Windows run of deferred position diagnostics (2026-11-10)

### Environment and human-provided evidence

The human ran the latest PR #9 code on Windows 11 Pro, 1920×1080, one display, 96 DPI, Electron 45.2.3, and Koffi 3.3.7. Codex did not run Electron, invoke AppBar APIs, or change Windows state for this follow-up.

The 90 px AppBar registration and reservation succeeded. The reported results were `ABM_NEW=1`, `ABM_QUERYPOS=1`, `ABM_SETPOS=1`, and `SetWindowPos=true`. Windows accepted `(0,0)-(1920,90)` and the work area became `(0,90)-(1920,1032)`.

### Deferred diagnostic behavior

The prior run's log had stopped during a `WM_WINDOWPOSCHANGED` diagnostic, before `after-setwindowpos` or release events. In this run the JSONL contained `before-setwindowpos`, `after-setwindowpos`, `before-showinactive`, `after-showinactive`, and `after-show-settled`; `SetWindowPos` returned `true` and subsequent Electron processing continued. The reported processing stall did not recur in this run after the callback measurement and file logging were deferred. This is an observed non-recurrence in one environment; it does not prove the exact earlier failure mechanism or guarantee prevention on other systems.

### First observed position mismatch

The reported Electron window coordinates were:

| Diagnostic label | Electron X | Electron Y |
|---|---:|---:|
| `after-setpos` | 0 | 0 |
| `before-setwindowpos` | 0 | 0 |
| `after-setwindowpos` | 8 | 90 |
| `after-showinactive` | 8 | 90 |
| `after-show-settled` | 8 | 90 |

The first reported mismatch is at `after-setwindowpos`: the accepted reservation begins at `top=0`, while the Electron position is already at `y=90`. The later `showInactive()` call did not first introduce the observed offset. The evidence locates the displacement to `SetWindowPos` or synchronous window-position handling before that call returned; it does not identify the internal code that moved the window. Electron/Chromium work-area-based window constraints remain a hypothesis, not a confirmed cause. No position correction was attempted in this PR.

### Removal and remaining SC-006 evidence

The human-provided log reports `ABM_REMOVE.returnValue=1`, then `release-verification` with `apiAccepted=true`, `workAreaRestored=true`, `appBarHidden=true`, and `operatorWindowUnchanged=true`, followed by `safe-shutdown-confirmed` with state `released`. The work area after removal was `(0,0)-(1920,1032)`.

The supplied JSONL does not include the numeric PowerShell process exit code or an independent work-area measurement after the process exited. Thus the in-process release and Safe exit path are evidenced, but full external confirmation of `SC-006` is not. Do not treat the missing evidence as a failure or a pass.

### Result for this diagnostic Spike

| Verification item | Result | Evidence boundary |
|---|---|---|
| 90 px AppBar registration | `PASS` | Human-reported API result `ABM_NEW=1` |
| Windows work-area reservation | `PASS` | Accepted rectangle and measured work-area change reported |
| `SetWindowPos` normal return | `PASS` | Return was `true`; following samples were recorded |
| `showInactive()` processing | `PASS` | Before/after samples exist and processing continued |
| Deferred diagnostic samples obtained | `PASS` | All listed labels through `after-show-settled` were reported |
| First observed position-divergence stage identified | `PASS` | First reported mismatch is `after-setwindowpos` |
| Accepted reservation rectangle matches displayed window position | `FAIL` | Electron coordinates become `(8,90)` while accepted top is `0` |
| Explicit `ABM_REMOVE` | `PASS` | Return value `1` reported |
| In-process release verification | `PASS` | All four release flags reported `true` |
| Safe exit path | `PASS` (JSONL evidence) | `safe-shutdown-confirmed`, state `released` |
| External PowerShell process exit code | `NOT_CONFIRMED` | Numeric value not supplied |
| Independent work-area check after process exit | `NOT_CONFIRMED` | No post-process measurement supplied |
| Exact root cause of position displacement | Unresolved | Evidence identifies the stage, not the internal mechanism |

The displacement being `FAIL` is within this Spike's diagnostic finding; it does not mean the instrumentation objective failed. The diagnostic objective—capture the post-`SetWindowPos` samples, locate the first observed mismatch, and record release evidence—was achieved. The position problem remains for a separately scoped follow-up Technical Spike. One untested candidate for that future investigation is a controlled comparison of `SWP_NOSENDCHANGING`; it is not implemented or validated here. Do not add a fixed 90 px offset, change flags, or introduce automatic repositioning based on this evidence alone.

The earlier 2026-11-08 retest table remains a historical snapshot. This 2026-11-10 run updates the stall, positioning-stage, and in-process release observations for its own run; it does not supply the missing external `SC-006` evidence or alter the approved feature specification.

## Follow-up: compare `SWP_NOSENDCHANGING` (Technical Spike preparation)

The human's 2026-11-10 measurements located the first reported Y displacement at `after-setwindowpos` (`Electron y=90` versus the accepted reservation's `top=0`); later `showInactive()` samples retained the same position. Electron/Chromium work-area-based adjustment remains a hypothesis, not a confirmed cause.

The isolated PoC now selects `baseline` or `nosendchanging` once at process startup through `TUTORIAL_DOCK_SPIKE_POSITION_VARIANT`. The default remains the previous flags (`0x0054`, 84). The comparison variant adds only `SWP_NOSENDCHANGING` (`0x0400`, producing `0x0454`, 1108). Unsupported values fail before Electron loads or AppBar registration can begin. The chosen name and numeric/hex flags are included in startup, registration, and position diagnostic events. The existing AppBar call sequence, requested geometry, BrowserWindow creation options, delayed diagnostic queue, `showInactive()`, release checks, and Safe exit guard are unchanged.

The human A/B procedure, stop conditions, required JSONL fields, and result table are in [position-strategy-comparison.md](position-strategy-comparison.md). Only the 90 px initial placement is in scope. The procedure was initially recorded as `MANUAL_PENDING`; the human A/B run below has since produced logs and a visual report. It shows that B's immediate top alignment did not persist. Post-process exit and independent work-area evidence remain unconfirmed, and no production behavior is approved by this Spike.

## Follow-up: human A/B position comparison (2026-11-12)

The two local JSONL sessions identify `baseline` (`0x0054`) and `nosendchanging` (`0x0454`) respectively. Both record `ABM_NEW`, `ABM_QUERYPOS`, and `ABM_SETPOS` as `1`, the accepted rectangle `(0,0)-(1920,90)`, and the work area changing from `(0,0)-(1920,1032)` to `(0,90)-(1920,1032)`. The human reports that both bars were visually 90 px below the display top.

For `baseline`, the first post-`SetWindowPos` sample already has Electron Y=90, Win32 `GetWindowRect` top=90, and DWM extended frame top=90. For `nosendchanging`, the immediate post-call sample is temporarily top-aligned (`GetWindowRect` `(0,0)-(1920,90)`), and the immediate `showInactive()` samples remain at Y=0. The coalesced `move` event spans `19:12:10.947Z`–`19:12:11.118Z`; a deferred sample at `19:12:11.219Z` has Y=90, as does `after-show-settled`. An AppBar callback with notification code `0` (Win32 `ABN_STATECHANGE`; the PoC logged its name as `other`) was observed at `19:12:11.111Z`, during that move-event interval and before the first Y=90 sample. The final Electron, Win32, and DWM geometry converges to the same values as baseline. A and B therefore show different immediate positions in these runs, while both settle at Y=90. The difference is consistent with an effect from `SWP_NOSENDCHANGING`, but the runs' Git commit SHA, Windows build, taskbar configuration, and other unlogged conditions were not fully compared; causation is not established.

The A/B observations are consistent with a possible contribution from the `WM_WINDOWPOSCHANGING` path, but the runs' incomplete environment comparison means the flag's effect is not isolated, and the observations do not prove which code changed the proposed position. For B, the later move observation is evidence of movement, not proof of its caller. `showInactive()` is temporally adjacent but has not been isolated. The notification-code-0 callback overlaps the move event and precedes the first Y=90 measurement; its timing is another correlation to investigate, not proof that taskbar state handling caused the move. The PoC's current code logs callbacks without repositioning, and has no later explicit `SetWindowPos`/Electron move call in this operation; a Windows/Electron/Chromium-managed follow-up remains plausible. The exact cause is not established.

Two separate evidence boundaries remain: the B log contains successful `ABM_REMOVE` and all-true in-process `release-verification`, but no `safe-shutdown-confirmed` event; neither run has a supplied numeric PowerShell exit code or independent post-process work-area measurement. Therefore, do not mark SC-006 end-to-end PASS. Also, a static source check found that the PoC logs `WM_WINDOWPOSCHANGED` without calling `ABM_WINDOWPOSCHANGED`; Microsoft says the appbar should send it in response, to notify the shell and support correct Z-order handling for autohide appbars. This protocol gap is recorded for separate verification and is not established as the Y-offset cause.

The [comparison record and next-step plan](position-strategy-comparison.md) separates measured evidence from hypotheses. The next diagnostic should capture `WM_WINDOWPOSCHANGING`'s proposed `WINDOWPOS` values safely and isolate the `showInactive()` call in a one-factor run. No flags, window geometry, or automatic repositioning were changed in this follow-up.
## Issue #13 - Chromium work-area / showInactive investigation (2026-11-14)

Issue #13 adds deferred observations for work-area and window-position messages, and an opt-in, single-factor `showInactive()` comparison fixed to `SWP_NOSENDCHANGING`. The default PoC remains unchanged. The human procedure and evidence template are in [issue-13-work-area-repositioning.md](issue-13-work-area-repositioning.md). Both comparison runs remain `MANUAL_PENDING`; Codex did not run Electron or AppBar APIs. Position correction remains out of scope.