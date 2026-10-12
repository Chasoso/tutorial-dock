# Codex execution rules

These rules apply to work in this repository. Detailed policy is in:

- [SDD workflow](docs/development/workflow.md)
- [Specification policy](docs/development/specification-policy.md)

## Required before work

- Read the assigned GitHub Issue, current `main` requirements/specification, relevant Plan and Tasks, Git status/history, and existing verification evidence.
- Work only on the assigned Work Package. Preserve existing requirement, feature-spec, and task IDs.
- Treat merged specifications on `main` as effective. Generated or PR-only specifications are proposals.

## Decision levels

- Level 1: local, reversible decisions inside approved design; Codex may continue.
- Level 2: stack, runtime dependency, shared interface, IPC, security-boundary, or permission changes; require human approval first.
- Level 3: unverified feasibility or environment behavior; create a Technical Spike and stop dependent implementation until its direction is approved.
- Use `CONTINUE`, `PARTIAL_CONTINUE`, or `HUMAN_DECISION_REQUIRED` as defined in the workflow document. Report facts, options, impact, and resume conditions when stopping.

## Implementation and review

- Group implementation and its corresponding tests in the same Work Package, Issue, and PR by default.
- Run relevant checks and record `PASS`, `FAIL`, `NOT_RUN`, or `MANUAL_PENDING` evidence.
- Request an independent, read-only Codex Subagent review from a separate context. Do not treat Main Agent self-review as an independent PASS.
- Apply review fixes in the Main Agent, rerun checks, and repeat review/fix for at most three loops. Use `CHANGES_REQUIRED`, `HUMAN_DECISION_REQUIRED`, or `NOT_COMPLETED` when appropriate.

## Safety and GitHub boundaries

- Do not change approved behavior without human approval.
- Do not create or implement an unassigned Issue.
- Do not use Spec Kit Implement or automatic task-to-Issue creation as standard workflow.
- Do not push directly to `main` or merge PRs. Human approval is required for merge.
- Include specification path, IDs, scope, acceptance evidence, independent review result, real-device state, and unresolved items in the PR.
