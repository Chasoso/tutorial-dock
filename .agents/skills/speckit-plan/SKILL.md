---
name: speckit-plan
description: Create a plan and store it in plan.md.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: preset:lean
---

# Speckit Plan Skill

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

2. Normalize separators and validate that the target is repository-relative `specs/<feature-slug>` with exactly two path segments and a nonempty slug other than `.` or `..`. Reject absolute/drive/UNC paths, traversal, nested paths, and any resolved path (including through a symlink) outside the repository. Confirm that it is the requested feature and that updating `plan.md` is consistent with the human instruction. Do not change `.specify/.gitignore`.

3. Confirm `<feature_directory>/spec.md` exists. If not, stop without creating/updating the pointer or Plan. If `plan.md` already exists, overwrite/update it only when the human instruction requests that update; otherwise preserve it and ask before replacing it.

4. After the target and required input are validated, update the ignored local `.specify/feature.json` to the normalized path. Do not treat it as an approval record.

5. **Load context**: `AGENTS.md`, `docs/development/workflow.md`, `docs/development/specification-policy.md`, `docs/requirements.md`, `docs/design.md`, and `<feature_directory>/spec.md`. Read an approved project constitution only if one exists; do not create one as part of this Skill.

6. Create an implementation plan and store it only in `<feature_directory>/plan.md`.
   - Technical context: tech stack, dependencies, project structure
   - Design decisions, architecture, file structure

## Tutorial Dock policy

- Use the current approved specification and existing design as inputs. A generated or PR-only specification is a proposal; label dependent planning decisions accordingly.
- Never treat a local pointer or generated specification as evidence of human approval. Keep the Plan a proposal until the repository approval policy is met.
- Keep technical choices within approved boundaries. For Level 2 decisions, record options and stop dependent planning until a human approves a direction. For Level 3 feasibility or environment-dependent behavior, identify a Technical Spike and its success/failure criteria; do not claim feasibility.
- Record assumptions, dependencies, test strategy, and unresolved decisions. Do not silently resolve product questions or contradict approved behavior.
- This Skill creates or updates only `plan.md`. It does not implement code, create GitHub Issues, run Spec Kit Implement, or mark the Plan approved.
