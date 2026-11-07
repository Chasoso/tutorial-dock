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

1. Resolve the feature directory using this precedence:
   - **Current user instruction:** use an explicitly named path such as `specs/windows-appbar`; do not ask again for a path already supplied.
   - **Current instruction and repository artifacts:** when no path is explicit, use them only if they identify exactly one feature directory.
   - **Local feature pointer:** treat `.specify/feature.json` as a candidate, not authority. Validate it and confirm it is consistent with the current request and existing feature artifacts. Ignore a stale or conflicting pointer; a pointer alone does not resolve an otherwise ambiguous request.
   - If no single target is safe, report candidates and ask the user without writing files.

2. Normalize separators and validate that the target is repository-relative `specs/<feature-slug>` with exactly two path segments and a nonempty slug other than `.` or `..`. Reject absolute/drive/UNC paths, traversal, nested paths, and any resolved path (including through a symlink) outside the repository. Confirm that it is the requested feature and that updating `tasks.md` is consistent with the human instruction. Do not change `.specify/.gitignore`.

3. Confirm both `<feature_directory>/spec.md` and `<feature_directory>/plan.md` exist. If either is missing, stop without creating/updating the pointer or Tasks. If `tasks.md` already exists, overwrite/update it only when the human instruction requests that update; otherwise preserve it and ask before replacing it.

4. After the target and required inputs are validated, update the ignored local `.specify/feature.json` to the normalized path. Do not treat it as an approval record.

5. **Load context**: `AGENTS.md`, `docs/development/workflow.md`, `docs/development/specification-policy.md`, `docs/requirements.md`, `<feature_directory>/spec.md`, and `<feature_directory>/plan.md`. Read `docs/design.md` or an approved project constitution when relevant; do not create a constitution as part of this Skill.

6. Create dependency-ordered implementation tasks and store them only in `<feature_directory>/tasks.md`.
   - Every task uses checklist format: `- [ ] [TaskID] Description with file path`
   - Organized by phase: setup, foundational, user stories in priority order, polish

## Tutorial Dock policy

- Preserve existing task IDs. Identify each task with its feature directory, for example `specs/<feature-slug>/T001`.
- Reference feature-specification IDs in tasks where practical, and preserve requirement-to-feature mappings from `spec.md`. Do not assume Spec Kit automatically carries source requirement IDs into each task.
- Keep implementation and its corresponding tests in the same proposed Work Package by default. Record dependencies and verifiable completion conditions.
- Treat `tasks.md` as a plan-time snapshot. GitHub Issues, after human-approved registration, are the implementation progress source of truth; do not design an ongoing checkbox synchronization process.
- Preserve unresolved product and Level 2/3 technical decisions as dependencies or open items. Do not finalize them through task wording. This Skill does not approve a Plan or authorize implementation.
- This Skill creates or updates only `tasks.md`. It does not register Issues, implement tasks, invoke Spec Kit Implement, or mark tasks complete.
