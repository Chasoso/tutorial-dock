# YAML Lesson Loading and Reload — Tasks

**Status:** Proposal snapshot. These tasks do not register an Issue or authorize implementation.
**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md)

Task IDs are local to `specs/lesson-yaml/`. Preserve R-01–R-09 and AB-001–AB-008. One proposed Work Package keeps implementation and its tests together.

## WP-GB-02 candidate — Open and reload local YAML lessons (not registered)

**Preconditions:** human approves the registered Issue and execution order; resolve D1 YAML dependency, D2 image path boundary, and D3 parser strictness/resource choices in [plan.md](plan.md) before dependent implementation. Do not change AppBar lifecycle behavior.

- [ ] [T001] Resolve and record the implementation decision gates for YAML library/version/source pin and CI linkage; image path policy (absolute/`..`/symlink or reparse points); unknown and duplicate mapping keys; step-ID case/normalization rules; multi-document YAML; UTF-8 BOM; empty text fields; and parser/file/alias/nesting resource bounds. (R-04, R-05, R-08; D1–D3)
- [ ] [T002] Define the UI-independent lesson, step, image-action, asset-status, validation-diagnostic, and transactional-load result types; retain the existing built-in sample lesson and navigation regression behavior. (R-04, R-05, R-08; LYM-002–LYM-005, LYM-007)
- [ ] [T003] Add versioned test YAML fixtures for valid Japanese/multiline content and representative invalid cases; include failed Open and failed Reload after a valid lesson is active; add image fixtures or temporary-file setup for present, missing, and unreadable references. (R-04, R-05, R-08; LYM-SC-002–LYM-SC-004)
- [ ] [T004] Integrate the approved YAML parser and implement UTF-8 reading, syntax/type/schema validation, unique step-ID validation, `image`-only action validation, and actionable file/step/parser diagnostics. Do not execute YAML-provided content. (R-04, R-05, R-08; LYM-002, LYM-003, LYM-008)
- [ ] [T005] Implement image source resolution and non-fatal asset warnings per the approved path policy; retain action metadata and distinguish viewer-unavailable from missing/unreadable state. Do not decode or display images. (R-01, R-04, R-05, R-08; LYM-004, LYM-006)
- [ ] [T006] Add transactional Open/Reload model operations: new lesson starts first; same-file reload preserves current ID or falls back first; a different file starts first; failed Open and failed Reload after a valid lesson is active each leave lesson/source/current step ID and index/action state unchanged; preserve built-in sample loading. (R-04, R-05, R-07, R-08; LYM-001, LYM-003, LYM-005, LYM-007)
- [ ] [T007] Integrate Open lesson and Reload lesson in Settings and render current lesson/action state in existing native controls; preserve R-01 fixed-height layout and expose overflow through “その他” with distinct disabled reasons. Do not alter AppBar lifecycle, collapse/expand, release, or Safe Exit code. (R-01, R-04, R-05, R-07; LYM-001, LYM-003, LYM-004, LYM-006, LYM-008)
- [ ] [T008] Add OS-independent parser/model/transaction/UI-state tests, Windows x64 MSVC/SDK compile-only CI and fixture coverage; run current-head static checks and independent review; prepare a human Windows UI check for picker, Japanese text, open/reload, warnings, and overflow. Do not launch the executable or invoke AppBar APIs in CI. (R-01, R-02, R-04, R-05, R-07, R-08; LYM-SC-001–LYM-SC-008)

### Required fixture cases

- Valid `.yaml` and `.yml`: Japanese title/step text, block description, zero buttons, and image action.
- Invalid: empty document, malformed syntax, wrong root/steps/step/button shape, missing required values, zero steps, duplicate step IDs, unsupported action, missing/empty `src`, unreadable lesson file.
- Asset outcomes: existing readable path, missing path, and a file that cannot be opened for reading; keep any format-decoding test out of this Work Package.
- Reload/open transaction: current ID retained, current ID removed, malformed replacement via Reload preserves prior state, failed Open of another file preserves the active lesson/source/step/action state, and a different valid lesson starts at step one even if it reuses an ID.
- Regression: built-in sample remains explicitly loadable and navigation boundaries stay correct.

### Acceptance/evidence checklist

- Link each T001–T008 implementation and test result to the LYM feature IDs and R requirements.
- Run unit/state tests without creating an AppBar or changing OS work area.
- Verify Windows x64 compile on the exact candidate HEAD; do not run the product executable in CI.
- Record native Windows picker/rendering checks as `MANUAL_PENDING` until a human runs them.
- Compare the AppBar lifecycle files against the WP-GB-01 baseline and report whether they are unchanged.
- Keep the feature status separate from GBM-SC and Windows AppBar acceptance; do not upgrade Issue #20 gaps based on YAML tests.

## Issue candidate — not registered

**Title:** `feat: open and reload local YAML lessons`

**Traceability:** R-01, R-04, R-05, R-07, R-08; preserved AppBar contracts AB-001–AB-008; LYM-001–LYM-008; LYM-SC-001–LYM-SC-008; T001–T008. Specification commit SHA must be filled from the merged feature-spec PR before Issue registration.

**Dependency:** WP-GB-01 code in PR #21 / Issue #20. Do not mark Issue #20 complete or infer its unconfirmed Windows evidence.

**Scope:** local YAML open and manual reload, strict structural validation, transactional active-lesson state, relative image metadata and warnings with no image viewer, Settings and right-side overflow, regression fixtures/tests, x64 Windows compile, independent review, and human Windows UI verification.

**Acceptance:** satisfy LYM-SC-001–LYM-SC-008 and record each as PASS/FAIL/NOT_RUN/MANUAL_PENDING. Include the valid/invalid/asset/reload fixture cases above. CI does not launch the product or call AppBar APIs.

**Stop conditions:** unresolved Level 2 dependency or path policy; fatal load/reload must never partially replace current state; any unexpected AppBar lifecycle change; uncertain OS state; no forced process termination or OS recovery. Keep YAML parser failures distinct from image warnings.

**Registration state:** candidate only. No GitHub Issue has been created; a human must approve this Work Package before registration, and registration will not itself authorize implementation.
