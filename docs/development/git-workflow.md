# Git Workflow and Quality Gates

This document hardens Git and validation operations around the existing SDD flow. It does not introduce a worktree manager, CI workflow, hook, validation script, or new runtime dependency.

## Safety principles

- Use the latest `origin/main` as the normal new-work base. Do not unconditionally pull the local `main`.
- Inspect before editing. Preserve uncommitted changes, existing commits, branches, worktrees, and processes owned by other work.
- Never push directly to `main`, force-push without explicit human authorization, merge a PR, or bypass hooks with `--no-verify`.
- One Work Package, one branch, and one PR is the default. Existing SDD rules govern approved multi-Issue grouping.
- A clean Git state or a successful command is evidence only for what it actually checked; do not infer missing validation.

## New-work preflight

Before editing a new Work Package, run the equivalent read-only checks:

```powershell
git status --short --branch
git worktree list --porcelain
git branch -vv
git fetch origin main
git log --oneline --decorate -5 origin/main
```

Then confirm:

1. The worktree is not dirty, or the existing changes are explicitly understood and protected.
2. The target branch does not already exist, or its owner and intended reuse are known.
3. No other worktree currently uses the target branch or files that this Work Package must change.
4. `origin/main` is the intended base and the repository's current requirements/specifications are understood.
5. Existing Actions, hooks, scripts, and package commands have been discovered. Do not invent a mandatory command that the repository does not define.

For a new branch, create it from the fetched remote base only after the checks pass:

```powershell
git switch -c <branch-name> origin/main
```

If the worktree is dirty, the branch exists ambiguously, or ownership is unclear, stop and report. Do not reset, stash, overwrite, delete, or silently switch worktrees to make the preflight pass.

## Resuming existing work

Before resuming an existing branch:

```powershell
git status --short --branch
git worktree list --porcelain
git log --oneline --decorate -10
git fetch origin main
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
```

Protect all uncommitted and unpushed commits. Do not use unconditional `rebase`, `reset`, `stash`, force-push, or automatic conflict resolution. `origin/main` moving forward does not by itself require a merge or rebase. If synchronization is needed but the safe method or conflict impact is unclear, stop with `HUMAN_DECISION_REQUIRED`.

## Branch and worktree boundaries

- Use `feat/issue-N`, `fix/issue-N`, or `docs/issue-N` for Issue work when appropriate.
- Use a purpose-specific branch such as `docs/git-workflow-hardening` for specification/planning or other Issue-before-registration work.
- Do not change or delete another worktree, branch, process, or uncommitted state.
- Separate worktrees are optional when independent Work Packages run in parallel; forced worktree management is not part of this policy.
- Before cleanup, verify the process or worktree belongs to the current Work Package and is no longer needed.

## Quality gates

For every implementation PR, connect the Issue acceptance conditions to actual checks. Keep implementation and corresponding tests in the same Work Package and PR. Run available repository-defined checks and do not weaken tests, CI, or hooks to obtain a pass.

Use these statuses consistently:

- `PASS`: the check ran and passed.
- `FAIL`: the check ran and failed.
- `NOT_RUN`: the check exists or is expected, but was not run.
- `MANUAL_PENDING`: a human or real-device check remains.
- `NOT_CONFIGURED`: no repository check exists yet for that category.

`NOT_CONFIGURED` is not `PASS`. It must not replace a failed or blocked check that is already required by the repository. When the Electron stack is approved, consider adding ESLint, TypeScript typecheck, unit tests, build, Electron UI/E2E, and secret scanning. Until then, do not make any of those commands mandatory or claim they ran.

For docs-only work, run available documentation and Git checks. If no Markdown or repository quality tool exists, record that fact as `NOT_CONFIGURED`; `git diff --check` remains a useful basic check. Never use `--no-verify` or remove a gate to make validation pass.

## Pre-push self-review

Before pushing:

1. Re-read the human instruction, assigned Issue when applicable, requirements/specification, Plan, Tasks, and out-of-scope boundaries.
2. Review the complete diff against the intended base, including `git diff --check` and changed paths.
3. Search for secrets, debug output, temporary files, unfinished TODOs, generated artifacts that should not be committed, and unintended changes.
4. Confirm the relevant acceptance conditions, tests, quality gates, and manual checks have explicit statuses.
5. Confirm the independent review is for the latest change. If it is not complete, the branch may be saved in a Draft PR, but it is not complete or mergeable.
6. Confirm the PR body and template fields match the actual diff.
7. Fetch `origin/main` again and inspect the base comparison and possible conflicts before push.

Do not push while a known in-scope quality failure remains unless the push is explicitly for preserving valid incomplete work in a Draft PR and the failure is recorded.

## Push and PR checks

Push only the named work branch:

```powershell
git push --set-upstream origin <branch-name>
git rev-parse HEAD
git ls-remote origin refs/heads/<branch-name>
```

After push or PR creation:

- Confirm the remote branch and PR head SHA equal the intended commit.
- Inspect GitHub Actions or other repository-defined CI for that exact PR HEAD.
- Distinguish `PASS`, `FAIL`, `NOT_RUN`, and `NOT_CONFIGURED`; an absent workflow is not a pass.
- If CI fails in the changed scope, fix it and rerun the affected gates before reporting completion.
- If CI is pending, unavailable, or not configured, keep that state explicit. Do not report the PR as complete or mergeable without the required evidence.
- Re-run independent review after code or behavior changes. A stale review does not approve a new HEAD.
- A Draft PR may preserve/share valid work with incomplete checks, but it must not use `Closes #N` for incomplete, failed, or pending Issues.

## Retry and stop policy

Retry counts for commands/CI are separate from the independent-review limit of three review/fix loops.

### Bounded retry

For a transient command or environment failure:

1. Retry the same command once without changes.
2. If it fails again, inspect the log and apply at most one clearly in-scope fix.
3. Re-run the affected command and relevant gate once.
4. If it still fails, stop and report rather than looping.

Do not automatically retry authentication failures, permission failures, secret findings, destructive or irreversible operations, specification contradictions, or unapproved Level 2/3 decisions.

### Stop report

When stopping, report:

- what failed and the exact command/result;
- confirmed facts and current branch/worktree/commit state;
- unresolved items and affected scope;
- independent work that can safely continue;
- the human decision required, if any; and
- the condition for resuming.

Do not mark a failed or unavailable check as `PASS`, and do not treat a self-review as an independent review.

## Process and cleanup

- Before starting a local server or Electron process, identify the expected port and check whether it is already in use.
- Record processes started by the current Work Package.
- Do not terminate another work's process. Stop only processes started by Codex for this Work Package when they are no longer needed.
- Verify that no Codex-started server or test process remains before final reporting.
- If a Windows check may change OS state, describe the impact before running it and restore only state owned by the current Work Package.

## Reference choices

Other personal repositories were consulted for safety patterns such as latest-base fetches, no-hook-bypass rules, focused branches, validation evidence, bounded retries, and fail-closed review/CI reporting. This repository intentionally does not adopt their `develop` base, mandatory worktree manager, review epochs, AWS/MCP constraints, or broad automation. Tutorial Dock keeps the existing four SDD contracts, human approval boundaries, and lightweight Issue-to-PR flow.

