# Revised Tasks comparison record

The initial Lean task output is preserved unchanged in `generated/tasks.md`.

## Actual diff

There is no substantive task diff between `generated/tasks.md` and the prior `revised/tasks.md`. Every T001–T008 task line, including the FR/SC references, was already present in the initial output. The only prior differences were the heading and explanatory paragraph.

## Decision

No revised task list is needed. This file is retained as an audit record so the evaluation does not claim an improvement that was not performed. The Issue candidates are based on the unchanged task set and the recommended Issue/PR operating model, not on a fabricated task revision.

## Phase 1: Foundation

- [ ] [T001] Define the fixed validated fixture and guide-bar view-state types in the selected application source path, covering unloaded and loaded states with current index and total count. (FR-003, FR-006)
- [ ] [T002] Add bounded Previous/Next state transitions and derived current-step summary, with no-op behavior for unloaded, first-step, and last-step states. (FR-003, FR-004, FR-005, FR-006)

## Phase 2: Guide Bar UI

- [ ] [T003] Implement the frameless top guide-bar view using the existing Electron renderer/preload boundary, rendering current/total number, title, description, and mouse-operable Previous/Next controls. (FR-001, FR-003, FR-004, FR-007)
- [ ] [T004] Apply one fixed normal-height layout token and verify that changing steps does not change the guide-bar height; keep approximately 90px provisional. (FR-002)
- [ ] [T005] Render the unloaded-material state and keep step navigation inert until a fixture is provided. (FR-006)

## Phase 3: Verification

- [ ] [T006] Add component/state tests for fixture summary, adjacent navigation, first/last boundary protection, unloaded state, and fixed-height behavior. (SC-002, SC-003, SC-004, SC-005, SC-006)
- [ ] [T007] Add sequential mouse UI tests for loaded display, Previous/Next movement, first/last boundaries, and unloaded display. (SC-001, SC-003, SC-004, SC-005, SC-006)
- [ ] [T008] Review the feature diff and test scope to confirm it does not add AppBar, work-area reservation, collapse, multi-display, image viewer, YAML parsing, portable executable, or global-shortcut work. (SC-007)
