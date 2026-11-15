# Native Win32 AppBar baseline (WP-NAB-01)

This directory contains an isolated Phase 1 Technical Spike for Issue [#16](https://github.com/Chasoso/tutorial-dock/issues/16). It is not product code and does not select Tutorial Dock's UI framework.

Traceability: `R-01`, `R-02`, `R-09`; `NAB-001`–`NAB-004`, `NAB-008`; tasks `T001`–`T007`; acceptance criteria `NAB-SC-001`–`NAB-SC-007`. The approved source is [the native AppBar specification](../../specs/windows-appbar-native-spike/spec.md), [Plan](../../specs/windows-appbar-native-spike/plan.md), and [Tasks](../../specs/windows-appbar-native-spike/tasks.md) at base commit `e02cbec8abe5d2108708441f62826c89fafc58ba`.

## Reference and implementation boundary

The implementation follows the Microsoft [Application Desktop Toolbars protocol](https://learn.microsoft.com/en-us/windows/win32/shell/application-desktop-toolbars) and the behavior in the [Windows-classic-samples AppBar source](https://github.com/microsoft/Windows-classic-samples/blob/434f6002bdf9cf9829406c3ff2b33387982d616/Samples/Win7Samples/winui/shell/legacysamples/appbar/AppBar.cpp), pinned to upstream commit `434f6002bdf9cf9829406c3ff2b33387982d616` (repository main checked 2026-11-15). The upstream repository's root license is MIT; the sample tree notes that some samples have additional notices. This PoC does not copy source code or assets.

Relevant protocol retained:

- Explicit `ABM_NEW` for the AppBar HWND, followed by `ABM_QUERYPOS`, one `ABM_SETPOS`, and `MoveWindow` using the Shell-returned rectangle.
- AppBar WndProc sends `ABM_ACTIVATE` on `WM_ACTIVATE`, and `ABM_WINDOWPOSCHANGED` on `WM_WINDOWPOSCHANGED`, then preserves default window processing.
- `ABN_POSCHANGED` schedules one bounded protocol update outside the callback. Up to four updates are allowed in one run; notifications are logged individually and work is coalesced while pending. Reaching the cap makes the run inconclusive and leaves Remove and Verify available.
- `ABN_FULLSCREENAPP` handling follows the documented z-order behavior, but fullscreen compatibility is not induced or tested in this phase.
- `ABM_REMOVE` is attempted once. Release requires its successful return, exact in-process work-area restoration, a hidden AppBar window, and unchanged operator-window bounds. If any part is unknown, both windows remain open and Safe Exit is blocked.
- Failed precondition/baseline logging blocks `ABM_NEW`; lost observation-drain or deferred position-update posts mark the run inconclusive and block further measurements/registration while preserving Remove and Safe Exit. Unexpected operator-window destruction and a message-loop retrieval error request guarded cleanup; an unsafe quit is suppressed and a fallback message pump keeps the process available.

Intentional differences from the Microsoft sample: this PoC uses a separate operator window; supports only an explicitly selected top-edge, nominal 90-physical-pixel run; omits menus, auto-hide, animation, configurable edges and product UI; measures a single-monitor baseline; uses a fixed-size message-observation queue drained by the UI message loop; and does not collect DWM extended-frame bounds. The sample's AppBar styles are retained (`WS_EX_CLIENTEDGE | WS_EX_TOOLWINDOW`, `WS_POPUP | WS_THICKFRAME | WS_CLIPCHILDREN`). No fixed offset, delayed position correction, repeated polling, or correction loop is included.

The first registration is never automatic. The AppBar HWND is hidden on startup; the normal operator window is independent, and only its **Register 90 px top AppBar** button can start registration. The operator HWND is never assigned to `APPBARDATA.hWnd`.

## Build prerequisites and status

Build only from a Windows 11 Visual Studio Developer PowerShell or Developer Command Prompt with the Windows SDK and MSVC C++ tools already installed. This Spike adds no package dependency and does not install tools. The executable is not launched as part of the build command.

Build command, from this directory:

```powershell
cl /nologo /std:c++17 /EHsc /W4 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /DNOMINMAX /MT appbar_poc.cpp /link /SUBSYSTEM:WINDOWS user32.lib shell32.lib gdi32.lib
```

`/MT` requests static MSVC runtime linkage for this experiment; it is not proof that the binary meets product requirement `R-09`. A clean-machine portable-package test is outside WP-NAB-01.

**Build in the Codex workspace: `NOT_RUN`.** `cl`, `msbuild`, `cmake`, `clang-cl`, `vswhere`, and the Windows SDK Include directory were not found. No toolchain was installed. Review and build status must not be inferred from source inspection.

## Read-only external work-area measurement

`measure-workarea.ps1` calls only read-only user32 APIs and prints the primary monitor rectangle/work area or a selected process window's outer `GetWindowRect`. It does not create windows or change system state. Run it before launch and after the PoC process exits:

```powershell
.\measure-workarea.ps1
```

Keep both outputs. The measurement is separate from the PoC's in-process `GetMonitorInfoW` snapshots and from visual observations.

## Human-run Phase 1 procedure (T006 — not authorized by this implementation task)

This procedure is for a separately authorized human Windows run. Codex did not build or execute the PoC and did not register/remove an AppBar. Do not run it until the human approves T006.

### Preflight

1. Use Windows 11, one display, 100% scale / 96 DPI, and the standard visible bottom taskbar. Do not change settings to force these values. Record Windows edition/build, resolution, DPI, taskbar placement, Visual Studio/MSVC/SDK version, and the full candidate Git commit SHA.
2. Build with the command above. Confirm `appbar_poc.exe` exists. Build does not execute it.
3. Open an ordinary PowerShell in this directory. Confirm no previous `appbar_poc.exe` process is active; if process inspection fails, process details are incomplete, or a matching process exists, stop. Do not terminate it.

   ```powershell
   $exePath = (Resolve-Path .\appbar_poc.exe -ErrorAction Stop).Path
   try {
     $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'appbar_poc.exe'" -ErrorAction Stop)
   } catch {
     throw 'Could not inspect processes without elevation. Stop; do not launch or terminate anything.'
   }
   $unknown = @($processes | Where-Object { [string]::IsNullOrWhiteSpace([string]$_.ExecutablePath) })
   if ($unknown.Count -gt 0) { throw 'A matching process has no inspectable executable path. Stop without elevation.' }
   $matching = @($processes | Where-Object {
     [string]::Equals([IO.Path]::GetFullPath($_.ExecutablePath), $exePath, [System.StringComparison]::OrdinalIgnoreCase)
   })
   if ($matching.Count -gt 0) { $matching | Select-Object ProcessId, ExecutablePath; throw 'A previous PoC process exists. Stop; do not terminate it.' }
   ```
4. Record the baseline using `.\measure-workarea.ps1`. Record the JSON and confirm it matches the expected pre-run desktop state. If the work area is unexpected, do not register.
5. List existing `logs\session-*.jsonl` names. Do not delete, rename, or overwrite them. A new unique file is created for this launch.

### One controlled run

1. Start `& .\appbar_poc.exe` from PowerShell and wait for the operator window. Record the generated log name. Confirm the status says `unregistered`; the top bar is hidden and no reservation has been requested.
2. Click **Measure work area** once and confirm the logged work area still matches the external pre-run baseline.
3. Click **Register 90 px top AppBar** exactly once. Do not drag or resize the AppBar window. Record the AppBar's visual position separately from the numeric JSONL values.
4. Review `ABM_NEW`, `ABM_QUERYPOS`, `ABM_SETPOS`, `MoveWindow`, `after-movewindow-immediate`, `after-show-immediate`, and `after-250ms`. Record the accepted rectangle, `rcWork`, AppBar/operator `GetWindowRect`, DPI, and visibility. The expected reservation is an accepted top rectangle of nominal height 90 and `rcWork.top = 90`; the expected AppBar HWND top is `Y=0` immediately and at +250 ms. These are separate results. `GetWindowRect` includes the Win32 outer window rectangle; this PoC does not collect DWM visible-frame bounds.
5. If the reservation or bar position fails, is unexpected, the logger reports overflow/failure, or the desktop has an unexpected side effect, do not open Notepad or conduct another experiment. Continue only with the explicit **Remove and Verify** cleanup step.
6. Only if the work area shows the intended reservation, the bar state is understood, and the desktop remains normal, maximize Notepad once. In a second ordinary PowerShell, identify its process and measure the outer window rectangle:

   ```powershell
   Get-Process -Name notepad | Select-Object Id, MainWindowTitle, MainWindowHandle
   $notepadProcessId = [int](Read-Host 'Enter the Notepad process Id shown above')
   .\measure-workarea.ps1 -ProcessId $notepadProcessId
   ```

   Record the rectangle and visual overlap separately. Close Notepad normally before removal. Do not test fullscreen, another display, DPI changes, or another AppBar.
7. Click **Remove and Verify** once. Confirm `ABM_REMOVE.returnValue` is nonzero, `release-verification` reports `apiAccepted=true`, `workAreaRestored=true`, `appBarHidden=true`, and `operatorWindowUnchanged=true`, and the lifecycle reaches `released`.
8. Click **Safe Exit**. Wait for the PowerShell prompt to return; record `$LASTEXITCODE` immediately. A zero code is required for the process-exit observation, but is separate from AppBar release evidence.
9. After the process has exited, run `.\measure-workarea.ps1` again. The external work area must match the exact pre-run rectangle. Keep the exit code and external measurement distinct from in-process `release-verification`.
10. Identify the new JSONL by comparing the pre-launch filename list with the post-exit list. Preserve it unchanged and associate it with the Git SHA and environment record.

### Stop conditions

- If `ABM_NEW` fails, do not repeat registration in this run.
- If reservation, accepted rectangle, AppBar position, logging completeness, desktop appearance, removal, process exit, or external work-area restoration is failed or unknown, stop. Do not start a second run or proceed to another framework.
- If Remove and Verify is unavailable or release is unverified, keep both windows open and request human help. Do not force-close the process, restart Explorer/Windows, edit the registry, elevate, or run recovery scripts.
- A work-area reading that looks restored is not by itself proof that `ABM_REMOVE` succeeded. Process absence, release verification, process exit code, and external work-area restoration are separate checks.

## Current evidence status

| Item | Status | Evidence |
|---|---|---|
| T001 reference/source review | PASS | Microsoft protocol and pinned classic-sample source reviewed; deviations documented above. |
| T002–T004 source implementation | SOURCE_PRESENT | The isolated project, lifecycle, and measurement code are included in this PR. Build and runtime verification are tracked separately below. |
| T005 local static checks | PASS | PowerShell parser, whitespace, path/scope and source-level lifecycle checks were run; native compiler validation remains unavailable. |
| T005 independent review | CHANGES_REQUIRED; review limit reached | The third permitted review at `073a2fd46261a566cbefc0a087b1c893522bb980` requested a final pre-`ABM_NEW` logging gate and cleanup scheduling after unexpected operator destruction. Both were applied afterward; the latest candidate has not been independently reviewed and is not a PASS. |
| Build | NOT_RUN | MSVC and Windows SDK were unavailable in this Codex environment. |
| NAB-SC-001 environment and source SHA | MANUAL_PENDING | Human records the exact source commit and Windows environment. |
| NAB-SC-002 reservation / work-area change | MANUAL_PENDING | Human measures accepted rectangle and `rcWork`. |
| NAB-SC-003 immediate and +250 ms AppBar position | MANUAL_PENDING | Human checks JSONL and visual placement separately. |
| NAB-SC-004 maximized Notepad | MANUAL_PENDING | Human-run only after the reservation and desktop are stable. |
| NAB-SC-005 explicit removal / in-process baseline / Safe Exit | MANUAL_PENDING | Human confirms all release fields and state. |
| NAB-SC-006 process exit code / external post-exit work area | MANUAL_PENDING | Human records PowerShell exit code and runs the helper after exit. |
| NAB-SC-007 no unresolved state or desktop side effect | MANUAL_PENDING | Human confirms the desktop and no remaining experiment process. |

No Phase 2 work is included. A Phase 1 failure blocks WPF/WinForms comparison and requires evidence review before any new experiment.

