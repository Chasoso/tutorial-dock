# Tutorial Dock Guide Bar — First Vertical Slice

**Status:** Proposal — human review and implementation authorization required.
**Source requirements:** R-01, R-02, R-03, R-04, R-05, R-07, R-08; R-09 remains deferred.
**Related AppBar feature specification:** [Windows AppBar work-area reservation](../windows-appbar/spec.md), especially AB-001–AB-008.

This specification defines a deliberately small product-facing guide-bar slice. It does not replace the product requirements or the AppBar feature specification, and it does not declare the full MVP complete.

## 1. Overview

The first usable slice gives an instructor a top-edge bar that reserves Windows work area, presents a small in-memory sample lesson, allows step navigation, exposes a settings menu and collapse control, and releases the AppBar during normal exit.

The initial bar is empty, consistent with R-04. The sample lesson is loaded only by an explicit prototype action so that step controls can be exercised before YAML loading is implemented.

The Pure Win32 AppBar result is a promising implementation baseline for the tested Windows setup. The UI technology and long-term product stack remain undecided until a human approves a Level 2 direction.

## 2. Scope

### In scope

- Start an empty guide bar on the Windows primary display.
- Reserve the visible bar area through the Windows AppBar behavior.
- Show step number/count, title, and short description on the left.
- Show a sample action control, Previous/Next, progress, Settings, and Collapse/Expand controls on the right.
- Load a deterministic in-memory sample lesson through an explicit prototype action.
- Update the reserved work area when the bar collapses or expands while keeping the selected step.
- Show reservation/update failure accurately and provide the R-02 degraded fallback without claiming uncertain OS state is repaired.
- Remove the reservation and verify work-area restoration on normal exit.

### Out of scope

- YAML/YML selection, parsing, validation, and reload (R-04/R-07).
- A real image viewer or production tutorial action implementation (R-05/R-06).
- Display selection, multi-monitor transitions, display disconnect, or mixed DPI (R-03).
- Abnormal-termination recovery guarantees or crash tests.
- Portable release packaging and clean-machine distribution (R-09).
- Full visual design, themes, animations, and button-overflow polish.
- WPF/WinForms comparison as a prerequisite to this slice.
- A final technology-stack decision.

## 3. Traceability

| Feature ID | Source | Slice behavior |
|---|---|---|
| GBM-001 | R-01, R-02, R-03, R-04; AB-001, AB-002 | Show an empty primary-display bar at launch and attempt AppBar work-area reservation. |
| GBM-002 | R-01, R-04, R-05 | Load a built-in sample fixture explicitly and show the current step. |
| GBM-003 | R-01, R-05 | Navigate between sample steps with bounded Previous/Next behavior and display step number, title, and description. |
| GBM-004 | R-01, R-05 | Present a clearly identified demonstration action control; its placeholder response is not a production lesson action. |
| GBM-005 | R-01, R-02; AB-003 | Collapse/expand the bar, update reservation, and retain the current step. |
| GBM-006 | R-02; AB-004, AB-008 | Surface reservation/update failures and avoid claiming that topmost fallback equals successful AppBar operation or clears uncertain OS state. |
| GBM-007 | R-02; AB-007 | On normal exit, remove the AppBar and verify restoration before destroying the registered window. |
| GBM-008 | R-07 | Provide a Settings control with only the prototype actions needed for this slice; full management operations remain deferred. |

Existing R-* and AB-* identifiers retain their current meaning. AB-005 (user-selected display transition) and AB-006 (display-disconnect fallback) remain deferred with multi-display support; they are not satisfied by this slice. This slice does not mark the source requirements as fully implemented.

## 4. Functional requirements

### GBM-001 — Empty bar and initial reservation

On application startup, Tutorial Dock shall display an empty, frameless guide bar at the top of the Windows primary display and request the corresponding AppBar work-area reservation. The empty state shall make clear that no tutorial is loaded and expose an explicit prototype action for loading the sample lesson.

A visible topmost window without a confirmed work-area reservation is not a successful AppBar result. If reservation cannot be confirmed, the UI shall show the degraded state described by GBM-006.

### GBM-002 — In-memory sample lesson

The user shall be able to load a deterministic sample lesson through an explicit prototype action in Settings. The fixture shall contain at least three steps and shall not be read from YAML or saved as user data. Startup remains in the empty state until the user selects the fixture.

### GBM-003 — Step presentation and navigation

With the sample fixture loaded, the bar shall show the current step number and total, title, short description, and progress. Previous and Next shall move one step within the fixture. Previous is disabled at the first step and Next is disabled at the last step. Changing steps shall not change the normal bar height.

### GBM-004 — Demonstration action

The sample may show one or more action-shaped controls in the right side. Activating a prototype action shall produce a local, visibly labeled demonstration response. It shall not load external content, execute code, or claim to implement the R-05 `image` action. The real image action and viewer remain a later Work Package.

