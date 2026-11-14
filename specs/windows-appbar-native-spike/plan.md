# Windows Native AppBar Feasibility Spike — Plan

**Status:** Proposal — no implementation, Issue registration, or technology change is authorized by this Plan.  
**Specification:** [spec.md](spec.md)  
**Research basis:** [Native AppBar architecture review](../../docs/spikes/windows-appbar-core/native-appbar-architecture-review.md)  
**Source requirements:** R-01, R-02, R-09; preserve R-01–R-09 and AB-001–AB-008.

## Summary

Use a small C++/Win32 executable as the first diagnostic baseline. It owns the AppBar HWND and WndProc directly and has a separate ordinary operator window. Use Microsoft's documented protocol and classic-sample positioning path, then measure Shell work area and window placement separately. Only if the native baseline fully passes its safety and geometry gate should WPF/WinForms comparisons be proposed. Only if a non-Electron AppBar path succeeds should UI framework and R-09 packaging be compared. The final stack remains a human Level 2 decision.

This is a Technical Spike plan. It is not a product architecture, implementation authorization, or acceptance of an unverified positioning workaround.

## Known facts and uncertainty

- The Electron PoC's 90 px reservation succeeded in supplied runs while its bar ended at Y=90. NoSendChanging produced an intermediate Y=0 in one earlier measurement but did not fix the settled position.
- PR #14's supplied A/B runs with and without showInactive both ended at Y=90, but lacked a recorded source SHA and complete ordered message evidence.
- Chromium work-area correction is a plausible path in prior analysis, but runtime causation is unproven.
- One Stack Overflow author reports a WinForms/P/Invoke reproduction and a desktop-icon side effect. This is a lead, not a general Windows guarantee.
- Microsoft documentation requires the app to position its own window after SETPOS and to respond to relevant Shell notifications. The native Phase 1 determines whether a minimal HWND/WndProc arrangement behaves differently in the tested environment.
- No Windows runtime test, AppBar registration, or position correction is performed by this Plan.

## Technical approach

### Phase 1: Pure Win32, native baseline

- Put future source only under an isolated directory such as experiments/windows-appbar-native/; do not touch production code or experiments/windows-appbar-core/.
- Use C++ and Windows SDK / MSVC for the first binary. No Electron, Node, Koffi, WPF, third-party FFI, WebView2, network access, administrator elevation, or OS settings changes.
- Create two HWNDs: a simple single-color AppBar window and a separate operator window. Only an explicit operator action starts registration. The operator window is never supplied as APPBARDATA.hWnd.
- Reproduce the Microsoft classic sample's relevant window style and lifecycle as closely as practical, documenting every difference. The sample currently creates its AppBar with WS_EX_CLIENTEDGE | WS_EX_TOOLWINDOW and WS_POPUP | WS_THICKFRAME | WS_CLIPCHILDREN; its user-facing menus and auto-hide features are excluded. Do not add custom WM_WINDOWPOSCHANGING suppression in the first baseline.
- On explicit Register: initialize APPBARDATA for AppBar HWND/callback; call ABM_NEW; set the top edge and propose a nominal 90-physical-pixel rectangle for the single-monitor, 96-DPI baseline, whose left/right and top come from measured rcMonitor bounds (do not hard-code a 1920-pixel width); call ABM_QUERYPOS; preserve the requested top-edge thickness while respecting the Shell-adjusted position, then call ABM_SETPOS; call ABM_SETPOS; record its returned rectangle; call MoveWindow with that final rectangle. Record each return and state transition.
- Use the AppBar HWND's WndProc. On WM_ACTIVATE send ABM_ACTIVATE; on WM_WINDOWPOSCHANGED send ABM_WINDOWPOSCHANGED and preserve normal default processing. On the registered callback, handle ABN_POSCHANGED with one protocol-compliant query/set/move update; log observations. If ABN_FULLSCREENAPP arrives, follow documented z-order behavior but do not induce fullscreen during this phase.
- No delayed corrective MoveWindow, no repeated polling, no retry loop. Take one read-only geometry snapshot immediately after positioning and one at the fixed +250 ms point. Message observations use a small bounded in-memory queue with sequence/time/scalar fields; drain it outside WndProc. Overflow makes message-order interpretation INCONCLUSIVE.
- Measure monitor rcMonitor/rcWork before registration, after relevant API stages where safe, after MoveWindow, at +250 ms, after remove, and from an external read-only process after normal exit. Measure AppBar GetWindowRect, operator bounds, visibility, optional DWM extended frame, accepted rect and visual placement. API return values are not geometry verdicts.
- Test maximized Notepad only after reservation and only while the bar state is understood. Keep screenshots/visual and numerical bounds as distinct evidence. Note desktop icons before/after; if they disappear, stop after explicit safe release and record a safety failure.

