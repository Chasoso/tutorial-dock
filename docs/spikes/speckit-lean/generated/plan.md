# Implementation Plan: Guide Bar Basic Display

## Technical Context

- Target: Windows desktop application using the existing Electron candidate architecture described in `docs/design.md`.
- Runtime boundary: main process owns window lifecycle and validated material state; renderer owns guide-bar presentation and mouse interaction through a narrow preload/API boundary.
- Data input for this spike: an in-memory fixed fixture already validated before it reaches the UI. YAML parsing, file dialogs, AppBar registration, and packaging are not implementation inputs for this feature.
- Test strategy: renderer/component tests for state and rendering, plus sequential Windows UI/E2E tests for mouse navigation, boundary behavior, unloaded state, and fixed-height behavior.
- Dependencies: use the repository's existing Electron/test dependencies if present. Do not add a dependency as part of this planning spike; the repository currently contains no application package manifest, so dependency selection remains an open implementation decision.

## Design Decisions

1. Represent the guide bar with a small view state: `unloaded` or `loaded`, with a fixture, current index, and derived total/title/description.
2. Keep navigation transitions in one state owner. `Previous` applies `max(index - 1, 0)` and `Next` applies `min(index + 1, total - 1)`; unloaded state ignores both transitions.
3. Derive displayed step data from the current index rather than duplicating title and description in control handlers.
4. Keep normal height as one layout token and do not make it depend on step content. Treat approximately 90px as a provisional test target only.
5. Make mouse buttons discoverable and testable by stable accessible names/roles. Do not introduce keyboard shortcuts or accessibility policy beyond what the existing application supports.
6. Keep the UI feature independent of AppBar/work-area reservation and other excluded features so the spike can be reviewed as one bounded change.

## Proposed Structure

The exact paths are intentionally provisional because this repository has no application source yet. The implementing change should adapt these responsibilities to the chosen structure without changing the feature contract:

- `src/guide-bar/model` — fixture and view-state types.
- `src/guide-bar/state` — loaded/unloaded state and bounded step transitions.
- `src/guide-bar/GuideBar` — renderer UI for summary and controls.
- `src/guide-bar/GuideBar.test` — deterministic state/render tests.
- `tests/e2e/guide-bar-basic-display.spec` — mouse-driven UI coverage.

## Verification Plan

1. Unit/component tests cover loaded and unloaded states, derived summary, adjacent navigation, first/last boundary no-ops, and fixed-height token use.
2. UI/E2E tests use a fixed fixture and mouse clicks, asserting visible step summary after each action.
3. The test matrix includes a three-step fixture, first-step boundary, last-step boundary, and no-fixture state.
4. A review check confirms no AppBar, collapse, display switching, image viewer, YAML parser, packaging, or global shortcut task appears in this feature.

## Open Decisions

- Actual source/test paths and existing Electron package dependencies cannot be finalized until application scaffolding exists.
- Exact height must be decided by later UX validation; this plan does not promote approximately 90px to a final value.
- The eventual IPC contract and fixture injection mechanism need a repository-level design decision.
