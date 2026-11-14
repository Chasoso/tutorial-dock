# Windows Native AppBar Feasibility Spike

**Status:** Proposal — human review required; not approved until merged to main.  
**Type:** Level 3 Technical Spike.  
**Research:** [Native AppBar architecture review](../../docs/spikes/windows-appbar-core/native-appbar-architecture-review.md)

## 1. Overview

The existing Electron/Koffi PoC can reserve the top 90 pixels in the tested Windows configuration, while its AppBar window later settles at Y=90 instead of occupying the reserved top strip. The purpose of this Spike is to determine whether a minimal native Win32 AppBar HWND can reserve that strip and remain at Y=0, and then, only if it succeeds, whether WPF/WinForms can provide the same behavior. Later phases compare UI stacks against existing product requirements. This is a feasibility investigation, not production implementation or a product-stack decision.

The result must separate (a) Shell API results, (b) measured Windows work area, (c) native window geometry, (d) visible placement, and (e) external post-exit restoration. A successful API call alone is not a successful AppBar outcome.

## 2. Source requirements and traceability

The source of product behavior remains [docs/requirements.md](../../docs/requirements.md). The feature IDs below belong only to this Spike and do not change existing IDs.

| Spike Feature ID | Source IDs | Purpose |
|---|---|---|
| NAB-001 | R-01, R-02 | Evaluate a top-edge AppBar window separately from a merely topmost window. |
| NAB-002 | R-02 | Exercise explicit AppBar registration and system-approved reservation/position. |
| NAB-003 | R-02, R-03 | Define the Shell message and taskbar coexistence path required for a credible native baseline. |
| NAB-004 | R-02, NFR recovery | Measure reservation, visible/native geometry, removal, and process-exit restoration separately. |
| NAB-005 | R-02, R-09 | Compare native Win32 against WPF/WinForms only after the native gate passes. |
| NAB-006 | R-01–R-09 | Compare candidate UI stacks and portable distribution implications without selecting one. |
| NAB-007 | R-02, R-09 | Keep the final architecture choice behind a human Level 2 decision gate. |
| NAB-008 | R-02, NFR continuity/recovery | Stop safely when registration, removal, work-area restoration, or desktop state is unknown. |

## 3. Scope

### In scope

- Phase 1: isolated C++/Win32 minimal AppBar experiment, one monitor at 96 DPI, standard visible bottom taskbar, nominal 90-pixel top reservation.
- A separate operator window controls a separate AppBar HWND. Startup never registers the bar.
- Microsoft Shell protocol and WndProc behavior, including registration, query/set position, required activation/window-position notifications, relevant callback handling, and explicit removal.
- Immediate and finite delayed measurements of work area, accepted AppBar rectangle, Win32 rectangle, and visible frame when available.
- Human-run Windows measurements, including a normal maximized Notepad, visual observation, normal exit, external process exit code, and post-process work-area check.
- Conditional Phase 2 WPF and WinForms comparison; conditional Phase 3 UI/packaging comparison; Phase 4 evidence-based decision gate.
- Proposed Work Packages and Issue candidates only.

### Out of scope

- Any production Tutorial Dock code or modification to the existing Electron PoC.
- Any change or closure of Issue #13 or PR #14.
- Fixing the Electron window offset, fixed offsets, delayed correction, repeated repositioning, or automatic retry loops.
- Registration at startup, AppBar 34-pixel/collapse behavior, multi-monitor/DPI transition, display unplug, exclusive full screen, crash recovery, or autonomous testing.
- GitHub Issue registration, implementation authorization, product stack selection, or changes to R-01–R-09 / AB-001–AB-008.

## 4. Functional requirements

### NAB-001 — Isolated native baseline

The Phase 1 experiment shall reside outside the production app and existing Electron PoC. A pure Win32 window owns the registered AppBar HWND and receives its registered callback. A separate ordinary operator window owns the controls and is never passed as the AppBar HWND.

### NAB-002 — Explicit lifecycle

