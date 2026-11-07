---
name: speckit-tasks
description: Create the tasks needed for implementation and store them in tasks.md.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: preset:lean
---

# Speckit Tasks Skill

## User Input

```text
$ARGUMENTS
```

## Outline

1. Read `.specify/feature.json` to get the feature directory path.

2. **Load context**: `AGENTS.md`, `docs/development/workflow.md`, `docs/development/specification-policy.md`, `docs/requirements.md`, `<feature_directory>/spec.md`, and `<feature_directory>/plan.md`. Read `docs/design.md` or an approved project constitution when relevant; do not create a constitution as part of this Skill.

3. Create dependency-ordered implementation tasks and store them in `<feature_directory>/tasks.md`.
   - Every task uses checklist format: `- [ ] [TaskID] Description with file path`
   - Organized by phase: setup, foundational, user stories in priority order, polish

## Tutorial Dock policy

- Preserve existing task IDs. Identify each task with its feature directory, for example `specs/<feature-slug>/T001`.
- Reference feature-specification IDs in tasks where practical, and preserve requirement-to-feature mappings from `spec.md`. Do not assume Spec Kit automatically carries source requirement IDs into each task.
- Keep implementation and its corresponding tests in the same proposed Work Package by default. Record dependencies and verifiable completion conditions.
- Treat `tasks.md` as a plan-time snapshot. GitHub Issues, after human-approved registration, are the implementation progress source of truth; do not design an ongoing checkbox synchronization process.
- This Skill creates or updates only `tasks.md`. It does not register Issues, implement tasks, invoke Spec Kit Implement, or mark tasks complete.
