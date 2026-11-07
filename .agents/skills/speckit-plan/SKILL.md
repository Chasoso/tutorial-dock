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

1. Read `.specify/feature.json` to get the feature directory path.

2. **Load context**: `AGENTS.md`, `docs/development/workflow.md`, `docs/development/specification-policy.md`, `docs/requirements.md`, `docs/design.md`, and `<feature_directory>/spec.md`. Read an approved project constitution only if one exists; do not create one as part of this Skill.

3. Create an implementation plan and store it in `<feature_directory>/plan.md`.
   - Technical context: tech stack, dependencies, project structure
   - Design decisions, architecture, file structure

## Tutorial Dock policy

- Use the current approved specification and existing design as inputs. A generated or PR-only specification is a proposal; label dependent planning decisions accordingly.
- Keep technical choices within approved boundaries. For Level 2 decisions, record options and stop dependent planning until a human approves a direction. For Level 3 feasibility or environment-dependent behavior, identify a Technical Spike and its success/failure criteria; do not claim feasibility.
- Record assumptions, dependencies, test strategy, and unresolved decisions. Do not silently resolve product questions or contradict approved behavior.
- This Skill creates or updates only `plan.md`. It does not implement code, create GitHub Issues, run Spec Kit Implement, or mark the Plan approved.
