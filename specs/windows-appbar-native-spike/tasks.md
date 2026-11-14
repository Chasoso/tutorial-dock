# Windows Native AppBar Feasibility Spike — Tasks

**Status:** Proposal snapshot. No Task authorizes implementation or Issue registration.  
**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · **Research:** [native architecture review](../../docs/spikes/windows-appbar-core/native-appbar-architecture-review.md)

Task IDs are local to this feature directory and do not replace R-01–R-09 or AB-001–AB-008. Later-phase Tasks are blocked until their gates and human Work Package approvals are met.

## WP-NAB-01 — Pure Win32 baseline (candidate only)

- [ ] [T001] Review the approved source requirements, AppBar spec, Microsoft AppBar documentation, classic sample source/license, and existing PR #7–#14 evidence; record exact differences and experiment source SHA. (NAB-001–NAB-004)
- [ ] [T002] Create an isolated C++/Win32 diagnostic project under experiments/windows-appbar-native/ with separate AppBar and operator HWNDs; startup must not register. (NAB-001, NAB-002)
- [ ] [T003] Implement explicit Register, Remove and Verify, and Safe Exit using ABM_NEW → ABM_QUERYPOS → ABM_SETPOS → MoveWindow, state guards, and documented WndProc notifications/callback behavior. Preserve operator HWND as non-AppBar. (NAB-002, NAB-003, NAB-005)
- [ ] [T004] Add bounded message/event logging and independent rectangle/work-area measurements at the planned points; capture API results, accepted rectangles, visibility, process exit, and overflow distinctly. Do not add delayed correction or repeated position loops. (NAB-004)
- [ ] [T005] Run static checks and obtain a separate read-only review of the exact candidate HEAD before human execution. No Electron/AppBar runtime is run by Codex. (NAB-001–NAB-005)
- [ ] [T006] After separate human authorization, conduct one human-run Phase 1 test on Windows 11, one monitor, 96 DPI, standard bottom taskbar; measure immediate and +250 ms position, normal maximized Notepad, visual state, desktop icons, explicit removal, Safe Exit, external process exit code, and post-exit work area. (NAB-SC-001–NAB-SC-007)
- [ ] [T007] Record Phase 1 PASS/FAIL/INCONCLUSIVE with evidence. If cleanup, work-area, desktop, or process state is unknown, stop and report; do not proceed to another framework. (NAB-SC-001–NAB-SC-007)

## WP-NAB-02 — WPF and WinForms comparison (conditional candidate)

- [ ] [T008] Only after Phase 1 full PASS and a separately approved Issue, pin and audit WpfAppBar source/package, target framework, transitive dependencies, licenses, auto-registration path, WndProc behavior, and WinForms exit guidance. (NAB-005)
- [ ] [T009] Prepare separate explicit-registration WPF and WinForms runs with the Phase 1 measurement and cleanup contract; document any deviation from library behavior. (NAB-005, NAB-008)
- [ ] [T010] Run and record each framework one at a time only under approved conditions; require release confirmation, normal exit, exit code, and external post-exit work area after each run before starting the next. (NAB-005, NAB-008)

## WP-NAB-03 — UI and deployment comparison (conditional candidate)

- [ ] [T011] Only after a successful non-Electron AppBar candidate and separate human approval, prepare an evidence matrix for WPF, WPF + WebView2, Electron + native AppBar host/bridge, and one justified alternative against R-01–R-09. (NAB-006)
- [ ] [T012] Define a clean-machine R-09 trial and measure actual artifacts, package size, included runtimes, startup, UI behavior, licensing/servicing, security boundary, and update ownership; do not assume a framework's single-file capability is sufficient. (NAB-006)
- [ ] [T013] Run only approved representative UI/package pilots, preserving the successful AppBar host path; record unmet requirements and unresolved risks. (NAB-006)

## WP-NAB-04 — Architecture decision gate (conditional candidate)

- [ ] [T014] Prepare a decision record mapping evidence and phase verdicts to R-01–R-09, NFR security/recovery, portability, dependency servicing, and maintenance; include alternatives and impact. (NAB-007, NAB-008)
- [ ] [T015] Present the proposed stack and any requirements change for explicit human Level 2 approval. Do not start product implementation until the human names the approved Issue and execution order. (NAB-007, NAB-008)

## Stop conditions

Stop the current phase if registration state, accepted rectangle, work area, visible position, desktop icons, removal, process exit, or post-exit work area is failed or unknown. Do not force-terminate, restart Explorer/Windows, alter registry, elevate privileges, or carry an unknown state into another experiment. A later phase remains blocked until its specified gate and separate human approval are satisfied.
