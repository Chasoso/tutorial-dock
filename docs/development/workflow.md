# Tutorial Dock SDD Development Workflow

## Purpose and status

This document defines the proposed standard development flow for Tutorial Dock. It is a repository development rule introduced by this branch; feature specifications and implementation decisions still require the approvals described below.

The standard flow is:

```text
Requirements → Specify → Plan → Tasks → Work Packages → GitHub Issues → Codex Implementation → Independent Review → PR → Human Review
```

Spec Kit Lean is used for Specify, Plan, and Tasks. Spec Kit Implement and automatic task-to-Issue creation through the GitHub extension are not standard operations at this time.

## Artifacts and authorities

| Stage | Input | Output | Authority |
|---|---|---|---|
| Requirements | product decisions and existing requirements | `docs/requirements.md` | product-wide requirements |
| Specify | scoped requirements, existing spec, user clarifications | `specs/<feature-slug>/spec.md` | expected behavior and acceptance criteria for the feature |
| Plan | approved/current spec, `docs/design.md`, repository context | `specs/<feature-slug>/plan.md` | technical approach and unresolved design decisions |
| Tasks | spec and plan | `specs/<feature-slug>/tasks.md` | generated implementation plan at task-generation time |
| Work Packages | tasks, dependencies, review boundaries | issue candidate grouping | proposed work breakdown |
| GitHub Issues | approved work packages and traceability data | implementation progress records | implementation progress |
| Codex Implementation | assigned Issue, current spec/plan, repository state | code, tests, verification evidence | PR branch changes |
| Independent Review | approved/current spec, Issue, diff, test evidence | review verdict | separate Codex context |
| PR | implementation and review evidence | merge proposal | human review and merge decision |

`main` is the source of currently approved behavior. A generated artifact is a proposal until its PR is merged. After an Issue is created, do not use `tasks.md` as a second progress tracker; update the Issue and PR instead.

## Standard operating sequence

1. Read `AGENTS.md`, the target Issue, `docs/requirements.md`, the feature `spec.md`, `plan.md`, `tasks.md`, recent Git history, and relevant test evidence.
2. Confirm the target feature directory and preserve existing IDs. Use the Spec Kit standard layout `specs/<feature-slug>/spec.md`, `plan.md`, and `tasks.md`; do not duplicate the same feature spec under `docs/specs/`.
3. Run Lean Specify to create or update the expected behavior and acceptance criteria. Review the result; generation is not approval.
4. Run Lean Plan to describe technical responsibilities, dependencies, tests, and unresolved decisions. Stop at `HUMAN_DECISION_REQUIRED` for Level 2 or Level 3 decisions.
5. Run Lean Tasks to produce dependency-ordered tasks. Check that each task is testable and that out-of-scope work is absent.
6. Group tasks into Work Packages. The default is one independently implementable and reviewable Work Package per Issue and PR. Keep implementation and its corresponding tests together. A multi-Issue PR is allowed only when the dependency and review boundary are explicit.
7. Before creating an Issue, check duplicate Issues, dependencies, the specification path, requirement IDs, feature-spec IDs, task IDs, the Plan reference, the specification commit SHA, scope, acceptance criteria, and verification method.
8. Implement only the assigned Issue using the existing Issue-to-PR workflow. Do not run Spec Kit Implement as a substitute for that workflow.
9. Run the relevant tests and record each acceptance-condition result as `PASS`, `FAIL`, `NOT_RUN`, or `MANUAL_PENDING`.
10. Request an independent review from a separate Codex context. The reviewer is read-only by default and returns `PASS`, `CHANGES_REQUIRED`, `HUMAN_DECISION_REQUIRED`, or `NOT_COMPLETED`.
11. If changes are required, the Main Agent updates the branch, reruns the necessary checks, and requests another independent review. The initial operating limit is three review/fix loops.
12. Open a PR with the Issue, specification, acceptance evidence, review result, manual verification state, and unresolved items. A human decides whether to merge.

## Human and Codex responsibilities

Humans approve product behavior, Level 2/3 technical direction, major Issue regrouping, and PR merges. The Main Agent may perform Level 1 decisions within approved boundaries, implement the assigned Work Package, test, fix, and prepare a PR. A Review Subagent independently checks conformance and quality; it does not implement fixes.

## Technical Spikes

A Spike is required when feasibility or environment-dependent behavior prevents a reliable Plan. A Spike records its hypothesis, success/failure criteria, method, environment, result, unresolved questions, and candidate options. A successful Spike validates the hypothesis only; it does not prove that the complete MVP is implemented or accepted.

Windows AppBar, Electron-to-Win32 integration, work-area reservation/recovery, and important display-disconnect behavior are Level 3 examples. Do not silently convert a Spike result into a product requirement.

## Stop, resume, and merge conditions

- `CONTINUE`: work is within approved scope and no blocking decision is pending.
- `PARTIAL_CONTINUE`: pause dependent work, but continue independent approved checks.
- `HUMAN_DECISION_REQUIRED`: stop affected implementation when requirements conflict, a Level 2/3 decision is needed, a required real-device check cannot be performed, or a serious security concern is found.

When stopping, report facts, options, impact, and the condition for resuming. On resume, re-read the Issue, current `main` specifications, Plan, Git state, and verification results rather than relying only on chat history.

Never push directly to `main` and never merge a PR without human approval. A PR may be opened as Draft while review evidence is incomplete; it must clearly label `NOT_RUN` and `MANUAL_PENDING` items.
