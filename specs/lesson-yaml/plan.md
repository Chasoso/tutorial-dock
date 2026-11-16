# YAML Lesson Loading and Reload Plan

**Status:** Proposal; human decisions listed below are gates. This plan does not authorize dependency adoption, implementation, Issue registration, or Windows runtime testing.
**Specification:** [spec.md](spec.md)
**Requirements:** [R-01–R-09](../../docs/requirements.md), especially R-01, R-04, R-05, R-07, R-08.
**Existing AppBar behavior:** [Windows AppBar specification](../windows-appbar/spec.md), [WP-GB-01](../guidebar-mvp/spec.md), and [current guide-bar implementation](../../src/guidebar/README.md).

## Goal and Work Package

**WP-GB-02 candidate — Load and reload local YAML lessons.** Deliver one end-to-end slice: open a local YAML lesson, validate and present it through the existing guide-bar model/UI, manually reload it transactionally, retain image-action metadata and warning state, and test these behaviors without calling AppBar APIs.

The C++/Win32 guide bar and its AppBar lifecycle remain the existing host. No AppBar registration, placement, collapse, release, or exit code should be redesigned in this Work Package. Preserve the built-in sample lesson and its regression coverage.

## Current baseline and impact

- `src/guidebar/guide_model.h` currently models a sample lesson with step ID/title/description and one demo-action label. The lesson data and navigation are already separated from controls; the implementation should extend this small model rather than create a general content framework.
- `src/guidebar/guidebar_win32.cpp` currently supplies the limited Settings menu and native controls. Add Open/Reload entries and render lesson/action state there, while keeping parsing, validation, path resolution, and state transitions outside the window procedure as far as practical.
- WP-GB-01 tests compile and run the lesson model without invoking AppBar APIs. Extend that pattern for YAML and reload behavior.
- `docs/design.md` section 5/6 is the source example and behavioral starting point; section 9 leaves path policy and some implementation details open. This proposal recommends the concrete WP-GB-02 behavior below; it remains subject to this feature proposal's approval before Issue registration or implementation.
- Issue #20/PR #21 evidence remains unchanged. In particular, do not infer an external post-exit work-area measurement or independent process exit evidence that was not supplied there.

## Parser choice and dependency controls

| Candidate | Benefits for this application | Costs / follow-up |
|---|---|---|
| **yaml-cpp 0.9.0 — selected WP-GB-02 proposal** | C++ YAML 1.2 parser, MIT, CMake integration, and documented Windows/MSVC static-build support. Pin to full commit `56e3bb550c91fd7005566f19c079cb7a503223cf`; static link into the existing `/MT` native target to keep normal use offline and avoid a parser DLL. | Before implementation, verify the pinned source/license, upstream security policy and advisories, current known issues, multiline semantics, parser limits, and final PE dependency list. Any failed gate stops dependency integration and reopens the choice. |
| **LibYAML 0.2.5 — fallback only** | Canonical C parser/emitter project with MIT license. | C event API adds mapping/lifetime work. Reconsider only if the selected yaml-cpp pin cannot meet conformance/resource requirements; review upstream security changes before use. |
| Hand-written subset parser | No third-party dependency. | Reject: YAML quoting, block scalars, Unicode, escapes, and malformed input are easy to mishandle; conflicts with the instruction to prefer a trusted parser. |