### GBM-005 — Collapse and expand

The user shall be able to collapse and expand the bar. Each transition shall request a matching AppBar reservation update, and the selected sample step shall remain unchanged. R-01's normal-height target of about 90 px and collapsed target of about 30–36 px remain provisional. A 34 px collapsed value may be used as an initial test candidate, not as a finalized product value.

### GBM-006 — Reservation failure is visible

The application shall distinguish confirmed AppBar reservation from ordinary topmost fallback. On an initial registration or update failure it shall show the failure state and follow AB-004/AB-008's degraded behavior. It shall not report uncertain reservation state as normal operation or imply that a visible fallback released a stale reservation. The UI must keep the failure state understandable without blocking use of other applications.

### GBM-007 — Guarded normal exit

Normal Exit and window-close actions shall use the same guarded release path. The registered AppBar window shall not be destroyed before removal and in-process work-area restoration are confirmed. If release is unconfirmed, the application shall show that state and keep a cleanup path available; it shall not report successful exit. This is not an abnormal-crash recovery guarantee.

### GBM-008 — Limited Settings menu

Settings shall open a mouse-operable menu containing the prototype sample-loading action, reservation status, and normal Exit. YAML open/reload and display selection are intentionally absent from this slice; the presence of the Settings control does not claim R-07 is complete.

## 5. User scenarios

### US-01 — Launch into the empty bar

- **Given:** the application is not already running.
- **When:** the user launches it.
- **Then:** an empty bar appears on the primary display, the application reports the AppBar registration state, and the user can open Settings or Exit.
- **Evidence:** observe the bar, API result, measured Windows work area, and bar HWND separately.

### US-02 — Exercise the sample lesson

- **Given:** the empty bar is running.
- **When:** the user selects Load sample lesson and navigates with Previous/Next.
- **Then:** the expected step number, title, and description appear; navigation stops at the first and last steps.

### US-03 — Collapse and expand

- **Given:** a sample step is selected and reservation is confirmed.
- **When:** the user collapses and expands the bar.
- **Then:** the measured work area changes with each presentation and the same step remains selected.
- **On failure:** GBM-006 applies; do not treat a successful API return alone as proof of a correct work area.

### US-04 — Exit safely

- **Given:** the bar is registered.
- **When:** the user selects Exit or closes the window.
- **Then:** the app removes the reservation, confirms the original work area, and only then exits normally.
- **On uncertainty:** preserve the registered window and show a human-action-required state.

## 6. Success criteria

| ID | Observable condition | Verification |
|---|---|---|
| GBM-SC-001 | On launch, the empty bar is visible on the primary display and the measured Windows work area reflects a confirmed reservation. | Windows manual test; record API result, accepted rectangle, rcWork, HWND geometry, and visual observation separately. |
| GBM-SC-002 | The explicit sample action loads the fixture; step contents, progress, and navigation boundaries are correct. | Unit/UI checks plus Windows manual interaction. |
| GBM-SC-003 | The demonstration action produces only its stated local placeholder response. | Automated or manual UI check; confirm no network or image viewer is invoked. |
| GBM-SC-004 | Collapse and expand update measured work area and retain the same selected step. | Windows manual test; both directions require measured work-area evidence. |
| GBM-SC-005 | A normal maximized Notepad and Tableau Desktop avoid the reserved strip in the tested baseline environment. | Windows manual test with numerical work-area/window bounds and visual result. If Tableau is unavailable, record it as MANUAL_PENDING. |
| GBM-SC-006 | Normal Exit removes the reservation; in-process verification succeeds; the process exits with code 0; external post-exit work-area measurement matches the pre-run baseline. | Record API/removal state, exit code, and independent measurement as separate evidence. |
| GBM-SC-007 | A simulated API failure is shown as degraded/uncertain and is never reported as AppBar success. | Isolated failure-path test; do not deliberately induce an OS-level failure on the host. |

Windows AppBar, work-area, maximized-window, visual, and post-exit checks require a real Windows session. Static or compile checks do not pass these criteria.

## 7. Open questions and decision boundaries

- **HUMAN_DECISION_REQUIRED — product UI stack:** the first candidate is a C++/Win32 top-level AppBar window with native child controls. This reuses the successful HWND/protocol path but increases native UI development and maintenance. Approval is required before implementation. WPF/WinForms comparison is not a prerequisite to this first vertical slice, but remains an option if the native UI proves unsuitable.
- Exact normal/collapsed heights and visual treatment remain provisional.
- The UI and safe operator path when OS reservation state is uncertain require implementation review; fallback visibility alone cannot prove release.
- Abnormal termination recovery remains unproven and outside this slice.
- R-03 display switching, R-04 YAML handling, R-05 image actions/R-06, full R-07, R-08 content validation, and R-09 distribution remain future work.
