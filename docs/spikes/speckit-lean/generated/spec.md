# Guide Bar Basic Display

## Overview

Provide the basic guide bar display for a Windows tutorial presenter. The feature uses an already loaded and validated fixed fixture so this spike can evaluate the UI and step-navigation workflow without deciding YAML parsing or packaging behavior.

## Scope

In scope: the frameless guide bar at the top of the selected Windows display, a fixed normal display height, current/total step indicators, title and description, mouse navigation, boundary protection, and the unloaded-material state.

Out of scope: Windows AppBar API, work-area reservation, collapsing, multi-display switching, image viewer, YAML parsing, portable executable generation, global shortcuts, and keyboard-dependent operation.

The approximately 90px normal height is a provisional target, not a finalized product value. Fixture use limits this spike only; it does not remove YAML loading from the eventual MVP.

## Functional Requirements

### FR-001: Top guide bar

The system shall display a frameless guide bar at the top edge of the selected Windows display.

### FR-002: Fixed normal height

The guide bar shall keep one fixed height during normal display and shall not change height when the current step changes. The approximately 90px value may be used as a provisional test target but shall not be treated as a finalized specification.

### FR-003: Current step summary

When a material fixture is loaded, the guide bar shall show the current step number, total number of steps, current step title, and current step description.

### FR-004: Forward and backward navigation

The presenter shall be able to move to the previous or next fixture step by mouse-clicking the corresponding guide-bar button.

### FR-005: Boundary protection

At the first step, a previous-step action shall not move before the first step. At the last step, a next-step action shall not move after the last step. The current step and displayed content shall remain valid after an out-of-range action.

### FR-006: Unloaded material state

Before material is loaded, the guide bar shall show an unloaded-material state and shall not expose a misleading current step. Step navigation shall not change a step in this state.

### FR-007: Mouse operation

The in-scope guide-bar interactions shall be operable with a mouse. Keyboard shortcuts are not required by this spike.

## User Scenarios

### Scenario 1: View the current step

Given a validated fixture with at least three ordered steps, when the guide bar is displayed, then the first step number, total count, title, description, and fixed normal height are visible.

### Scenario 2: Move between steps

Given the fixture is loaded, when the presenter clicks Next and then Previous, then the step number and associated title/description change to the expected adjacent steps.

### Scenario 3: Protect the first and last steps

Given the first step is selected, when the presenter clicks Previous, then the first step remains selected. Given the last step is selected, when the presenter clicks Next, then the last step remains selected.

### Scenario 4: Show the unloaded state

Given no material fixture is loaded, when the guide bar is displayed and its navigation controls are clicked, then the unloaded state remains visible and no step content is shown or advanced.

## Success Criteria

- SC-001: A UI test verifies top placement and absence of a title-bar/OS frame for the guide bar.
- SC-002: A UI test verifies that normal height is unchanged across at least two fixture steps without asserting approximately 90px as a final product contract.
- SC-003: A UI test verifies current/total step text, title, and description for a loaded fixture.
- SC-004: Mouse UI tests verify previous/next movement for adjacent steps.
- SC-005: Mouse UI tests verify no movement beyond the first or last step.
- SC-006: A UI test verifies the unloaded-material state and inert navigation before loading.
- SC-007: No implementation or task in this feature requires the explicitly out-of-scope capabilities.
