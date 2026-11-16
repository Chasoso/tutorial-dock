# YAML Lesson Loading and Reload Specification

**Status:** Proposal for review. This document does not authorize Issue registration, implementation, dependency adoption, or Windows runtime testing.
**Work Package candidate:** WP-GB-02 — Load and reload local YAML lessons.
**Related requirements:** R-01, R-04, R-05, R-07, R-08. R-02 AppBar lifecycle is preserved and is not changed by this feature.
**Related prior slice:** [Guide Bar MVP](../guidebar-mvp/spec.md), especially GBM-002/003/008. This feature extends the lesson source while retaining the in-memory sample lesson for regression tests.

## 1. Goal and scope

Allow an instructor to open a local `.yaml` or `.yml` lesson from Settings, navigate its steps, and explicitly reload the currently selected file. Startup remains an empty guide bar. A successful switch to another lesson starts at its first step. A successful reload retains the current step by ID when possible. A failed open or reload leaves the last valid lesson and current step untouched.

This is one proposed product Work Package in the existing C++/Win32 application. It adds no image viewer, auto-watcher, YAML editor, script execution, external service, multi-display behavior, distribution work, or AppBar lifecycle redesign. The built-in sample remains available as a deterministic regression fixture/action.

## 2. Traceability

| Feature ID | Requirement IDs | Expected behavior |
|---|---|---|
| LYM-001 | R-04, R-07 | Settings offers Open lesson and Reload lesson; Open uses the standard Windows file picker for `.yaml` and `.yml`; launch remains empty. |
| LYM-002 | R-05, R-08 | Parse and validate the documented lesson/step/button structure; require at least one step and unique non-empty step IDs. |
| LYM-003 | R-01, R-04, R-05 | Read UTF-8 lesson text, including Japanese, multiline, and long descriptions; show a compact excerpt in the fixed-height bar and let the user inspect the full description with the mouse. |
| LYM-004 | R-01, R-05, R-08 | Retain image action metadata, resolve `src` relative to the YAML file's parent, surface asset warnings, and distinguish unavailable viewer from missing/unreadable asset. |
| LYM-005 | R-07, R-08 | Explicit reload preserves the current step ID or falls back to the first step; failed reload atomically preserves the previous lesson and step. |
| LYM-006 | R-01, R-05, R-07 | Implement the currently absent “その他” menu for lesson-action overflow; keep existing navigation/settings/collapse controls visible and usable, and expose disabled-action reasons by mouse without increasing bar height. |
| LYM-007 | R-04, R-05, R-08 | Keep parsing, validation, asset status, and lesson/navigation state independent of Win32 controls and testable without AppBar calls. |
| LYM-008 | R-02, R-04, R-07, R-08 | Report recoverable file/validation/asset issues without corrupting the active lesson, blocking other applications, or changing AppBar lifecycle behavior; let users inspect detailed error context with the mouse. |

Existing R-01–R-09 and AB-001–AB-008 retain their meanings. This feature does not complete all of R-01, R-05, R-07, or R-08. R-06 image viewing and R-09 distribution remain separate work.

## 3. Lesson format

The following shape formalizes the starting example in `docs/design.md` for this feature proposal:

```yaml
title: Tableau 基本操作
steps:
  - id: connect
    title: データの接続
    description: サンプルスーパーストアに接続します。
    buttons: []
  - id: bar-chart
    title: 棒グラフの作成
    description: |
      「カテゴリ」を列に、
      「売上」を行に配置します。
    buttons:
      - label: 操作方法
        action: image
        src: images/bar-chart.png
```

### 3.1 Required structure

