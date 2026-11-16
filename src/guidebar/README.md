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

## Download the artifact for the current PR HEAD

Use only a successful **WP-GB-01 native guide bar build** run attached to PR #21 whose checked-out source SHA exactly matches the PR's current full 40-character HEAD SHA. Do not use an artifact from an earlier PR revision. The workflow checks out `pull_request.head.sha` and names its artifact `guidebar-mvp-<that full SHA>`; confirm both the run's commit and artifact name in the Actions UI before downloading.

1. Open [PR #21](https://github.com/Chasoso/tutorial-dock/pull/21), select its latest successful build run, and verify the run commit SHA equals the PR HEAD SHA.
2. Download that run's `guidebar-mvp-<full SHA>` artifact ZIP. Save it under your Downloads folder without renaming it.
3. In PowerShell, set `$sourceSha` to the exact PR HEAD SHA and extract to a new, source-specific directory. The commands below stop rather than overwrite an existing directory or use a missing ZIP:

   ```powershell
   $sourceSha = '<40-character PR HEAD SHA>'
   if ($sourceSha -notmatch '^[0-9a-f]{40}$') { throw 'Use the full PR HEAD SHA.' }
   $artifactName = "guidebar-mvp-$sourceSha"
   $artifactRoot = Join-Path $env:USERPROFILE 'Downloads\TutorialDock'
   $artifactZip = Join-Path (Join-Path $env:USERPROFILE 'Downloads') "$artifactName.zip"
   $extractDir = Join-Path $artifactRoot $artifactName
   if (-not (Test-Path -LiteralPath $artifactZip -PathType Leaf)) { throw 'Download the matching Actions artifact ZIP first.' }
   if (Test-Path -LiteralPath $extractDir) { throw 'Extraction directory already exists; choose a new empty directory.' }
   New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
   New-Item -ItemType Directory -Path $extractDir | Out-Null
   Expand-Archive -LiteralPath $artifactZip -DestinationPath $extractDir
   $executables = @(Get-ChildItem -LiteralPath $extractDir -Filter 'guidebar.exe' -File -Recurse)
   if ($executables.Count -ne 1) { throw 'Expected exactly one guidebar.exe in the downloaded artifact.' }
   $exe = $executables[0].FullName
   Get-FileHash -LiteralPath $exe -Algorithm SHA256
   ```

Record the PR SHA, Actions run URL, artifact name, and local SHA-256 in the T008 results. The artifact name/run commit establish which source revision CI built; the local file hash identifies the downloaded binary and is not a source-commit hash. Keep the extracted directory writable: the application saves a small `guidebar-release-*.txt` evidence file beside the executable during Safe Exit.

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

1. From the repository root, set `$repoRoot` and the measurement helper, then record the pre-run work area:

   ```powershell
   $repoRoot = (git rev-parse --show-toplevel).Trim()
   if ($LASTEXITCODE -ne 0 -or -not $repoRoot) { throw 'Could not resolve repository root.' }
   $measure = Join-Path $repoRoot 'experiments\windows-appbar-native\measure-workarea.ps1'
   & $measure
   ```

2. In the same PowerShell session, use the `$exe` path set in the artifact extraction instructions. Start the GUI and wait for it to close; do not use Ctrl+C to regain the terminal:

   ```powershell
   $runDirectory = Split-Path -Parent $exe
   $guideBarProcess = Start-Process -FilePath $exe -WorkingDirectory $runDirectory -PassThru -Wait
   $processExitCode = [int]$guideBarProcess.ExitCode
   "Guide bar PID: $($guideBarProcess.Id); exit code: $processExitCode"
   ```

3. Confirm the empty bar appears. Open **Settings → Reservation status** and record `ABM_NEW`, the last `ABM_QUERYPOS`/`ABM_SETPOS` results, accepted AppBar rectangle, guide-bar `GetWindowRect`, current `rcWork`, and baseline `rcWork` separately. Confirm that the reservation is reported as registered. A visible/topmost bar alone is not a pass.
4. Open **Settings → Load sample lesson**. Verify the three step titles/descriptions, progress, Previous/Next boundary behavior, and local-only Demo action. Confirm no external content or image viewer opens.
5. Select a middle step, click **Collapse**, then **Expand**. After each action, inspect Reservation status and record accepted rectangle, window rectangle, `rcWork`, lifecycle, and the displayed step. The step must remain selected; the measured work area must reflect each confirmed reservation update.
6. Only if the reservation and window state are confirmed and the desktop remains normal, maximize Notepad and Tableau Desktop in turn. Record numeric window bounds and visual overlap separately. If Tableau is unavailable, record `MANUAL_PENDING`. Close both normally before cleanup.
7. Select **Settings → Safe Exit**. A release summary is shown before the window closes and a `guidebar-release-*.txt` file is written beside `guidebar.exe`. Confirm it records the `ABM_REMOVE` return value, pre/post-removal work-area rectangles, baseline restoration result, release state, and exit disposition. If removal or restoration is uncertain, the application saves an `unverified` result when possible and blocks normal exit. Keep it open and do not force-close the process, restart Explorer/Windows, edit the registry, or elevate. If release and work-area restoration are verified but hiding the unregistered window is not, review the summary; the application asks before closing and sends no second `ABM_REMOVE` request.
8. After the GUI closes, record the PowerShell exit code, inspect the release evidence file, and independently measure the work area again:

   ```powershell
   $processExitCode
   $runDirectory = Split-Path -Parent $exe
   $releaseEvidence = Get-ChildItem -LiteralPath $runDirectory -Filter 'guidebar-release-*.txt' -File |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
   if (-not $releaseEvidence) { throw 'Release evidence file is missing; record the displayed result and request review.' }
   Get-Content -LiteralPath $releaseEvidence.FullName
   & $measure
   ```

   The expected exit code is `0`, and the external post-exit work area must match the pre-run rectangle. These are separate from the in-process release confirmation. The evidence file records that normal exit was requested after release verification; it cannot prove the process actually exited. Use the PowerShell exit code for that result.

### Stop conditions

Stop the run if registration, a size update, rollback, removal, the work-area measurement, process state, or another application's behavior is failed or uncertain. Do not continue to Notepad/Tableau after a reservation problem. Do not force-terminate the app or perform OS/Explorer restart, registry, or elevation-based recovery. Preserve the recorded status and request human review.

## Verification status for this implementation PR

| Check | Result |
|---|---|
| Current PR HEAD Windows x64 build and model/lifecycle tests | Verify the exact run and HEAD in PR #21's **Verification** section before manual execution; an earlier green run is not evidence for a newer source SHA |
| Current compile-only product executable Artifact | Download only from that exact successful run; the artifact name contains its full source SHA |
| Local MSVC/Windows SDK build and local model-test execution | `NOT_RUN` in the Codex work environment; use the current PR Actions result for x64 compile/test evidence |
| Product executable launch / AppBar / work-area changes | `MANUAL_PENDING` (not run by Codex) |
| T008 Windows acceptance | `MANUAL_PENDING` |
| Independent review | See PR #21's verification section for the verdict and exact reviewed HEAD. |
