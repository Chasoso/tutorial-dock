# Codex execution rules

These rules apply to work in this repository. Detailed policy is in:

- [SDD workflow](docs/development/workflow.md)
- [Git workflow and quality gates](docs/development/git-workflow.md)
- [Specification policy](docs/development/specification-policy.md)

## Required before work

### Specification and planning phase

- A human work instruction plus the current `main` requirements/specification is sufficient to start Specify, Plan, and Tasks. A GitHub Issue is not required.
- Read the relevant requirements, existing specs/design, Git status/history, and verification evidence. Preserve existing requirement, feature-spec, and task IDs.
- Treat merged specifications on `main` as effective. Generated or PR-only specifications are proposals.
- Before editing, follow the Git preflight in `docs/development/git-workflow.md` and protect existing changes, branches, and worktrees.

### Implementation phase

- Start only from a GitHub Issue explicitly named by a human, in the human-specified execution order.
- Before implementation, read that Issue, its approved/current specification and Plan, dependencies, Git status/history, and existing verification evidence.
- Issue registration approval is not implementation approval. Do not begin an Issue merely because it was created or registered.

## Decision levels

- Level 1: local, reversible decisions inside approved design; Codex may continue.
- Level 2: stack, runtime dependency, shared interface, IPC, security-boundary, or permission changes; require human approval first.
- Level 3: unverified feasibility or environment behavior; create a Technical Spike and stop dependent implementation until its direction is approved.
- Use `CONTINUE`, `PARTIAL_CONTINUE`, or `HUMAN_DECISION_REQUIRED` as defined in the workflow document. Report facts, options, impact, and resume conditions when stopping.

## Implementation and review

- Codex may generate Work Package/Issue candidates from approved specifications, Plans, and Tasks.
- Registering GitHub Issues requires human approval of the Work Packages; bulk registration is allowed when that approval covers the set. Registration never authorizes implementation.
- Group implementation and its corresponding tests in the same Work Package, Issue, and PR by default.
- Run relevant checks and record `PASS`, `FAIL`, `NOT_RUN`, or `MANUAL_PENDING` evidence.
- An independent review is required before a PR is considered complete or mergeable. Use a read-only Codex Subagent in a context separate from the Main Agent. Do not treat self-review as an independent PASS.
- Only `PASS` completes the independent review. For `CHANGES_REQUIRED`, the Main Agent fixes, reruns checks, and requests another review, for at most three loops.
- `HUMAN_DECISION_REQUIRED`, `NOT_COMPLETED`, or an unavailable independent reviewer stops the related work. Do not replace it with a self-review PASS.
- A Draft PR may be created or updated to preserve/share work while review is incomplete, but Draft status is not review completion or mergeability. Any exception to merging without a PASS is a human decision and must record its reason and substitute verification in the PR.

## Safety and GitHub boundaries

- Do not change approved behavior without human approval.
- Do not register a GitHub Issue without human approval of its Work Package.
- Do not implement an Issue unless a human specified that Issue and its execution order.
- Do not use Spec Kit Implement or automatic task-to-Issue creation as standard workflow.
- Do not push directly to `main` or merge PRs. Human approval is required for merge.
- Include specification path, IDs, scope, acceptance evidence, independent review result, real-device state, and unresolved items in the PR.
- Do not use `git reset --hard`, unapproved force-push, unconditional stash/rebase, `--no-verify`, or a competing worktree/branch without checking ownership and impact.
- Run available quality gates before push and confirm the latest pushed SHA and PR CI state after push. A missing check is `NOT_CONFIGURED`, not `PASS`.
- Do not silently retry authentication, permission, secret-scan, destructive, or specification-conflict failures. Follow the bounded retry and stop/report rules in the Git workflow.
- Track processes started by Codex and stop only those processes during cleanup; do not terminate another work's process.