- The file contains exactly one YAML document: a mapping with a non-empty string `title` and a `steps` sequence containing at least one step. A leading UTF-8 BOM is accepted; invalid UTF-8 is rejected.
- Each step is a mapping with a non-empty string `id`, a non-empty string `title`, and a string `description`; an empty description is valid. `buttons` is optional and defaults to an empty sequence.
- Step IDs are unique using case-sensitive ordinal string comparison (no locale case folding or Unicode normalization). The original ID is the stable identity used for reload position retention; implementations must not derive identity from display order or title.
- Each button is a mapping with a non-empty string `label` and `action`, and the fields required by that action. `image` is the only accepted action in this Work Package and requires a non-empty string `src`.
- Unknown keys at the lesson, step, or button mapping level and duplicate mapping keys are fatal validation errors. A second YAML document is also fatal.
- Unknown action values are fatal validation errors. No action may execute YAML-provided code, shell commands, scripts, URLs, or arbitrary HTML.
- `description` is plain text. YAML block scalars and UTF-8 Japanese text are supported.
- YAML syntax errors, absent required fields, invalid types/shapes, zero steps, duplicate step IDs, unsupported actions, and lesson-file read errors are fatal. The candidate lesson is not applied.

### 3.2 Resource bounds proposed for this feature

These are feature-level limits proposed to bound parsing, model allocation, and native menu work; exceeding one is a fatal load/reload error and leaves the active lesson unchanged.

| Limit | Proposed maximum | Reason |
|---|---:|---|
| YAML file size | 1 MiB of bytes, checked before decoding/parsing | Bounds file I/O and parser input while leaving room for long instructional text and hundreds of steps. |
| YAML collection nesting | 16 levels | Count the root mapping as level 1; each nested mapping or sequence adds one level. Scalars do not add a level. Alias targets are measured at the depth where each alias is expanded. The supported schema needs far fewer levels, leaving modest headroom while rejecting pathological nesting. |
| Steps per lesson | 500 | Generous for a sequential tutorial while bounding navigation/model work. |
| Buttons per step | 64 | Supports meaningful overflow cases while bounding each native menu. |
| Buttons per lesson | 1,024 | Bounds total action metadata and UI resources across all steps. |
| Alias references | 128 | Count each alias occurrence in the parsed document, including repeated references to the same anchor. This permits limited YAML reuse without unbounded alias-heavy input. |
| Expanded/visited YAML nodes | 20,000 | Count each node visit during the bounded validation walk. An alias occurrence counts as one visit, and every node reached through its target counts again on each expansion, even when the target is shared. Stop before visit 20,001. This bounds repeated alias traversal; cyclic aliases are rejected using the active traversal path. |

The byte limit is applied before invoking the parser. Resource counters run before schema conversion, so malformed or wrongly typed input is also bounded. For boundary tests, the depth counter accepts level 16 and rejects level 17; the alias counter accepts occurrence 128 and rejects 129; and the node counter accepts visit 20,000 and aborts before 20,001. Some scanner-boundary fixtures (especially depth and expanded-node cases) may be syntactically valid but invalid under the lesson schema; test the resource scanner independently for those cases, then verify schema rejection separately. Where the schema permits, test a complete valid lesson at the limit and one above it. The implementation must verify that the pinned parser path can enforce these limits without first performing unbounded expansion; if it cannot, stop dependency integration and review the parser approach instead of silently omitting a bound. These proposed values are not new product-wide R-* requirements.

## 4. Lesson and action behavior

### LYM-001 — Open lesson

Settings shall offer **Open lesson** through the platform's standard Windows file picker, filtered to `.yaml` and `.yml`. Canceling the picker changes no state. The app does not load a lesson at launch. On successful selection and validation, the new lesson becomes active at its first step and navigation/action controls update from that model.

### LYM-002 / LYM-003 — Parse, validate, and present

Read the selected file as UTF-8 and parse it with the planned yaml-cpp 0.9.0 revision recorded in the Plan. Japanese text and block descriptions are displayed as text, never interpreted as markup or executable content. Preserve the complete description in the model. The fixed-height 90 px guide bar shows a compact single-line excerpt and ellipsis when content does not fit; it never grows to fit lesson text. A mouse-operated **説明の詳細** control opens a non-modal, scrollable detail popup containing the complete text and line breaks. Closing the popup returns to the same step and does not alter the AppBar or work area. Parsing/validation is independent of Win32 controls. A successful load changes the active lesson only after a complete candidate model has been built.

### LYM-004 — Image action metadata without a viewer

