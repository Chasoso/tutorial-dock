# Tutorial Dock Guide Bar — First Vertical Slice Plan

**Status:** Proposal — not an approved architecture or implementation authorization.
**Specification:** [spec.md](spec.md)
**Related behavior:** [R-01–R-09](../../docs/requirements.md), [Windows AppBar AB-001–AB-008](../windows-appbar/spec.md)
**Evidence:** [Native AppBar Phase 1 record](../../docs/spikes/windows-appbar-core/README.md), merged PR [#17](https://github.com/Chasoso/tutorial-dock/pull/17).

## Goal and scope

Prepare one product Work Package for an early, interactive guide-bar vertical slice. It combines a real AppBar reservation with the empty state, a built-in sample lesson, step navigation, a demonstration action, Settings, collapse/expand, and guarded normal exit. It is not the complete Tutorial Dock MVP and does not make R-01–R-09 complete.

YAML, the image viewer, multi-monitor behavior, portable distribution, and abnormal-exit recovery are deferred.

## Evidence and sequencing decision

PR #17 is merged at main commit `595774177ac7570d6459321d86f25b4c8334481d` (PR head `2164736add1acd2a1742229180b96e503dda20f7`). Its human T006 result is recorded in the merged PR description and is being copied into the Spike README as a durable repository record.

The recorded run supports these limited findings in the tested single-display Windows setup:

- `ABM_NEW`, three `ABM_QUERYPOS` calls, and three `ABM_SETPOS` calls returned success; the accepted top rectangle was `(0,0)-(1920,90)`.
- The measured work-area top changed from 0 to 90 and remained 90 at the settled sample.
- The AppBar HWND was measured at `(0,0)-(1920,90)` at the reported samples; the user reported that it was visibly rendered in the reserved strip.
- `ABM_REMOVE` and the app's in-process release checks succeeded; Safe Exit and the app-recorded `process-exit exitCode=0` were present.

The run does **not** complete the native Spike's full Phase 1 gate: maximized Notepad/Tableau were not tested; there is no independent post-process work-area measurement or independently captured parent-shell exit code; the Windows build number and exact experiment source SHA are not stated in the result record. Therefore WP-NAB-01/Issue #16 is not declared complete, and its remaining criteria are not inferred PASS.

The existing native Spike plan makes WPF/WinForms comparisons conditional on a full Phase 1 PASS. This product proposal takes a separate path: it proposes a small product vertical slice using the successful native AppBar baseline without waiting for those framework comparisons. It does not claim the old Phase 1 gate passed, does not start Phase 2, and does not change the native Spike plan. This sequencing change and the candidate UI stack require explicit human approval before Issue registration or implementation.

## Candidate technical direction

### Reuse the validated shell path

- Keep `experiments/windows-appbar-native/` as an immutable diagnostic reference for this Work Package; do not convert it into product code.
- Create a separate product project, provisionally under `src/guidebar/`.
- Keep the visible guide-bar top-level HWND as the registered AppBar HWND, with its own WndProc and shell callback. The operator window from the Spike is not retained as a permanent product window.
- Port only the minimal AppBar lifecycle, geometry, notification, and guarded-removal behavior after code review. Keep `ABM_REMOVE`, work-area verification, and the rule that the registered HWND is not destroyed before release is confirmed.
- Do not carry over the high-volume diagnostic message queue or experiment JSONL logger as production infrastructure. Retain user-visible error/state reporting and only the minimal diagnostics justified for this slice.
- Do not add fixed offsets, repeated correction, automatic re-registration loops, or a fallback that is represented as successful AppBar behavior.

### Candidate UI for approval

Preferred first implementation candidate: C++/Win32 as a single native GUI process, with the AppBar top-level window hosting native child controls for the left step content and right-side actions/navigation/settings/collapse. This keeps the registered window and displayed content on the same HWND path and avoids adding an unapproved runtime dependency.

This is a proposed Level 2 product-stack choice, not a final selection. WPF, WinForms, WebView2, or an Electron/native bridge may be revisited after the first vertical slice if native UI effort or product requirements justify it. No comparison experiment is required before this candidate can be considered.

### Startup, data, and interaction

- Product launch creates and registers the empty bar on the primary display, as requested and consistent with R-01/R-04. This intentionally differs from the diagnostic PoC's explicit Register button.
- Provide an explicit prototype “Load sample lesson” action; do not auto-load the fixture.
- Keep the fixture in memory, with three or more steps and boundary-safe navigation. The sample demonstration action displays local placeholder feedback only; it does not implement R-05's image action.
- The Settings menu exposes only sample loading, reservation status, and normal Exit. Do not present deferred YAML, reload, or display-selection operations as implemented.
- Use the existing R-01 provisional height targets. A 34 px collapsed test value may be selected after human approval; do not record it as a finalized requirement.

### Lifecycle and failure policy

- Separate UI state from AppBar lifecycle state. At minimum distinguish unregistered, registering, registered, updating, removing, released, and removal-unverified.
- Register only the bar HWND. Handle the documented Shell/window notifications based on the reviewed native PoC path; do not invent a new reposition loop.
- On size/display update failure, prefer returning to the last confirmed bar presentation and reservation (AB-003/AB-004). If that state cannot be restored or confirmed, show a degraded state, keep OS reservation status unconfirmed, and follow AB-004/AB-008; topmost display alone is not success.
- Normal Exit and window-close share one guarded release route. Remove and verify the baseline work area before destroying the registered window.
- If release is unconfirmed, keep the UI/process available and make the uncertainty visible; do not force termination or claim the operating system is restored.
- This Work Package validates normal termination only. Abnormal termination and recovery require a later focused Technical Spike and separate approval.

## Sequencing change and risks

| Topic | Existing native Spike sequence | Proposed product path | Risk / control |
|---|---|---|---|
| WPF/WinForms comparison | Proposed only after full Phase 1 PASS | Not a prerequisite to the first product slice | Native UI could prove costly; revisit with evidence, not by automatic framework switch. |
| Phase 1 evidence | Full gate includes maximized Notepad, external post-exit work area, source/environment provenance, and desktop-state checks | Use only the successful 90 px reservation/display/removal evidence as a starting point; repeat missing checks in the product acceptance run | Does not mark Issue #16 complete; require explicit human acceptance of the incomplete baseline evidence. |
| UI stack | Reserved for a later Level 2 decision | Candidate C++/Win32 controls in the registered AppBar window | Requires Level 2 approval before implementation; native layout/accessibility and future content cost remain. |
| Collapse/update | Not part of the native Phase 1 run | Included in this product slice | Update path is unverified; measure `rcWork`, preserve step, and stop on uncertain state. |
| Recovery | Normal exit evidence exists in-process; external evidence is missing | Guarded normal exit is required; crash recovery stays deferred | Do not claim abnormal-exit recovery or release readiness. |
| R-09 distribution | Outside Issue #16 | Deferred to a later Work Package | Compile-only success is not portable-exe acceptance. |

## Proposed one-Work-Package implementation

**WP-GB-01 — Native AppBar guide-bar first vertical slice (candidate only)**

- **Source:** this specification; the in-scope portions of R-01, R-02, R-03, R-04, R-05, and R-07; related AppBar AB-001–AB-004 and AB-007–AB-008. R-06 image-viewer behavior, R-08 lesson-content validation, and R-09 distribution are deferred.
- **Tasks:** `specs/guidebar-mvp/tasks.md`, T001–T008.
- **Dependency:** merged PR #17 / the isolated Pure Win32 baseline. Issue #16 remains open and is not closed by this plan.
- **Scope:** separate native product project; empty-at-start bar with AppBar reservation; in-memory sample fixture; step presentation/navigation; demo action and limited Settings; collapse/expand reservation update; guarded normal release; compile/static checks; one human-run Windows acceptance session.
- **Not included:** YAML, real image action/viewer, display switching, WPF/WinForms comparison, R-09 packaging, abnormal-exit recovery, production stack approval.
- **Acceptance:** GBM-SC-001–GBM-SC-007 in `spec.md`; automated model/failure-path checks and Windows evidence for work area, visible bar, collapse, Notepad/Tableau behavior, release, process exit, and external post-exit work area.
- **Authorization:** human approval of the candidate Level 2 UI stack and Work Package is required before registering the Issue. A separate instruction naming the Issue and execution order is required before implementation. Human authorization is separately required for Windows AppBar runtime testing.

## Decision gates

1. **Plan review:** confirm the requested sequencing change and residual Phase 1 evidence gaps. This document remains a proposal until its PR is merged.
2. **Level 2 product direction:** approve or reject the C++/Win32 native-controls candidate. If not approved, stop before Issue registration and present the alternatives.
3. **Work Package registration:** approve WP-GB-01 explicitly; Issue registration approval alone will not authorize implementation.
4. **Implementation start:** specify the registered Issue and execution order.
5. **Windows acceptance:** human-run baseline and feature tests; any unresolved registration/removal/work-area state stops the run.
6. **Future decisions:** choose separately whether to run framework comparisons, image/YAML work, abnormal-recovery spike, multi-monitor, and R-09 packaging.

## Validation strategy

- Static: requirement/feature traceability, no deferred features represented as implemented, state/cleanup path review, and source comparison to the isolated PoC.
- Build: compile-only Windows MSVC/SDK validation for the product project; the existing experiment build does not build a future product target.
- Automated: step-navigation boundaries and AppBar-failure state using a test seam; no AppBar API execution in CI.
- Manual Windows: Windows 11, one monitor, 96 DPI, standard bottom taskbar; measure actual work area, AppBar HWND and visual position; exercise sample/navigation/collapse; maximize Notepad and Tableau when available; perform normal release; capture process exit code and independent post-exit work-area measurement.
- Results are recorded per check as PASS, FAIL, NOT_RUN, or MANUAL_PENDING. API return, work-area change, window appearance, other-app avoidance, release, process exit, and external restoration remain separate evidence fields.

## Unresolved

- Human approval of a native Win32 UI stack for the first product slice.
- Exact collapsed height and final bar appearance.
- Safe user interaction if OS reservation state remains uncertain.
- AppBar behavior on other Windows builds, taskbar layouts, displays, and DPI values.
- Abnormal termination recovery and the R-09 clean-machine distribution path.
