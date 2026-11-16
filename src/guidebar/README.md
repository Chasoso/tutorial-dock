# Native Guide Bar — WP-GB-01 / Issue #20

This isolated product project implements the first interactive Tutorial Dock guide-bar slice with C++ and Win32. It does not change `experiments/windows-appbar-native/`, which remains the Phase 1 diagnostic reference. This scoped direction does not decide Tutorial Dock's product-wide UI stack.

Traceability: R-01, R-02, R-03 (primary display only), R-04, R-05 (demo only), R-07 (limited Settings); AB-001–AB-004, AB-007, AB-008; GBM-001–GBM-008; acceptance GBM-SC-001–GBM-SC-007. YAML, image viewing, display selection, distribution, and crash-recovery guarantees remain out of scope.

## Build and automated checks

On a Windows 11 Visual Studio Developer PowerShell/Command Prompt with the x64 MSVC tools and Windows SDK already installed, run from this directory:

```powershell
New-Item -ItemType Directory -Force -Path build | Out-Null
cl /nologo /std:c++17 /EHsc /W4 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /DNOMINMAX /MT /Fo:build\ /Fe:build\guidebar.exe guidebar_win32.cpp guide_model.cpp /link /SUBSYSTEM:WINDOWS user32.lib shell32.lib gdi32.lib comctl32.lib
if ($LASTEXITCODE -ne 0) { throw 'Guide bar compile failed.' }
cl /nologo /std:c++17 /EHsc /W4 /utf-8 /MT /Fo:build\ /Fe:build\guide_model_tests.exe guide_model_tests.cpp guide_model.cpp
if ($LASTEXITCODE -ne 0) { throw 'Model test compile failed.' }
& .\build\guide_model_tests.exe
if ($LASTEXITCODE -ne 0) { throw 'Model tests failed.' }
```

The model test executable is OS-independent and does not call AppBar APIs. The product executable is a GUI application; compiling it does not launch it. GitHub Actions runs the same x64 MSVC build and model checks, then uploads only `guidebar.exe`; CI never starts the product executable.

Build output is ignored under `build/` and is not source-controlled.

## Current implementation

- The visible guide-bar top-level window is the AppBar HWND. Startup creates an empty bar and registers that HWND on the Windows primary display.
- The bar contains native Win32 controls for step content, progress, a local demo action, Previous/Next, Settings, and Collapse/Expand.
- Settings provides an explicit in-memory sample lesson action, reservation status, and Safe Exit.
- The model is UI-independent. It contains three deterministic sample steps and bounded navigation.
- Normal and collapsed heights use provisional 90 px and 34 px values. A resize request is considered applied only after the shell calls, window rectangle, and measured work area agree. If an update fails, the code attempts one rollback to the last confirmed height; an unconfirmed rollback keeps the reservation explicitly uncertain, shows a one-shot topmost degraded fallback, and keeps guarded cleanup available.
- `ABN_POSCHANGED` is handled with a posted, coalesced update and a finite burst limit. `WM_WINDOWPOSCHANGED` informs the Shell. No fixed offset or repeated correction loop is used.
- Normal exit goes through `ABM_REMOVE` and in-process baseline work-area verification before the AppBar HWND is destroyed. An uncertain release keeps the process/window available and reports the uncertainty.
- Abnormal termination recovery is not guaranteed by this slice.

## Human Windows acceptance procedure — T008 (`MANUAL_PENDING`)

The implementation task authorizes compile/tests and a Draft PR, but does not authorize Codex to run the app or change Windows state. A human must separately perform this procedure. Use Windows 11, one display, 96 DPI, and a standard visible bottom taskbar; record the exact source commit SHA, Windows build, display/DPI/taskbar setup, and MSVC/SDK version. Do not change system settings to force the baseline.