Sources: [yaml-cpp upstream and build integration](https://github.com/jbeder/yaml-cpp), [yaml-cpp releases](https://github.com/jbeder/yaml-cpp/releases), [yaml-cpp MIT license](https://github.com/jbeder/yaml-cpp/blob/master/LICENSE), [LibYAML upstream](https://github.com/yaml/libyaml), [LibYAML releases](https://github.com/yaml/libyaml/releases).

Upstream release information identifies yaml-cpp 0.9.0 as the release and documents CMake/MSVC integration and MIT licensing. The exact Git object for tag `yaml-cpp-0.9.0` is recorded above and is the proposed pin, not a floating tag. The upstream tracker has a report of trailing-newline truncation for some multiline single-quoted scalar input in 0.9.0; the issue's reproducer reports different results for block and double-quoted forms. Treat this as a concrete compatibility risk, not proof that the required literal-block example fails. Add conformance fixtures for Japanese text, literal/folded block text, multiline quoted text, and trailing newline behavior; if the required forms do not match the expected YAML value, stop and request a parser decision. Sources: [yaml-cpp release](https://github.com/jbeder/yaml-cpp/releases), [yaml-cpp upstream](https://github.com/jbeder/yaml-cpp), [upstream multiline parsing report](https://github.com/jbeder/yaml-cpp/issues/1511), [MIT license](https://github.com/jbeder/yaml-cpp/blob/master/LICENSE), [security policy](https://github.com/jbeder/yaml-cpp/blob/master/SECURITY.md).

Build-time source retrieval must use the full commit SHA, and CI must verify the resolved revision. Link the static yaml-cpp target with the existing `/MT` choice and inspect the resulting x64 executable for unexpected runtime DLL dependencies. Ordinary lesson loading remains offline. This plan does not install the library or authorize product implementation.

## Proposed component boundaries and flow

1. **Picker/UI adapter:** add Open lesson and Reload lesson to the existing Settings UI. Use the standard Windows file picker with `.yaml`/`.yml` filter. This layer sends a selected path or reload command to lesson-loading logic and displays returned errors/warnings; it does not parse YAML.
2. **File reader/parser:** read the selected file as UTF-8, parse one document, validate mapping/sequence/scalar types and required fields, and produce structured errors with file and parser location when available.
3. **Asset resolver:** require relative `image.src`; normalize it under the canonical YAML parent and resolve the final Windows path through symlink/reparse points. Verify containment by path components, not string-prefix comparison. Missing/unreadable/out-of-folder/unresolvable assets are non-fatal warnings with a disabled reason; no image is displayed or decoded. Add tests for `..`, drive/UNC/device paths, in-folder links, and links that escape the lesson folder. If the final target cannot be safely resolved, fail closed for that action.
4. **Lesson model transaction:** build a complete candidate `Lesson` and warnings off to the side. Only after fatal validation succeeds, replace the active model in one operation. Keep the active lesson, source, current ID/index, and button states untouched on any fatal read/parse/validation failure.
5. **Reload selection:** for reload of the active file, capture current step ID, load a candidate, then select matching ID or first step before commit. For Open of a different file, always start at first step. Built-in sample is retained as a separate explicit source and regression case.
6. **Win32 presentation:** preserve the 90 px normal AppBar height. Show a clipped/ellipsized description excerpt; when it cannot fit, a mouse-operated detail control opens a non-modal scrollable popup with the complete description and line breaks. Implement “その他” as new WP-GB-02 behavior for lesson-action overflow. Reserve space for the existing Previous/Next, progress, Settings, and Collapse/Expand controls before laying out lesson buttons. Disabled-looking actions remain non-activating but expose a reason by mouse; parent hit testing or an enabled help affordance must work even when a native disabled child does not receive hover messages. Error details use the same mouse-accessible detail surface. Popups are not AppBars and do not change work-area reservation. Parser/model tests do not create or register an AppBar.

No background watcher, image decoder/viewer, executable content, external request, or automatic file selection is introduced.

## Adopted proposal decisions (D1–D4)

| Decision | Adopted proposal for this WP | Implementation evidence gate |
|---|---|---|
| D1 — Parser | yaml-cpp 0.9.0, full commit `56e3bb550c91fd7005566f19c079cb7a503223cf`, static link; verify MIT license, security policy/advisories, known issues, Windows build, `/MT`, and no unexpected runtime DLL. | T001 records the source pin and review; T004 verifies parser conformance, limits, and CI linkage. A failed check blocks dependency integration. |
| D2 — Image path | Relative `src` only; normalized and symlink/reparse-resolved final target must be inside canonical lesson folder. Missing, unreadable, unsafe, or unverifiable targets warn and disable the action without rejecting the lesson. | T005 path-boundary tests cover parent traversal, absolute/device paths, and link escapes. |
| D3 — YAML behavior and bounds | Unknown/duplicate mapping keys and multiple documents are fatal; IDs compare case-sensitively; leading UTF-8 BOM is allowed; description is required but may be empty. Proposed limits: 1 MiB source, depth 16, 500 steps, 64 buttons/step, 1,024 buttons/lesson, 128 alias references, 20,000 visited/expanded nodes; reject cycles. | T003/T004 test limit boundaries and fatal rollback. File cap is checked before parse; parser path must safely enforce the other budgets. |
| D4 — Fixed-height UI | Keep the normal guide bar 90 px. Ellipsize text that does not fit; show full description and error details in a mouse-operated non-modal scrollable popup. Newly implement “その他”; keep existing controls pinned; reveal disabled-action reason by mouse. | T007 and T008 cover layout, hover/help behavior, overflow, and manual Windows UI evidence without AppBar changes. |

These decisions are now the proposed WP-GB-02 design; they do not authorize Issue registration, dependency installation, or implementation. The exact parser security/conformance checks and safe enforcement of the limits remain implementation evidence gates. If yaml-cpp cannot meet them, stop before substituting another parser.

## Work Package scope and risks

**In scope:** one local YAML lesson open/reload path, schema validation, Japanese and multiline text, relative image metadata/status, per-button warnings, model transaction/reload semantics, Settings integration, overflow, fixture-based unit/UI checks, Windows x64 compile, and a human Windows UI acceptance procedure.

**Out of scope:** image viewing, R-06, multi-display selection/transition, AppBar lifecycle changes, collapse/expand behavior changes, R-09 packaging, automatic lesson load/watch, cloud access, arbitrary action plug-ins, editing/saving lessons, and abnormal-exit work.

**Risks and controls:**

- Parser/library and build pinning risk: dependency gate, CI-only pinned fetch, license/security review.
- Path traversal/local file exposure: test the adopted proposal that only relative references resolving inside the canonical lesson folder are actionable; disable and warn when containment cannot be proven.
- Partial state update: parse/validate/resolve into a candidate, commit only when fatal checks pass; test exact previous-state retention.
- UI overflow/long Japanese text: keep the 90 px bar fixed, expose complete description in a scrollable detail popup, implement “その他”, and preserve pinned controls; verify on Windows with Japanese, multiline, long text, and many buttons.
- Disabled native-control input: disabled child HWNDs may not receive hover messages; implement parent-side hit testing or a separate enabled reason affordance so the reason remains mouse-accessible without activating the action.
- Misleading image affordance: model and UI explicitly distinguish viewer-not-implemented from missing/unreadable asset.
- AppBar regression: no AppBar lifecycle edits; keep model tests OS-independent and review the product diff against WP-GB-01 boundaries.

## Validation strategy

- **Model/parser unit tests:** valid fixture; Japanese, literal/folded block and multiline quoted scalars, empty description, BOM, and long text; empty/malformed file; absent/wrongly typed fields; unknown/duplicate mapping keys; zero steps; duplicate IDs; unsupported action; multiple documents; missing/empty `src`; file read failure; missing/unreadable/unsafe assets; stable error context. Include parser regression for yaml-cpp issue #1511 and test resource boundaries.
- **State tests:** new lesson starts first; same-source reload retains current ID; removed current ID falls back first; failed Open of a different file and failed Reload each retain the byte-for-byte/logically identical prior lesson, source, current step ID/index, and action states; a valid different source starts first; built-in sample regression.
- **UI checks:** Settings entries, picker filter/cancel, Japanese/multiline/long description ellipsis and full-text detail popup, new “その他” overflow while existing controls stay available, and mouse access to distinct disabled reasons in both direct and overflow actions. The bar remains 90 px. Prefer test seams that do not invoke AppBar APIs; if native dialog/layout cannot be reliably automated, record the Windows check `MANUAL_PENDING` until human-run.
- **Build/CI:** x64 MSVC/Windows SDK compile-only build and unit tests. CI does not launch the product executable, register an AppBar, or change work area. Normal app use stays offline.
- **Review/manual:** static diff review verifies AppBar registration/update/removal code is unchanged. Human Windows check confirms file picker, Japanese rendering, navigation, reload semantics, warnings, and that existing AppBar/Safe Exit behavior remains intact. This is not a new AppBar acceptance run unless separately authorized.

## Work Package / Issue candidate — not registered

**Title:** `feat: open and reload local YAML lessons`

**Candidate WP:** WP-GB-02, one implementation package with matching tests.

- **Specification:** `specs/lesson-yaml/spec.md`; **Plan:** `specs/lesson-yaml/plan.md`; **Tasks:** `specs/lesson-yaml/tasks.md`.
- **Requirements:** R-01, R-04, R-05, R-07, R-08. Related AppBar behavior AB-001–AB-008 is preserved; this work does not satisfy untested AppBar acceptance.
- **Feature IDs:** LYM-001–LYM-008; **Success Criteria:** LYM-SC-001–LYM-SC-008; **Tasks:** T001–T008.
- **Dependency:** merged WP-GB-01 implementation in PR #21 / Issue #20. Issue #20 remains open if still open; its incomplete evidence is carried forward as-is.
- **Scope:** local Open/Reload, pinned YAML parser integration and validation, bounded resource handling, contained relative image metadata/status (no viewer), transactional state, full-text detail popup, new “その他” action overflow with mouse-accessible disabled reasons, tests, Windows compile and manual UI verification.
- **Acceptance:** LYM-SC-001–LYM-SC-008; every criterion recorded separately as PASS/FAIL/NOT_RUN/MANUAL_PENDING.
- **Stop conditions:** parser pin/license/security/conformance or safe resource-bound enforcement fails; path cannot be safely canonicalized; any fatal parse/validation error must preserve old state; unexpected AppBar state change/regression; any API/file-system error with uncertain state; no forced termination or OS recovery action.
- **Status:** proposal only. No Issue has been registered and this plan does not authorize implementation.

## Completion boundary

WP-GB-02 is complete only when automated checks, current-head Windows x64 compile, independent review, and the approved human UI checks are recorded. It does not complete R-05 image viewing, all of R-07 display management, all of R-08 error behavior, R-09 distribution, or the AppBar feature specification.
