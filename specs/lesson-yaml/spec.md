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
| LYM-003 | R-04, R-05 | Read UTF-8 lesson text, including Japanese strings and YAML block/multiline descriptions, and show step one after a successful new lesson load. |
| LYM-004 | R-01, R-05, R-08 | Retain image action metadata, resolve `src` relative to the YAML file's parent, surface asset warnings, and distinguish unavailable viewer from missing/unreadable asset. |
| LYM-005 | R-07, R-08 | Explicit reload preserves the current step ID or falls back to the first step; failed reload atomically preserves the previous lesson and step. |
| LYM-006 | R-01, R-05, R-07 | Render lesson buttons in the right action area and put overflow items in “その他” without increasing the bar height. |
| LYM-007 | R-04, R-05, R-08 | Keep parsing, validation, asset status, and lesson/navigation state independent of Win32 controls and testable without AppBar calls. |
| LYM-008 | R-02, R-04, R-07, R-08 | Report recoverable file/validation/asset issues without corrupting the active lesson, blocking other applications, or changing AppBar lifecycle behavior. |

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

- The YAML document is one mapping with a string `title` and a `steps` sequence containing at least one step.
- Each step is a mapping with string `id`, `title`, and `description`, plus an optional `buttons` sequence. If `buttons` is omitted, it is treated as empty. The ID must not be empty; title/description emptiness and whitespace normalization remain validation details to confirm at the decision gate rather than implicit constraints here.
- Step IDs are unique within a lesson. The original string is the stable identity used for reload position retention; implementations must not derive identity from display order or title.
- Each button is a mapping with string `label` and `action`, and the fields required by that action. `image` is the only accepted action in this Work Package and requires a non-empty string `src`.
- Unknown action values are fatal validation errors. No action may execute YAML-provided code, shell commands, scripts, URLs, or arbitrary HTML.
- `description` is plain text. YAML block scalars and UTF-8 Japanese text are supported.
- YAML syntax errors, absent required fields, invalid types/shapes, zero steps, duplicate step IDs, unsupported actions, and lesson-file read errors are fatal. The candidate lesson is not applied.

Whether unknown mapping keys are rejected or reported as warnings is an explicit decision gate in the Plan; the current product requirements do not define it. Duplicate YAML mapping-key treatment, ID comparison semantics, multi-document YAML behavior, and parser resource limits also require an implementation decision before acceptance tests are fixed.

## 4. Lesson and action behavior

### LYM-001 — Open lesson

Settings shall offer **Open lesson** through the platform's standard Windows file picker, filtered to `.yaml` and `.yml`. Canceling the picker changes no state. The app does not load a lesson at launch. On successful selection and validation, the new lesson becomes active at its first step and navigation/action controls update from that model.

### LYM-002 / LYM-003 — Parse, validate, and present

Read the selected file as UTF-8 and parse it with a maintained YAML library chosen at the Plan decision gate. Japanese text and block descriptions are displayed as text, never interpreted as markup or executable content. Parsing/validation is independent of Win32 controls. A successful load changes the active lesson only after a complete candidate model has been built.

### LYM-004 — Image action metadata without a viewer

Keep each `image` action's label, source string, YAML file context, resolved asset path where available, and availability reason in the lesson model. Resolve relative `src` against the parent directory of the YAML file. Asset absence or inability to open/read the referenced file is a non-fatal warning associated with its file and step; other steps remain navigable.

This Work Package does not display or decode images. When the referenced file is available, its action is represented but disabled with a distinct “image viewer not implemented” reason. When the asset is absent/unreadable, it is disabled with a distinct asset warning reason. These states must not be conflated. Determining whether an image is a valid PNG/JPEG/WebP is deferred to the viewer Work Package.

The accepted boundary for absolute paths, `..`, and symlink/reparse-point traversal is not established by R-04 or `docs/design.md`; do not silently impose a new path restriction. The Plan records choices and requires a human decision before implementation adopts one.

### LYM-005 — Reload and switch semantics

Reload is manual only; no file watcher or automatic refresh is added. Reload is available only when a file-backed lesson is active. The in-memory sample is not re-read from disk; the built-in sample remains available through its existing explicit action.

For reload of the same source file, capture the current step ID before loading. If parsing and validation succeed, select the same ID if it remains; otherwise select the first step. If reload fails for any fatal reason, retain the exact prior lesson, source path, current step ID/index, and action states. A successful Open of a different lesson always selects its first step, even when an ID happens to match.

### LYM-006 — Actions and overflow

Place current-step buttons in R-01's right-side action area. If they do not fit, expose them through the existing “その他” overflow affordance and do not increase guide-bar height. Viewer-unavailable or missing/unreadable buttons remain visible as disabled entries with an accessible/explanatory reason. Overflow presentation is a continuation of R-01, not a new height mode.

