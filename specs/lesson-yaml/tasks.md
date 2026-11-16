# YAML Lesson Loading and Reload — Tasks

**Status:** Proposal snapshot. These tasks do not register an Issue or authorize implementation.
**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md)

Task IDs are local to `specs/lesson-yaml/`. Preserve R-01–R-09 and AB-001–AB-008. One proposed Work Package keeps implementation and its tests together.

## WP-GB-02 candidate — Open and reload local YAML lessons (not registered)

**Preconditions:** human approves the registered Issue and execution order. Implement against the D1–D4 choices and proposed bounds in [spec.md](spec.md) and [plan.md](plan.md); verify the parser pin, security/conformance checks, and safe bound enforcement before integrating it. Do not change AppBar lifecycle behavior.

- [ ] [T001] Pin yaml-cpp 0.9.0 to commit `56e3bb550c91fd7005566f19c079cb7a503223cf`; record MIT license and upstream security/advisory/known-issue review; verify the planned static `/MT` Windows link and no unexpected runtime DLL before dependency integration. (R-04, R-05, R-08; D1)
- [ ] [T002] Define the UI-independent lesson, step, image-action, asset-status, validation-diagnostic, and transactional-load result types; retain the existing built-in sample lesson and navigation regression behavior. (R-04, R-05, R-08; LYM-002–LYM-005, LYM-007)
- [ ] [T003] Add versioned fixtures for Japanese, literal/folded block, multiline quoted and long (8 KiB) descriptions, empty description, leading BOM, and image actions; test that an exact duplicate step ID is rejected while IDs differing only by case are accepted as distinct. Add invalid cases for unknown/duplicate keys and multiple documents. For every configured resource limit, test a valid input at the boundary and rejection immediately above it. Include failed Open/Reload after a valid lesson is active and present/missing/unreadable/unsafe image references. (R-04, R-05, R-08; LYM-SC-002–LYM-SC-005)
- [ ] [T004] Integrate the pinned YAML parser and implement UTF-8/BOM reading, exactly-one-document handling, fatal unknown/duplicate mapping keys, schema/action validation, case-sensitive unique IDs, required-but-empty-allowed descriptions, and the 1 MiB/depth-16/500-step/64-per-step/1,024-total-button/128-alias/20,000-node bounds. Reject cycles and report file/step/parser context. Do not execute YAML-provided content. (R-04, R-05, R-08; LYM-002, LYM-003, LYM-008)
- [ ] [T005] Resolve relative image sources from the YAML parent and verify the final target remains inside the canonical lesson folder after symlink/reparse resolution. Treat missing, unreadable, absolute, escaped, or unverifiable targets as non-fatal warnings and disabled actions; retain metadata and distinct reason states. Do not decode or display images. (R-01, R-04, R-05, R-08; LYM-004, LYM-006)
- [ ] [T006] Add transactional Open/Reload model operations: new lesson starts first; same-file reload preserves current ID or falls back first; a different file starts first; failed Open and failed Reload after a valid lesson is active each leave lesson/source/current step ID and index/action state unchanged; preserve built-in sample loading. (R-04, R-05, R-07, R-08; LYM-001, LYM-003, LYM-005, LYM-007)
- [ ] [T007] Add Open/Reload to Settings; render description excerpts without changing the 90 px bar and add a non-modal scrollable full-text/error-detail popup. Newly implement “その他” for action overflow, keep Previous/Next/progress/Settings/Collapse-Expand pinned, and make distinct disabled-action reasons mouse-inspectable in the bar and menu. Do not alter AppBar lifecycle, collapse/expand, release, or Safe Exit code. (R-01, R-04, R-05, R-07; LYM-001, LYM-003, LYM-004, LYM-006, LYM-008)
- [ ] [T008] Add OS-independent parser/model/transaction/UI-state tests, Windows x64 MSVC/SDK compile-only CI and fixture coverage; run current-head static checks and independent review; prepare a human Windows UI check for picker, Japanese/multiline/long text details, Open/Reload, warning reasons, action overflow, and pinned controls. Do not launch the executable or invoke AppBar APIs in CI. (R-01, R-02, R-04, R-05, R-07, R-08; LYM-SC-001–LYM-SC-008)

### Required fixture cases

- Valid `.yaml` and `.yml`: Japanese title/step text, literal/folded block and multiline quoted descriptions, an 8 KiB description, empty description, leading UTF-8 BOM, zero buttons, and image action. Assert exact scalar text for supported fixtures and test the yaml-cpp 0.9.0 multiline regression case.
- Invalid: empty document, malformed syntax, wrong root/steps/step/button shape, missing required values, zero steps, unknown/duplicate mapping keys, exact duplicate step IDs, multiple YAML documents, unsupported action, missing/empty `src`, unreadable lesson file, and each configured size/depth/steps/buttons/aliases/node limit exceeded by one. Separately assert that IDs differing only by case are accepted as distinct.
- Asset outcomes: readable in-folder path; missing/unreadable path; absolute/UNC/device path; `..` escape; symlink/reparse target within folder; symlink/reparse escape; and target whose final path cannot be verified. Keep image-format decoding out of this Work Package.
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

**Scope:** local YAML open and manual reload, strict structural validation and bounded parser input, transactional active-lesson state, contained relative image metadata/warnings with no viewer, ellipsized descriptions with full-text detail, newly implemented right-side “その他” overflow with mouse-inspectable disabled reasons, regression fixtures/tests, x64 Windows compile, independent review, and human Windows UI verification.

**Acceptance:** satisfy LYM-SC-001–LYM-SC-008 and record each as PASS/FAIL/NOT_RUN/MANUAL_PENDING. Include the valid/invalid/asset/reload fixture cases above. CI does not launch the product or call AppBar APIs.

**Stop conditions:** pinned parser fails license/security/conformance or safe-bound verification; image final path cannot be verified; fatal load/reload must never partially replace current state; any unexpected AppBar lifecycle change; uncertain OS state; no forced process termination or OS recovery. Keep YAML parser failures distinct from image warnings.

**Registration state:** candidate only. No GitHub Issue has been created; a human must approve this Work Package before registration, and registration will not itself authorize implementation.