### Phase 1 lifecycle and safety

- States: unregistered, registering, registered, removing, released, removal-unverified.
- Set state immediately after confirmed ABM_NEW / ABM_REMOVE response so a logging error cannot skip cleanup state.
- Send ABM_REMOVE before destroying the registered HWND. After removal, measure rcWork and compare with the exact pre-registration baseline. Safe Exit calls the same guarded release when needed.
- If any API state, accepted rectangle, rcWork, removal, window destruction, desktop visual state, or external exit measurement is unknown, stop. Do not start the next phase, force-close, relaunch Explorer/Windows, edit the registry, elevate, or run recovery scripts. Ask a human to handle the observed state.
- Only one AppBar experiment may run. The human records source SHA, Windows edition/build, resolution, DPI, taskbar layout, toolchain, API results, rectangles, screenshots, process exit code and independent post-exit measurement.

### Phase 1 decision gate

**Pass to Phase 2 only if** all of these are directly evidenced in one controlled Windows 11 run:

1. rcWork top changes to 90 for the accepted top reservation.
2. AppBar HWND top is 0 immediately and at +250 ms; visible frame and appearance agree sufficiently to establish that the bar occupies the strip.
3. A normal maximized Notepad avoids the strip.
4. Explicit ABM_REMOVE restores the in-process baseline and Safe Exit completes.
5. Process exits with code 0 and an external post-process measurement matches the pre-run baseline.
6. No unresolved desktop side effect, including icon loss, remains.

Any failed criterion is Phase 1 FAIL; missing/ambiguous evidence is INCONCLUSIVE. Neither allows Phase 2.

If Phase 1 fails, first compare the minimal code with the exact Microsoft sample: styles/ex-styles, registration timing, accepted SETPOS rect, MoveWindow arguments, WndProc default forwarding, ABM_ACTIVATE, ABM_WINDOWPOSCHANGED, callback dispatch, and ABM_REMOVE. Do not jump to WPF/WinForms. Propose a separate one-variable follow-up for the most discriminating discrepancy. Do not add a delayed correction just because the reported poster says it worked in that case.

### Phase 2: WPF and WinForms comparison (conditional)

Only after Phase 1 fully passes and a human approves a separate Work Package:

- Test the MIT mgaffigan/WpfAppBar WPF implementation first, then its WinForms sibling in a separate process. Re-check repository state, package versions, target frameworks, transitive dependencies, license notices and maintenance before use.
- Adapt auto-registration to explicit operator-controlled registration. Keep AppBar HWND and operator controls separated. Test the WinForms SystemEventsSafeAppContext exit guidance instead of assuming it prevents hangs in our app.
- Use the same approved Windows 11 setup, 90 px top reservation, one run per framework, equivalent work-area/window/DWM/visual measurements, ABM_REMOVE, Safe Exit, external exit code and post-process rcWork.
- Record each framework's WndProc behavior, WM_WINDOWPOSCHANGING filtering, frame/DPI adjustment, callback handling, message order and any repeat move. Do not normalize differences or hide library behavior.
- If one framework fails cleanup or placement, stop before the next framework until baseline is confirmed by a human.

Gate: at least one framework run is independently safe and meets tested R-02 geometry, with external cleanup evidence. A Phase 2 success is still not stack selection.

### Phase 3: UI technology and R-09 comparison (conditional)

Only after Phase 1 and one or more Phase 2 candidates succeed and a separate human-approved Work Package exists:

Compare WPF native UI; WPF shell + WebView2 UI; existing Electron UI with a separate native AppBar-owned HWND/host integration; and one justified alternative such as WinUI 3 or WinForms.

Use a small representative UI pilot, not the full product: R-01 guide bar layout, a simple R-06 image surface, safe local YAML/action handling implications (R-04–R-08), two-window ownership, mouse-only operation, startup/exit and security boundary. Keep actual AppBar HWND/lifecycle stable while comparing UI to avoid mixing variables.

For R-09, define the deployment acceptance test before selecting: clean Windows machine, no Node/Electron/.NET/WebView2 runtime installed when required by the option, run without installation/admin, verify all dependencies are bundled or a permitted preinstalled dependency is documented, record package size and update responsibility. Microsoft .NET single-file/self-contained support is a capability to verify with actual WPF/WinForms output. WebView2 Fixed Version currently adds more than 250 MB and requires app-managed servicing; Evergreen relies on the separately installed/updating Runtime. Do not treat either as automatically compatible with R-09.

Gate: a traceable matrix against R-01–R-09, NFR security/continuity/recovery, test results, package artifact evidence, dependency licenses, size and maintenance cost. No framework is selected automatically by weighted score.

### Phase 4: architecture decision gate

