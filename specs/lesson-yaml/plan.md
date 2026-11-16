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
- `docs/design.md` section 5/6 is the source example and behavioral starting point, but section 9 explicitly leaves path policy and some implementation details open. This proposal formalizes required behavior without treating those unresolved details as already approved.
- Issue #20/PR #21 evidence remains unchanged. In particular, do not infer an external post-exit work-area measurement or independent process exit evidence that was not supplied there.

## Candidate dependency evaluation

| Candidate | Benefits for this application | Costs / follow-up |
|---|---|---|
| **yaml-cpp 0.9.0 (recommended candidate)** | C++ API and YAML 1.2 parser; upstream documents CMake integration, MIT license, and MSVC Windows static-build support. It fits the existing C++ model and can be statically linked into the native executable, which is compatible in principle with the existing `/MT` build and future portable distribution. | Adds a native dependency and build/supply-chain surface; pin exact source revision/hash, review upstream security policy/advisories and release notes, disable unused tools/tests, verify no extra runtime DLL is required, and confirm the chosen static CRT/link mode in the Windows workflow. Adoption is a Level 2 decision and is not approved by this plan. |
| **LibYAML 0.2.5** | Canonical C parser/emitter project with MIT license; small C API and possible lower-level integration. | C event API requires more mapping/validation code and careful lifetime handling. Stable release is older than the current yaml-cpp release; evaluate current upstream security fixes before adoption. |
| Hand-written subset parser | No third-party dependency. | Reject: YAML quoting, block scalars, Unicode, escapes, and malformed input are easy to mishandle; conflicts with the instruction to prefer a trusted parser. |

