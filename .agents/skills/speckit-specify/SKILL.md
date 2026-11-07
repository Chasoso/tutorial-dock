---
name: speckit-specify
description: Create a specification and store it in spec.md.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: preset:lean
---

# Speckit Specify Skill

## User Input

```text
$ARGUMENTS
```

## Outline

1. Resolve the feature directory using this precedence:
   - **Current user instruction:** use an explicitly named path such as `specs/windows-appbar`. Do not ask for a path that the user already supplied.
   - **Current instruction and repository artifacts:** if no path was supplied, use the current request and existing feature artifacts only when they identify exactly one target.
   - **Local feature pointer:** treat `.specify/feature.json` only as a candidate. Use it only when its value is valid and corroborates the current request/artifacts; a pointer by itself does not resolve an otherwise ambiguous task. Ignore a stale or conflicting pointer.
   - If the target remains ambiguous, report the candidate paths and what is unclear, then ask the user. Do not write artifacts or guess.

2. Before writing, normalize separators and validate that the selected path is a repository-relative `specs/<feature-slug>` path with exactly two path segments and a nonempty slug other than `.` or `..`. Reject absolute/drive/UNC paths, traversal, nested paths, and any resolved path (including through a symlink) outside the repository. Confirm it matches the current instruction, does not select another feature, and that any existing `spec.md` is safe to update. If an existing file would be overwritten without an explicit update request, stop and report it.

3. After the target is resolved and safe, create the directory if needed and write/update the ignored local pointer `.specify/feature.json`:
   ```json
   { "feature_directory": "specs/<feature-slug>" }
   ```
   Store the normalized repository-relative path with `/` separators. Keep `feature.json` untracked and do not change `.specify/.gitignore`.

4. Create a specification from the user input and store it only in `<feature_directory>/spec.md`.
   - Overview, functional requirements, user scenarios, success criteria
   - Every requirement must be testable
   - Do not turn unspecified or conflicting product behavior into a decision. Record it as an open question or request a human decision.

## Tutorial Dock policy

- Read `AGENTS.md`, `docs/development/workflow.md`, `docs/development/specification-policy.md`, `docs/requirements.md`, and relevant current specs/design before writing.
- Use `docs/requirements.md` as the product-wide requirements source. Preserve existing `R-*` and feature-specification IDs; map each new feature ID to its source requirement IDs. Do not invent or renumber IDs silently.
- Use `specs/<feature-slug>/spec.md`. Do not duplicate a feature specification under `docs/`.
- Treat generated or PR-only specifications as proposals. A specification on `main` remains effective until a replacement is merged. Do not change approved behavior without human approval.
- If requirements conflict, the requested behavior would change an approved specification, or a material product decision is missing, stop the affected part and report `HUMAN_DECISION_REQUIRED` with facts and options. Do not fill the gap with an assumption.
- This Skill creates or updates only `spec.md`. It does not generate a Plan or Tasks, implement code, register GitHub Issues, or mark the specification approved.
