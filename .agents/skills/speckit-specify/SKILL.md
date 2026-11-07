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

1. **Ask the user** for the feature directory path (e.g., `specs/my-feature`). Do not proceed until provided.

2. Create the directory and write `.specify/feature.json`:
   ```json
   { "feature_directory": "<feature_directory>" }
   ```

3. Create a specification from the user input and store it in `<feature_directory>/spec.md`.
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