Sources: [yaml-cpp upstream and build integration](https://github.com/jbeder/yaml-cpp), [yaml-cpp releases](https://github.com/jbeder/yaml-cpp/releases), [yaml-cpp MIT license](https://github.com/jbeder/yaml-cpp/blob/master/LICENSE), [LibYAML upstream](https://github.com/yaml/libyaml), [LibYAML releases](https://github.com/yaml/libyaml/releases).

**Recommendation:** evaluate yaml-cpp 0.9.0 first, then adopt only after the human approves the dependency and a pinned immutable source revision. CI may retrieve the approved source at build time; ordinary use must not require network access. Confirm static linkage and artifact contents in CI. Do not copy a parser implementation into the repository or install a package during this planning Work Package.

## Proposed component boundaries and flow

1. **Picker/UI adapter:** add Open lesson and Reload lesson to the existing Settings UI. Use the standard Windows file picker with `.yaml`/`.yml` filter. This layer sends a selected path or reload command to lesson-loading logic and displays returned errors/warnings; it does not parse YAML.
2. **File reader/parser:** read the selected file as UTF-8, parse one document, validate mapping/sequence/scalar types and required fields, and produce structured errors with file and parser location when available.
3. **Asset resolver:** resolve `image.src` relative to the YAML file's parent. Check missing/unreadable status without displaying or decoding the image. Preserve source text and resolved path in the model. The final path boundary remains gated on human decision.
4. **Lesson model transaction:** build a complete candidate `Lesson` and warnings off to the side. Only after fatal validation succeeds, replace the active model in one operation. Keep the active lesson, source, current ID/index, and button states untouched on any fatal read/parse/validation failure.
5. **Reload selection:** for reload of the active file, capture current step ID, load a candidate, then select matching ID or first step before commit. For Open of a different file, always start at first step. Built-in sample is retained as a separate explicit source and regression case.
6. **Win32 presentation:** render model text as text, populate native controls, and put overflow actions under “その他” with disabled reason text/state. Do not increase bar height. No code path in parser/model tests creates or registers an AppBar.

No background watcher, image decoder/viewer, executable content, external request, or automatic file selection is introduced.

## Decision gates

| Gate | Decision/evidence needed | Owner / boundary |
|---|---|---|
| D1 — YAML dependency | Approve yaml-cpp candidate (or another library), exact pinned source, license/dependency review, and CI retrieval/link strategy. | Human Level 2 approval before dependency changes. |
| D2 — asset path boundary | Choose whether paths must be relative and contained within the YAML directory after canonicalization (including symlink/reparse resolution), or whether external/absolute/parent traversal references are allowed. Record impact on portable lesson folders and local-file exposure. | Human decision before resolver implementation. Recommended secure/portable default: relative paths confined to lesson folder, but this adds a restriction not explicitly settled by R-04 and therefore is not assumed. |
| D3 — YAML strictness/resources | Decide unknown mapping keys (fatal vs warning), duplicate mapping keys, ID case/normalization semantics, multi-document YAML behavior, UTF-8 BOM acceptance, empty text-field behavior, and practical file/alias/nesting limits. | Human review of concrete choices before validation behavior is frozen. |
| D4 — disabled/error UI | Confirm a minimal native representation for “viewer unavailable” versus “missing/unreadable” and how detailed error text is exposed without crowding the fixed-height bar. | Human review may be combined with WP-GB-02 Issue approval; keep layout inside R-01. |

Until D1–D3 are resolved, implementation tasks that depend on those choices are blocked; independent preparation of test fixture cases or model interface proposals may continue only if it does not pre-empt the decisions.

## Work Package scope and risks

**In scope:** one local YAML lesson open/reload path, schema validation, Japanese and multiline text, relative image metadata/status, per-button warnings, model transaction/reload semantics, Settings integration, overflow, fixture-based unit/UI checks, Windows x64 compile, and a human Windows UI acceptance procedure.

**Out of scope:** image viewing, R-06, multi-display selection/transition, AppBar lifecycle changes, collapse/expand behavior changes, R-09 packaging, automatic lesson load/watch, cloud access, arbitrary action plug-ins, editing/saving lessons, and abnormal-exit work.

**Risks and controls:**

- Parser/library and build pinning risk: dependency gate, CI-only pinned fetch, license/security review.
- Path traversal/local file exposure: resolve path policy before implementation; do not silently add or omit restrictions.
- Partial state update: parse/validate/resolve into a candidate, commit only when fatal checks pass; test exact previous-state retention.
- UI overflow/long Japanese text: keep R-01 bar height fixed and use “その他”; verify readable clipping/wrapping policy with manual Windows check.
- Misleading image affordance: model and UI explicitly distinguish viewer-not-implemented from missing/unreadable asset.
- AppBar regression: no AppBar lifecycle edits; keep model tests OS-independent and review the product diff against WP-GB-01 boundaries.

## Validation strategy

- **Model/parser unit tests:** valid fixture; Japanese and block scalar; empty/malformed file; absent/wrongly typed fields; zero steps; duplicate IDs; unsupported action; missing/empty `src`; file read failure; missing and unreadable assets; stable error context.
- **State tests:** new lesson starts first; same-source reload retains current ID; removed current ID falls back first; reload failure retains byte-for-byte/logically identical prior state and source; different source starts first; built-in sample regression.
- **UI checks:** Settings entries, picker filter/cancel, loaded content, disabled-action reasons, and “その他” overflow without height change. Prefer test seams that do not invoke AppBar APIs; if native dialog/layout cannot be reliably automated, record the Windows check `MANUAL_PENDING` until human-run.
- **Build/CI:** x64 MSVC/Windows SDK compile-only build and unit tests. CI does not launch the product executable, register an AppBar, or change work area. Normal app use stays offline.
- **Review/manual:** static diff review verifies AppBar registration/update/removal code is unchanged. Human Windows check confirms file picker, Japanese rendering, navigation, reload semantics, warnings, and that existing AppBar/Safe Exit behavior remains intact. This is not a new AppBar acceptance run unless separately authorized.

## Work Package / Issue candidate — not registered

**Title:** `feat: open and reload local YAML lessons`

**Candidate WP:** WP-GB-02, one implementation package with matching tests.

- **Specification:** `specs/lesson-yaml/spec.md`; **Plan:** `specs/lesson-yaml/plan.md`; **Tasks:** `specs/lesson-yaml/tasks.md`.
- **Requirements:** R-01, R-04, R-05, R-07, R-08. Related AppBar behavior AB-001–AB-008 is preserved; this work does not satisfy untested AppBar acceptance.
- **Feature IDs:** LYM-001–LYM-008; **Success Criteria:** LYM-SC-001–LYM-SC-008; **Tasks:** T001–T008.
- **Dependency:** merged WP-GB-01 implementation in PR #21 / Issue #20. Issue #20 remains open if still open; its incomplete evidence is carried forward as-is.
- **Scope:** local Open/Reload, parser and validation, image metadata/status (no viewer), transactional state, overflow, tests, Windows compile and manual UI verification.
- **Acceptance:** LYM-SC-001–LYM-SC-008; every criterion recorded separately as PASS/FAIL/NOT_RUN/MANUAL_PENDING.
- **Stop conditions:** dependency/path policy unresolved; any fatal parse/validation error must preserve old state; unexpected AppBar state change/regression; any API/file-system error with uncertain state; no forced termination or OS recovery action.
- **Status:** proposal only. No Issue has been registered and this plan does not authorize implementation.

## Completion boundary

WP-GB-02 is complete only when automated checks, current-head Windows x64 compile, independent review, and the approved human UI checks are recorded. It does not complete R-05 image viewing, all of R-07 display management, all of R-08 error behavior, R-09 distribution, or the AppBar feature specification.
