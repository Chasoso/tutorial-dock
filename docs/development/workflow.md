# Tutorial Dock SDD Development Workflow

## Purpose and status

This document defines the proposed standard development flow for Tutorial Dock. It is a repository development rule introduced by this branch; feature specifications and implementation decisions still require the approvals described below.

Git safety, quality gates, push/CI checks, bounded retries, and process cleanup are defined in [git-workflow.md](git-workflow.md) and apply to every phase below.

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

### Specification and planning phase — Issue not required

1. Start from a human work instruction and the current requirements/specification. A GitHub Issue is not required for this phase.
2. Read `AGENTS.md`, `docs/requirements.md`, relevant existing specs/design, recent Git history, and verification evidence. Preserve existing IDs.
3. Confirm the feature directory and use the Spec Kit layout `specs/<feature-slug>/spec.md`, `plan.md`, and `tasks.md`; do not duplicate a feature spec under `docs/specs/`.
4. Run Lean Specify to create or update expected behavior and acceptance criteria. Review the result; generation is not approval.
5. Run Lean Plan to describe technical responsibilities, dependencies, tests, and unresolved decisions. Stop at `HUMAN_DECISION_REQUIRED` for Level 2 or Level 3 decisions.
6. Run Lean Tasks to produce dependency-ordered tasks. Check that each task is testable and that out-of-scope work is absent.
7. Group tasks into Work Packages and generate Issue candidates. Codex may prepare candidates from approved/current artifacts, but this does not register Issues or authorize implementation.

### Issue registration phase — human Work Package approval required

8. Check duplicate Issues, dependencies, specification path, requirement IDs, feature-spec IDs, task IDs, Plan reference, specification commit SHA, scope, acceptance criteria, and verification method.
9. A human approves which Work Packages to register. After that approval, the Issues may be registered individually or in bulk. Registration approval is not implementation approval.

### Implementation and review phase — human Issue and order required

10. Start only when a human specifies the target GitHub Issue and execution order. Re-read that Issue, approved/current specification and Plan, dependencies, Git state, and verification evidence.
11. Implement only the specified Issue using the existing Issue-to-PR workflow. Do not run Spec Kit Implement as a substitute. Do not introduce unapproved specification changes or Level 2/3 decisions.
12. Run relevant tests and record each acceptance-condition result as `PASS`, `FAIL`, `NOT_RUN`, or `MANUAL_PENDING`.
13. Request an independent review from a separate Codex context. The reviewer is read-only by default and returns `PASS`, `CHANGES_REQUIRED`, `HUMAN_DECISION_REQUIRED`, or `NOT_COMPLETED`.
14. For `CHANGES_REQUIRED`, the Main Agent fixes, reruns checks, and requests another review, at most three loops. `HUMAN_DECISION_REQUIRED`, `NOT_COMPLETED`, or unavailable review stops the related work.
15. A Draft PR may be opened or updated to preserve/share incomplete work. It is not complete or mergeable until independent review is `PASS`, required validation has passed, and the latest PR HEAD status is known. Any human-approved exception must record its reason and substitute verification in the PR. A human decides whether to merge.

## Human and Codex responsibilities

Humans approve product behavior, Level 2/3 technical direction, major Issue regrouping, and PR merges. The Main Agent may perform Level 1 decisions within approved boundaries, implement the assigned Work Package, test, fix, and prepare a PR. A Review Subagent independently checks conformance and quality; it does not implement fixes. Main Agent self-review is not a substitute for an independent review `PASS`.

## Technical Spikes

A Spike is required when feasibility or environment-dependent behavior prevents a reliable Plan. A Spike records its hypothesis, success/failure criteria, method, environment, result, unresolved questions, and candidate options. A successful Spike validates the hypothesis only; it does not prove that the complete MVP is implemented or accepted.

Windows AppBar, Electron-to-Win32 integration, work-area reservation/recovery, and important display-disconnect behavior are Level 3 examples. Do not silently convert a Spike result into a product requirement.

## Stop, resume, and merge conditions

- `CONTINUE`: work is within approved scope and no blocking decision is pending.
- `PARTIAL_CONTINUE`: pause dependent work, but continue independent approved checks.
- `HUMAN_DECISION_REQUIRED`: stop affected implementation when requirements conflict, a Level 2/3 decision is needed, a required real-device check cannot be performed, or a serious security concern is found.

When stopping, report facts, options, impact, and the condition for resuming. On resume, re-read the Issue, current `main` specifications, Plan, Git state, and verification results rather than relying only on chat history.

Never push directly to `main` and never merge a PR without human approval. Draft creation and review completion are separate states; a Draft PR may contain `NOT_RUN`, `MANUAL_PENDING`, `NOT_CONFIGURED`, or non-`PASS` review status only when that state is explicitly recorded. See [git-workflow.md](git-workflow.md) for preflight, self-review, push, CI, retry, stop, and cleanup rules.