Keep each `image` action's label, source string, YAML file context, resolved asset path where available, and availability reason in the lesson model. `src` must be relative to the YAML file's parent. Normalize the path and resolve Windows symlinks/reparse points; the final target must remain inside the canonical lesson folder. Absolute/drive/UNC/device paths, paths escaping the folder after resolution, and paths whose final target cannot be safely resolved are treated as unsafe references. Such references, as well as absent or unreadable image files, produce a non-fatal warning and disable only that action; other steps remain navigable. A `..` component is allowed only when the resolved final target remains within the folder.

This Work Package does not display or decode images. When the referenced file is safely resolvable and readable, its action is represented but disabled with the distinct reason **画像ビューアは未実装です**. When the file is absent/unreadable, or its resolved target is outside/unsafe, it is disabled with the corresponding distinct asset/path warning. These states must not be conflated. A mouse-operated tooltip/detail affordance must reveal the reason for a disabled-looking action both in the bar and in “その他”; do not rely on mouse messages being delivered to a native control whose disabled style suppresses hit testing. Determining whether an image is a valid PNG/JPEG/WebP is deferred to the viewer Work Package.

### LYM-005 — Reload and switch semantics

Reload is manual only; no file watcher or automatic refresh is added. Reload is available only when a file-backed lesson is active. The in-memory sample is not re-read from disk; the built-in sample remains available through its existing explicit action.

For reload of the same source file, capture the current step ID before loading. If parsing and validation succeed, select the same ID if it remains; otherwise select the first step. If reload fails for any fatal reason, retain the exact prior lesson, source path, current step ID/index, and action states. A successful Open of a different lesson always selects its first step, even when an ID happens to match.

### LYM-006 — Actions and overflow

Implement the currently absent **その他** menu for current-step lesson actions. Place actions that fit in R-01's right-side action area; put the rest in that menu without increasing bar height. Previous/Next, progress, Settings, and Collapse/Expand remain pinned, visible, and usable regardless of lesson button count. Overflow-menu entries preserve disabled state and expose their reason by mouse. The menu and description detail popup are part of this Work Package, not existing functionality assumed from WP-GB-01.

### LYM-007 / LYM-008 — State safety and errors

The model/parser layer returns either a fully validated candidate lesson with warnings or a fatal error result. UI code commits the candidate atomically; it must not mutate the active lesson while parsing, validation, or asset checks are in progress. Error and warning presentation includes the filename and, when available, step ID and parser line/column. Failure to present a notification must not invalidate or partially replace the lesson model.

AppBar registration, geometry updates, collapse/expand behavior, release verification, and Safe Exit are unchanged. Tests for lesson parsing/state do not call AppBar APIs.

## 5. User scenarios

1. **Open a lesson:** from the empty bar, select a UTF-8 `.yaml`/`.yml`; the first step appears. Cancel or choose an invalid file and the prior state remains.
2. **Read a long description:** the bar keeps its 90 px height and displays an excerpt; use the mouse-operated detail control to read the complete Japanese/multiline text in a scrollable popup.
3. **Navigate:** move through steps with bounded Previous/Next behavior; description text remains plain text.
4. **Use an image action:** see a disabled action with “viewer unavailable” when the local file is present, or a distinct missing/unreadable/unsafe-reference warning otherwise. Use the mouse to inspect the reason, then continue to other steps.
5. **Reload:** edit the active source and select Reload lesson. Keep the current step ID when present, otherwise move to the first step. A failed reload leaves the prior contents and position intact.
6. **Switch:** open another valid lesson; start at its first step regardless of matching IDs.
7. **Overflow:** with many action buttons, “その他” appears; its menu contains overflow actions while Previous/Next, Settings, progress, and Collapse/Expand remain usable and the bar height remains unchanged.

## 6. Success criteria