### LYM-007 / LYM-008 — State safety and errors

The model/parser layer returns either a fully validated candidate lesson with warnings or a fatal error result. UI code commits the candidate atomically; it must not mutate the active lesson while parsing, validation, or asset checks are in progress. Error and warning presentation includes the filename and, when available, step ID and parser line/column. Failure to present a notification must not invalidate or partially replace the lesson model.

AppBar registration, geometry updates, collapse/expand behavior, release verification, and Safe Exit are unchanged. Tests for lesson parsing/state do not call AppBar APIs.

## 5. User scenarios

1. **Open a lesson:** from the empty bar, select a UTF-8 `.yaml`/`.yml`; the first step appears. Cancel or choose an invalid file and the prior state remains.
2. **Navigate:** move through steps with bounded Previous/Next behavior; Japanese and multiline descriptions remain text.
3. **Use an image action:** see a disabled action with “viewer unavailable” if the local file is present, or a distinct missing/unreadable warning if it is not. Continue to other steps.
4. **Reload:** edit the active source and select Reload lesson. Keep the current step ID when present, otherwise move to the first step. A failed reload leaves the prior contents and position intact.
5. **Switch:** open another valid lesson; start at its first step regardless of matching IDs.
6. **Overflow:** action controls beyond the right-side space are reachable in “その他”; the bar height remains unchanged.

## 6. Success criteria

| ID | Acceptance criterion | Verification |
|---|---|---|
| LYM-SC-001 | Startup remains empty; Settings opens a standard picker filtered for `.yaml`/`.yml`; cancel is a no-op; a different valid lesson opens at step one. | Model tests plus Windows manual picker/UI check; AppBar lifecycle is observed only as existing behavior, not revalidated by this feature. |
| LYM-SC-002 | Valid UTF-8 sample YAML with Japanese text and block description loads and presents title, step text, buttons, and correct progress. | Unit tests and Windows UI manual check. |
| LYM-SC-003 | Empty, malformed, invalid-shape, missing-required-field, duplicate-ID, unsupported-action, and file-read-failure cases are fatal. If a lesson is already active, a failed Open or Reload leaves its lesson contents, source path, current step position/ID, and action states unchanged. | Table-driven parser and state transaction tests for failed Open and failed Reload after activating a valid lesson. |
| LYM-SC-004 | `image` metadata and relative source are retained; present assets are disabled only because the viewer is unavailable; absent/unreadable assets are disabled with a distinct warning; navigation remains usable. | Asset resolver/model tests and UI-state tests using temporary fixtures; no viewer or network. |
| LYM-SC-005 | Reload of the same file preserves current step ID when present, falls back to first step when absent, and on failure preserves the complete previous state. | State/model tests for all three cases. |
| LYM-SC-006 | Opening a different valid file starts at its first step; built-in sample loading still works and remains covered by regression tests. | State/model tests and existing guide-model regression tests. |
| LYM-SC-007 | Overflow lesson actions are reachable through “その他” without a height increase; disabled state and reason are preserved in the menu. | UI/layout test or focused Win32 control test plus manual check if automation cannot assert actual native layout. |
| LYM-SC-008 | Normal lesson use is offline and never executes YAML content; parser/model tests do not invoke AppBar APIs or change OS work area. | Static dependency/API review and automated test harness inspection. |

No criterion here claims GBM-SC-001/004/006 or the Windows AppBar product behavior has been newly verified. Existing WP-GB-01 evidence remains as recorded; Issue #20's missing external post-exit evidence is not upgraded by this feature.

## 7. Out of scope

- Image viewing, image decoding/zoom/pan, or validation of image file format.
- YAML authoring/editing, save/export, automatic file watching, lesson auto-load on startup, or cloud/network content.
- Executing YAML scripts, commands, HTML, URLs, or arbitrary action plug-ins.
- Multi-display behavior, AppBar protocol changes, collapse/expand changes, Safe Exit changes, and abnormal-exit recovery.
- Display selection, portable packaging, and product-wide UI technology selection.

## 8. Open decisions before implementation

1. Choose and approve YAML parser dependency and pinned source/revision (Level 2: runtime/build dependency and license/supply-chain impact).
2. Decide path boundary for absolute paths, parent traversal, symlinks/reparse points (security and user-content behavior).
3. Decide unknown/duplicate mapping-key behavior, ID comparison semantics, multi-document YAML behavior, UTF-8 BOM handling, empty text-field behavior, and parser/file resource limits; preserve required UTF-8 Japanese support and avoid arbitrary undocumented constraints.
4. Decide native disabled-button affordance and how warning/error details are shown within the existing bar/settings flow without altering AppBar behavior.

The Plan may recommend options; these decisions are not approved by this proposal.