Launching the experiment shall not call ABM_NEW or reserve work area. Registration shall begin only after an explicit human action. The operator shall expose explicit Register, Remove and Verify, and Safe Exit actions. The AppBar lifecycle state shall distinguish unregistered, registering, registered, removing, removal-unverified, and released.

### NAB-003 — Documented Shell protocol

When a human registers the test bar, the experiment shall record and follow this baseline sequence: ABM_NEW; ABM_QUERYPOS; ABM_SETPOS; then move the AppBar HWND to the rectangle returned by ABM_SETPOS using MoveWindow. The AppBar WndProc shall route its registered callback, send ABM_ACTIVATE on WM_ACTIVATE and ABM_WINDOWPOSCHANGED on WM_WINDOWPOSCHANGED, and respond to ABN_POSCHANGED with the documented query/set/reposition path. The experiment shall not add a repeated corrective loop. Relevant ABN_FULLSCREENAPP handling shall be logged/kept safe, but full-screen behavior is not a Phase 1 acceptance claim.

### NAB-004 — Independent evidence

Each run shall record baseline and post-registration monitor rcMonitor/rcWork, accepted rectangles after QUERYPOS and SETPOS, AppBar HWND GetWindowRect, operator HWND geometry, visibility, optional DWM visible-frame bounds, API return values, and timestamped message observations. Measure immediately after the positioning sequence and once at the planned +250 ms point. Keep numeric measurement and visual observation separate. Work-area reservation, visible top placement, and maximized-app avoidance are separate outcomes.

### NAB-005 — Safe removal and exit

A registered bar shall receive ABM_REMOVE before its AppBar HWND is destroyed. Remove and Verify shall compare a fresh work-area measurement with the pre-registration baseline. Safe Exit shall perform the same guarded removal if still registered. If removal or restoration is unconfirmed, the application shall remain available for human handling and stop further testing; it shall not claim success or force-terminate. After normal process exit, a separate external measurement and process exit code shall be recorded.

### NAB-006 — Conditional framework comparison

Phase 2 WPF/WinForms testing shall start only after every required Phase 1 safety and geometry criterion passes and a human approves its Work Package/Issue. Each framework run shall use the same Windows setup, explicit registration, separate operator controls, equivalent evidence, removal guard, and post-exit confirmation.

### NAB-007 — Conditional UI and distribution comparison

Phase 3 shall start only after at least one non-Electron AppBar implementation passes Phase 1/2 gates and a human approves the comparison Work Package. Compare WPF, WPF + WebView2, Electron with a separately owned native AppBar host/bridge, and another justified candidate against R-01–R-09, with special scrutiny of R-02 and R-09. Do not declare a winner in this Specification.

### NAB-008 — Human architecture decision

Phase 4 shall present measured results, unresolved risks, package/deployment evidence, and a recommendation. Any selected framework/runtime/native bridge change is Level 2 and requires explicit human approval. A Specification, Plan, Task, successful Spike, or Issue registration is not that approval.

## 5. User scenarios

### Scenario 1: explicit Phase 1 registration

**Given** the test application is open, the operator window is separate, the bar is visibly at the top, no AppBar experiment is running, and the measured single-monitor/96-DPI baseline matches the recorded setup  
**When** the human presses Register once  
**Then** the native AppBar HWND (not operator HWND) is registered, the Shell sequence is logged, and the accepted rectangle and immediate/settled measurements are captured without an automatic retry.

### Scenario 2: reservation and window placement

**Given** the registration sequence reports results  
**When** measurements are taken immediately and at +250 ms, and a normal Notepad window is maximized  
**Then** work-area top, AppBar native bounds, visible frame, UI appearance, and maximized Notepad bounds are each reported separately as PASS, FAIL, or INCONCLUSIVE. A correct work area does not turn a misplaced bar into PASS.

### Scenario 3: explicit removal

**Given** the test bar is registered and the original work-area baseline is stored  
**When** the human presses Remove and Verify  
**Then** ABM_REMOVE is attempted once, the new work area is compared with the original baseline, and subsequent testing stops unless release is confirmed.

### Scenario 4: safe normal exit

**Given** the AppBar may still be registered  
**When** the human chooses Safe Exit  
**Then** the application releases and verifies before destroying the AppBar window; the human separately records process exit code and measures work area after process exit.