Prepare a concise decision record with observed facts and raw evidence; phase verdicts and failed/inconclusive items; candidate matrix and trade-offs; impact to R-02, R-09, UI/content security, release size/update strategy and maintenance; remaining Level 3 tests and Level 2 decisions; and recommendation with viable alternatives.

Human decision is required before any change to product framework, runtime, native bridge, permission boundary, or approved behavior. If R-09 cannot be met, propose a separate requirements change; do not silently reinterpret it.

## Security, licensing, and deployment considerations

- Phase 1 has no third-party runtime dependency; Windows SDK/MSVC are build-time tools only. Verify CRT linkage and target architecture in the prototype; do not claim a portable build until it runs on a clean machine.
- Microsoft classic sample is MIT at repository level, with per-sample notices and some asset licenses. Use it as behavioral reference unless source copying is approved and notices are carried.
- WpfAppBar and AppSwitcherBar state MIT licenses. Verify exact package/project dependencies and transitive license files when Phase 2 is authorized; a repository license alone is not a complete dependency audit.
- .NET single-file, self-contained publishing can bundle application dependencies but is OS/architecture-specific and increases size/startup cost. Measure actual outputs.
- WebView2 Fixed Version is a separate runtime payload and requires app servicing; current Microsoft guidance says over 250 MB. Evergreen depends on a separately installed/updating Runtime, so clean no-install testing is needed for R-09.
- No agent receives admin or shell/VM management privileges. First physical Windows operation remains a human-run explicit action.
- Do not capture secrets or unrelated desktop content in screenshots; use the dedicated test desktop area and redact personal paths.

## Dependencies and unresolved decisions

- Initial Spike depends on current main requirements/spec and human approval of its first Work Package/Issue, not on closing Issue #13 or merging PR #14.
- Phase 2 depends on complete Phase 1 PASS plus a new human-approved WP/Issue.
- Phase 3 depends on a successful non-Electron AppBar candidate and a new human-approved WP/Issue.
- Phase 4 depends on comparative evidence; human Level 2 approval is mandatory.
- Not decided: copying Microsoft source, exact Visual Studio/MSVC version, WPF library version/target framework, WebView2 mode, acceptable portable package form/size, final product framework, production AppBar behavior, crash recovery, and extension to other displays/DPI.

## Candidate Work Packages

These are planning candidates only. No GitHub Issues are registered.

| Candidate | Requirements / Feature / Tasks | Depends on | Scope | Acceptance and authorization |
|---|---|---|---|---|
| WP-NAB-01 — Pure Win32 baseline | R-01/R-02/R-09; NAB-001–004, NAB-008; T001–T007 | None; human authorization is required before build/run | Create isolated C++/Win32 two-window test, static review, one controlled 90 px human run, release/exit evidence, analyze gate. | Evaluate NAB-SC-001–007. Requires separate human approval to register this Issue and then a named implementation/start order; physical AppBar action is human-run. |
| WP-NAB-02 — WPF/WinForms comparison | R-01/R-02/R-09; NAB-005, NAB-008; T008–T010 | WP-NAB-01 full PASS | Evaluate and run WPF and WinForms implementations separately under the same setup. | Phase 2 gate and package/lifecycle evidence. Separate Issue and implementation approval; no automatic start. |
| WP-NAB-03 — UI and portable distribution matrix | R-01–R-09; NAB-006–008; T011–T013 | WP-NAB-01 and at least one successful WP-NAB-02 candidate | Representative UI pilots and clean-machine package comparison, not full product. | Evidence matrix covers functional UI, security, runtime/dependency and R-09 deployment. Separate human WP/Issue approval. |
| WP-NAB-04 — Architecture Decision Record | R-01–R-09; NAB-007–008; T014–T015 | WP-NAB-01–03 evidence as applicable | Synthesize evidence and prepare alternatives/recommendation. | Human Level 2 stack decision recorded before product implementation. This package itself does not implement a chosen stack. |

## Validation plan and statuses

| Check | Status now | Planned method |
|---|---|---|
| Documents trace R-01/R-02/R-09 and preserve existing IDs | Planned for review | Static cross-reference check |
| Native PoC build and behavior | NOT_RUN | Only after Issue/work approval; build on approved Windows dev environment |
| AppBar registration/work area/window position | MANUAL_PENDING | Human Phase 1 run |
| Notepad maximized non-overlap | MANUAL_PENDING | Human Phase 1 run |
| ABM_REMOVE/Safe Exit/process exit/post-exit work area | MANUAL_PENDING | Separate evidence fields |
| WPF/WinForms | NOT_RUN, phase-gated | Only after Phase 1 PASS and separate approval |
| UI/package matrix | NOT_RUN, phase-gated | Only after Phase 1/2 gates and separate approval |
| Product framework selection | HUMAN_DECISION_REQUIRED | Phase 4 Level 2 decision |

