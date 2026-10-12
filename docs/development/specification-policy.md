# Specification Policy

## Canonical documents

- `docs/requirements.md` is the product-wide requirements source of truth. Existing requirement IDs such as `R-01` must not be renamed or reassigned without human approval.
- `specs/<feature-slug>/spec.md` is the source of truth for a feature's expected behavior and acceptance criteria. Do not duplicate the same feature specification under `docs/specs/` or another directory.
- `specs/<feature-slug>/plan.md` is the source of truth for the proposed technical approach, responsibilities, dependencies, and unresolved technical decisions.
- `specs/<feature-slug>/tasks.md` is the task plan produced from the spec and plan. It is a planning snapshot, not the implementation-progress source of truth after Issue creation.
- GitHub Issues are the source of truth for implementation progress and work state. PRs are the source of truth for the implementation diff, verification evidence, and review outcome.
- The current effective specification is the version merged into `main`. A generated or PR-only version is proposed, not approved.

## Spec Kit Lean use

Use the official Spec Kit project layout and current Codex skills for:

- Specify: `$speckit-specify`
- Plan: `$speckit-plan`
- Tasks: `$speckit-tasks`

Review each output before proceeding. Do not treat generation as approval. Spec Kit Implement is not part of the standard Tutorial Dock flow. The GitHub extension's task-to-Issue command is not part of the standard flow; if it is examined in a Spike, do not create Issues without explicit authorization and review.

## ID rules

Keep the namespaces distinct:

- Requirement ID: `R-01`, owned by `docs/requirements.md`.
- Feature specification ID: `GB-001`, unique within the feature specification. The feature prefix should be stable and descriptive; do not silently rename existing IDs.
- Task ID: `T001`, identified together with its feature specification directory, for example `specs/guide-bar-basic-display/T001`.

The feature spec should map its feature IDs to source requirement IDs. Tasks should reference feature-spec IDs where practical. An Issue must carry the requirement IDs, feature-spec IDs, original task IDs, specification path, Plan path, and the commit SHA of the specification used to start implementation. Do not assume that Spec Kit automatically preserves requirement IDs.

## Change and approval boundaries

Generated files may be edited or regenerated while a proposal is under review, but they are not approved until the containing PR is merged. A behavior change to an approved spec requires human approval through a PR. Important changes must show the diff and impact scope.

While a change is proposed, the `main` version remains effective. If implementation and specification disagree, do not silently alter the spec or make code match an unapproved interpretation; stop and report the discrepancy. Determine whether the correct action is a spec change, an implementation correction, or a human decision.

## Traceability and evidence

Each Issue should connect:

```text
R-* → feature spec ID → plan.md → tasks.md task ID → Work Package/Issue → PR → verification evidence
```

The connection may be represented in Markdown fields, not necessarily by automation. Verify it manually before Issue creation. Keep implementation and corresponding tests in the same Work Package/PR unless a human-approved dependency requires otherwise.

Every acceptance condition in a PR must have one of these results:

- `PASS`: evidence was run and passed.
- `FAIL`: evidence was run and failed.
- `NOT_RUN`: the check was not executed.
- `MANUAL_PENDING`: a human or real-device check remains.

CI success does not replace required Windows or other real-environment checks. Do not report an unperformed independent review as `PASS`.