### Scenario 5: unexpected desktop side effect or unknown state

**Given** desktop icons disappear, the work area differs unexpectedly, or release becomes uncertain  
**When** the issue is observed  
**Then** the human attempts only the experiment's explicit safe Remove and Verify path; no next run, forced process termination, Explorer/Windows restart, registry change, or automatic recovery is performed.

### Scenario 6: later framework/architecture gates

**Given** Phase 1 has a complete PASS record  
**When** a human separately authorizes Phase 2, then later Phase 3/4  
**Then** only the approved next work package is executed; a phase result never silently approves a new runtime or product architecture.

## 6. Success criteria and gates

| Spike Success ID | Criterion | Evidence / gate |
|---|---|---|
| NAB-SC-001 | Phase 1 environment and source SHA are reproducible; only one experiment is active. | Human preflight record; otherwise NOT_RUN. |
| NAB-SC-002 | Work-area top becomes Y=90 for a 90 px top reservation, using the accepted Shell rectangle and fresh monitor measurement. | API and GetMonitorInfo measurements; separate from window placement. |
| NAB-SC-003 | AppBar HWND top is Y=0 immediately and remains Y=0 at +250 ms; visible frame and visual appearance are separately recorded. | GetWindowRect/DWM result and human screen observation. Any unexplained mismatch is FAIL or INCONCLUSIVE, not PASS. |
| NAB-SC-004 | A normal maximized Notepad avoids the reserved strip while reservation remains active. | Numeric window bounds plus visual check. This does not cover Tableau, fullscreen, or every app. |
| NAB-SC-005 | Explicit removal restores the original in-process measured work area, and process exits normally. | ABM_REMOVE record, work-area comparison, Safe Exit, external exit code; each separate. |
| NAB-SC-006 | After the process exits, an independent work-area measurement matches baseline. | External read-only measurement. Required for the release/exit gate; not inferred from ABM_REMOVE. |
| NAB-SC-007 | No unresolved reservation or desktop side effect is carried into a later run. | Release evidence and human desktop observation. Any unknown stops the phase. |
| NAB-SC-008 | Phase 2 begins only after full Phase 1 PASS plus separate human WP approval; Phase 3/4 similarly respect their gates. | Approval record and phase evidence. No phase is auto-approved by task completion. |
| NAB-SC-009 | Architecture comparison evaluates R-01–R-09 and portable deployment; no stack is selected without human Level 2 approval. | Evidence matrix and explicit decision record. |

### Phase verdict rules

- **PASS:** every criterion required by the current phase has direct evidence and release/exit safety checks pass.
- **FAIL:** a required measurement contradicts the criterion, including a visible AppBar at Y=90 or an unexpected desktop side effect.
- **INCONCLUSIVE:** required evidence is missing, noisy, inconsistent, or cannot distinguish the condition.
- **NOT_RUN / MANUAL_PENDING:** phase or Windows run has not happened.
- Phase 1 FAIL or INCONCLUSIVE blocks Phase 2. Any release uncertainty blocks further AppBar operations.
- A successful Phase 1 proves only the tested native baseline. It does not establish that the product should switch stacks.

## 7. State and boundaries

AppBar lifecycle: Unregistered → Registering → Registered → Removing → Released. Any failed/unknown removal enters RemovalUnverified; the appbar and operator windows remain available and the experiment stops.

No automatic registration on launch. Only AppBar HWND is passed in APPBARDATA. The registered callback is handled by that window's WndProc. The operator HWND is not an appbar and remains independently usable.

## 8. Open questions

- Does the pure native window remain at Y=0 after the Shell reserves the top strip?
- Does official-sample style or WndProc behavior differ from the report of a WinForms/P/Invoke push-out?
- Does desktop icon disappearance occur on the tested build?
- Which finite message sequence accompanies any move?
- Does either WPF/WinForms implementation succeed under explicit lifecycle control?
- What is the acceptable R-09 interpretation of “portable exe”: one executable or a portable archive/folder containing the runtime?
- What package size, runtime servicing, and security boundaries are acceptable?