1. From the repository root, record the pre-run work area with the existing read-only helper:

   ```powershell
   $repoRoot = (git rev-parse --show-toplevel).Trim()
   if ($LASTEXITCODE -ne 0 -or -not $repoRoot) { throw 'Could not resolve repository root.' }
   $measure = Join-Path $repoRoot 'experiments\windows-appbar-native\measure-workarea.ps1'
   & $measure
   ```

2. From the repository root, start the built executable and wait for the GUI to close. Do not use Ctrl+C to regain the terminal:

   ```powershell
   $exe = Join-Path $repoRoot 'src\guidebar\build\guidebar.exe'
   if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'Build artifact is missing; do not run.' }
   $runDirectory = Split-Path -Parent $exe
   $guideBarProcess = Start-Process -FilePath $exe -WorkingDirectory $runDirectory -PassThru -Wait
   $processExitCode = [int]$guideBarProcess.ExitCode
   "Guide bar PID: $($guideBarProcess.Id); exit code: $processExitCode"
   ```

3. Confirm the empty bar appears. Open **Settings → Reservation status** and record `ABM_NEW`, the last `ABM_QUERYPOS`/`ABM_SETPOS` results, accepted AppBar rectangle, guide-bar `GetWindowRect`, current `rcWork`, and baseline `rcWork` separately. Confirm that the reservation is reported as registered. A visible/topmost bar alone is not a pass.
4. Open **Settings → Load sample lesson**. Verify the three step titles/descriptions, progress, Previous/Next boundary behavior, and local-only Demo action. Confirm no external content or image viewer opens.
5. Select a middle step, click **Collapse**, then **Expand**. After each action, inspect Reservation status and record accepted rectangle, window rectangle, `rcWork`, lifecycle, and the displayed step. The step must remain selected; the measured work area must reflect each confirmed reservation update.
6. Only if the reservation and window state are confirmed and the desktop remains normal, maximize Notepad and Tableau Desktop in turn. Record numeric window bounds and visual overlap separately. If Tableau is unavailable, record `MANUAL_PENDING`. Close both normally before cleanup.
7. Select **Settings → Safe Exit**. Confirm `ABM_REMOVE` is nonzero and the in-process state reports released with the work area restored. If removal or restoration is uncertain, stop: keep the window open and do not force-close the process, restart Explorer/Windows, edit the registry, or elevate.
8. After the GUI closes, record the PowerShell exit code and independently measure the work area again:

   ```powershell
   $processExitCode
   & $measure
   ```

   The expected exit code is `0`, and the external post-exit work area must match the pre-run rectangle. These are separate from the in-process release confirmation.

### Stop conditions

Stop the run if registration, a size update, rollback, removal, the work-area measurement, process state, or another application's behavior is failed or uncertain. Do not continue to Notepad/Tableau after a reservation problem. Do not force-terminate the app or perform OS/Explorer restart, registry, or elevation-based recovery. Preserve the recorded status and request human review.

## Verification status for this implementation PR

| Check | Result |
|---|---|
| Model, rollback, lifecycle-transition, and exit-guard tests | `PASS` in GitHub Actions run [#43804745242](https://github.com/Chasoso/tutorial-dock/actions/runs/43804745242) |
| Local MSVC/Windows SDK build and local model-test execution | `NOT_RUN`; no local C++ toolchain is available |
| GitHub Actions x64 product build | `PASS` for PR HEAD `057d5755d37580c16dd8cf79065df2897e669e49`; Visual Studio 2022 17.14.45 and Windows SDK 10.0.26100.0 |
| Compile-only product executable Artifact | [Download `guidebar-mvp-057d5755d37580c16dd8cf79065df2897e669e49`](https://github.com/Chasoso/tutorial-dock/actions/runs/43804745242/artifacts/14197604512) (14-day retention) |
| Product executable launch / AppBar / work-area changes | `MANUAL_PENDING` (not run by Codex) |
| T008 Windows acceptance | `MANUAL_PENDING` |
| Independent review | See PR #21's verification section for the verdict and exact reviewed HEAD. |