| ID | Acceptance criterion | Verification |
|---|---|---|
| LYM-SC-001 | Startup remains empty; Settings opens a standard picker filtered for `.yaml`/`.yml`; cancel is a no-op; a different valid lesson opens at step one. | Model tests plus Windows manual picker/UI check; AppBar lifecycle is observed only as existing behavior, not revalidated by this feature. |
| LYM-SC-002 | UTF-8 Japanese, multiline, and long descriptions load as complete text. The 90 px bar shows an ellipsized excerpt when needed; a mouse-operated detail popup exposes the complete text/line breaks and can scroll without changing bar height or AppBar work area. | Unit test exact parsed text plus Windows manual check with Japanese, multiline block scalar, and an 8 KiB description. |
| LYM-SC-003 | Empty, malformed, invalid-shape, missing-required-field, duplicate-ID, unsupported-action, and file-read-failure cases are fatal. If a lesson is already active, a failed Open or Reload leaves its lesson contents, source path, current step position/ID, and action states unchanged. | Table-driven parser and state transaction tests for failed Open and failed Reload after activating a valid lesson. |
| LYM-SC-004 | `image` metadata is retained; an in-folder readable file is disabled because the viewer is unavailable, while missing, unreadable, or unsafe/out-of-folder targets are disabled with distinct warnings. The reason is discoverable by mouse both in-bar and in “その他”; navigation remains usable. | Asset/path resolver tests (including traversal and symlink/reparse escape cases) and Windows mouse UI check; no viewer/network. |
| LYM-SC-005 | Reload of the same file preserves current step ID when present, falls back to first step when absent, and on failure preserves the complete previous state. | State/model tests for all three cases. |
| LYM-SC-006 | Opening a different valid file starts at its first step; built-in sample loading still works and remains covered by regression tests. | State/model tests and existing guide-model regression tests. |
| LYM-SC-007 | The newly implemented “その他” menu exposes actions that do not fit; Previous/Next, progress, Settings, and Collapse/Expand stay visible and usable; bar height stays fixed. Disabled menu items expose distinct reasons by mouse. | Layout/state test plus Windows mouse UI check; include enough fixture buttons to force overflow. |
| LYM-SC-008 | Normal lesson use is offline and never executes YAML content; parser/model tests do not invoke AppBar APIs or change OS work area. | Static dependency/API review and automated test harness inspection. |

No criterion here claims GBM-SC-001/004/006 or the Windows AppBar product behavior has been newly verified. Existing WP-GB-01 evidence remains as recorded; Issue #20's missing external post-exit evidence is not upgraded by this feature.

## 7. Out of scope

- Image viewing, image decoding/zoom/pan, or validation of image file format.
- YAML authoring/editing, save/export, automatic file watching, lesson auto-load on startup, or cloud/network content.
- Executing YAML scripts, commands, HTML, URLs, or arbitrary action plug-ins.
- Multi-display behavior, AppBar protocol changes, collapse/expand changes, Safe Exit changes, and abnormal-exit recovery.
- Display selection, portable packaging, and product-wide UI technology selection.

## 8. Adopted design proposals for WP-GB-02

These choices respond to the PR #22 review direction. They are feature proposals until this PR is merged; no dependency, code, or Issue is added by this document change.

1. **D1 — Parser candidate:** yaml-cpp 0.9.0 at commit `56e3bb550c91fd7005566f19c079cb7a503223cf`, statically linked. Before dependency integration, verify the exact source pin, MIT license text, upstream security policy/advisories, relevant known issues, and Windows x64 `/MT` linkage. If the pin fails the specified multiline/resource tests or security review, stop and request a parser decision rather than silently switching libraries.
2. **D2 — Image path boundary:** accept relative `src` only when its normalized, symlink/reparse-resolved final target remains inside the canonical YAML parent folder. Missing, unreadable, or not safely resolvable images warn and disable only that action.
3. **D3 — YAML strictness:** reject unknown/duplicate mapping keys and multiple documents; compare step IDs case-sensitively; accept one leading UTF-8 BOM; require `description` but allow it to be empty; enforce the resource bounds in section 3.2.
4. **D4 — Fixed-height mouse UI:** keep the normal bar at 90 px; show an ellipsized description excerpt and provide a scrollable full-text detail popup. Implement “その他” for action overflow, keep existing controls pinned, and reveal error/disabled-action details through mouse-operated tooltip or detail affordances.

`docs/requirements.md` is unchanged. R-04 already resolves image references from the YAML folder; containment clarifies the currently unspecified behavior for absolute paths, traversal, and link escapes. It does not change AppBar requirements or permit external lesson execution. Human review of this feature proposal remains the approval boundary before Issue registration or implementation.
