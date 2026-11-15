# Tutorial Dock Guide Bar — Tasks

**Status:** Proposal snapshot; this file authorizes neither Issue registration nor implementation.
**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md)

Task IDs are local to `specs/guidebar-mvp/` and do not replace R-01–R-09, AB-001–AB-008, or the native Spike's T001–T015. All tasks below form one proposed Work Package so implementation and its corresponding checks stay together.

## WP-GB-01 — Native AppBar guide-bar first vertical slice (candidate only)

**Precondition:** human approves the Level 2 C++/Win32 UI candidate and registers this Work Package. A separate human instruction must name the Issue and execution order before implementation. Windows AppBar execution requires human authorization.

- [ ] [T001] Create a separate product project under `src/guidebar/`; keep `experiments/windows-appbar-native/` unchanged and add a compile-only Windows build target. (R-09 deferred; GBM-001)
- [ ] [T002] Port the minimal reviewed AppBar HWND/WndProc lifecycle into the product project; register the visible guide-bar HWND at startup on the primary display and keep guarded normal removal before destroying it. (R-01, R-02, R-03; AB-001, AB-002, AB-007)
- [ ] [T003] Build the empty bar and the left/right control layout: step content, progress, sample action, Previous/Next, Settings, Collapse/Expand; report reservation state separately from visibility. (R-01, R-02; GBM-001, GBM-003–GBM-008)
- [ ] [T004] Add a deterministic in-memory sample lesson loaded only by explicit user action; verify step content, navigation boundaries, and the local demonstration-action response. Do not add YAML parsing or image viewing. (R-04, R-05; GBM-002–GBM-004)
- [ ] [T005] Implement collapse/expand reservation updates using provisional R-01 heights and retain the current sample step; surface update failure without reporting uncertain reservation as success. (R-01, R-02; AB-003, AB-004, AB-008)
- [ ] [T006] Add focused automated checks for step navigation, state transitions, and injected AppBar API failures; verify failure state remains visible and normal cleanup stays available. Do not invoke AppBar APIs in CI. (R-02; AB-004, AB-008)
- [ ] [T007] Build the product target with Windows MSVC/SDK and run static checks; obtain a read-only independent review of the exact candidate HEAD. Build must not launch the executable. (GBM-SC-001–GBM-SC-007)
- [ ] [T008] After separate human authorization, conduct one controlled Windows acceptance run: empty startup/reservation, sample/navigation, collapse/expand, Notepad and Tableau avoidance when available, normal removal, process exit, and external work-area restoration. Record each result and stop on any uncertain reservation or cleanup state. (R-01, R-02; AB-001–AB-004, AB-007, AB-008)

### Acceptance and evidence

- Meet GBM-SC-001–GBM-SC-007 in the specification. Report source SHA, Windows build, resolution/DPI/taskbar, compiler/SDK, sample/navigation states, API results, accepted rectangles, `rcWork`, bar geometry and visual state, Notepad/Tableau bounds, release verification, PowerShell exit code, and external post-exit work area.
- Keep runtime checks separate from compile/static PASS. If Tableau is unavailable, its result remains MANUAL_PENDING. Missing external restoration or process-exit evidence is not PASS.
- Stop after an uncertain API/OS state. Do not force-close, restart Explorer/Windows, change the registry, elevate privileges, or launch a second AppBar experiment.

### Issue candidate — not registered

**Title:** `feat: build the first native AppBar guide bar vertical slice`

**Body outline:** Implement WP-GB-01 from `specs/guidebar-mvp/{spec,plan,tasks}.md`. Trace in-scope portions of R-01, R-02, R-03, R-04, R-05, R-07 and GBM-001–GBM-008; defer R-06, R-08 lesson-content validation, and R-09 distribution; relate AppBar behavior to AB-001–AB-004 and AB-007–AB-008. Reuse only the minimal reviewed Pure Win32 AppBar lifecycle in a separate product project. Include the empty primary-display bar, explicit sample fixture, step controls, limited Settings, collapse/expand, guarded normal exit, compile/static checks, and a human Windows acceptance procedure. Keep YAML, image viewer, display switching, WPF/WinForms comparison, distribution, crash-recovery guarantees, and final stack adoption out of scope. State PR #17 evidence and the remaining Phase 1 gaps accurately. Require human approval of the Level 2 UI stack before Issue registration and a separate named-Issue instruction before implementation. **This candidate has not been registered.**
