## PR type

Select one primary type. If this PR combines types, explain why.

- [ ] Implementation
- [ ] Specification
- [ ] Technical Spike
- [ ] Documentation

## Related Issue

- Issue: `#123` or `N/A - no Issue was required; explain why`
- Use `Closes #...` only for a completed Issue.
- Work Package:

## Specification traceability

- Specification path: `specs/<feature-slug>/spec.md` or `N/A - reason`
- Plan path: `specs/<feature-slug>/plan.md` or `N/A - reason`
- Requirements: `R-__` or `N/A - reason`
- Feature specification IDs: `__-___` or `N/A - reason`
- Task IDs: `T___` or `N/A - reason`
- Specification commit SHA used to start implementation: `________` or `N/A - reason`

## Change scope

### Included

-

### Excluded

-

## Commands and validation

List exact commands, exit status, concise result, skipped checks and reason, retry count, and artifact links when available. Use `PASS`, `FAIL`, `NOT_RUN`, `MANUAL_PENDING`, or `NOT_CONFIGURED`.

| Command or check | Exit/result | Status | Notes or artifact |
|---|---|---|---|
| | | `PASS / FAIL / NOT_RUN / MANUAL_PENDING / NOT_CONFIGURED` | |

## Acceptance conditions and evidence

For Implementation PRs, list each acceptance condition and its evidence. For Specification, Technical Spike, or Documentation PRs, use `N/A - reason` where implementation acceptance does not apply.

| Acceptance condition | Verification method | Result | Evidence/link |
|---|---|---|---|
| | | `PASS / FAIL / NOT_RUN / MANUAL_PENDING / NOT_CONFIGURED` | |

## CI after push

- Pushed commit SHA: `________`
- PR HEAD SHA checked: `________`
- Required CI checks: `PASS / FAIL / NOT_RUN / NOT_CONFIGURED`
- CI check names and results:
- If CI is incomplete, unavailable, or not configured, explain why:

## Independent review

- Reviewer context/subagent:
- Verdict: `PASS / CHANGES_REQUIRED / HUMAN_DECISION_REQUIRED / NOT_COMPLETED / NOT_RUN - reason`
- Review evidence/link:
- Review/fix loop count: `0 / 1 / 2 / 3`
- A PR is not complete or mergeable unless the required independent review is `PASS`. Draft creation/update is allowed while review is incomplete. Any human-approved exception must record its reason and substitute verification.

## Technical Spike details

Complete for Technical Spike PRs; otherwise write `N/A - not a Technical Spike`.

- Hypothesis:
- Method and environment:
- Result: `PASS / FAIL / NOT_COMPLETED / N/A - reason`
- Unresolved items:

## Real-environment verification

- Windows/device/manual checks: `PASS / FAIL / NOT_RUN / MANUAL_PENDING / NOT_CONFIGURED / N/A - reason`
- Details:

## Unresolved items and decisions

-

## Final checklist

- [ ] Implementation and corresponding tests are in this PR, or `N/A - reason` is recorded for a non-Implementation PR.
- [ ] Required quality gates were run, or each unavailable/unconfigured check is explicitly recorded.
- [ ] No unapproved specification or Level 2/3 technical decision was introduced.
- [ ] Independent review status matches the latest PR HEAD; absence is not reported as `PASS`.
- [ ] PR body matches the actual diff and current CI/review state.
- [ ] This PR is ready for human review; merge is a human action.
