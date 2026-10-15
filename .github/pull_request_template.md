## PR type

Select one primary type. If this PR combines types, state the combination and why.

- [ ] Implementation
- [ ] Specification
- [ ] Technical Spike
- [ ] Documentation

## Related Issue

- Issue: `#123` or `N/A — no Issue was required for this PR type; explain here`
- Use `Closes #...` only when a real GitHub Issue exists.
- Work Package:

## Specification traceability

- Specification path: `specs/<feature-slug>/spec.md` or `N/A — reason`
- Plan path: `specs/<feature-slug>/plan.md` or `N/A — reason`
- Requirements: `R-__` or `N/A — reason`
- Feature specification IDs: `__-___` or `N/A — reason`
- Task IDs: `T___` or `N/A — reason`
- Specification commit SHA used to start implementation: `________` or `N/A — reason`

## Change scope

### Included

-

### Excluded

-

## Acceptance conditions and evidence

For Implementation PRs, list each acceptance condition and its evidence. For Specification, Technical Spike, or Documentation PRs, use `N/A — reason` where an implementation acceptance condition does not apply.

| Acceptance condition | Verification method | Result | Evidence/link |
|---|---|---|---|
| | | `PASS / FAIL / NOT_RUN / MANUAL_PENDING` | |

## Tests and checks

- Commands/checks or `N/A — reason`:
- Results or `N/A — reason`:
- Known failures or omissions:

## Independent review

- Reviewer context/subagent:
- Verdict: `PASS / CHANGES_REQUIRED / HUMAN_DECISION_REQUIRED / NOT_COMPLETED / NOT_RUN — reason`
- Review evidence/link:
- Review/fix loop count: `0 / 1 / 2 / 3 / N/A — reason`
- A PR is not complete or mergeable unless the required independent review is `PASS`. Draft creation/update is allowed while review is incomplete. Any human-approved exception must record its reason and substitute verification here.

## Technical Spike details

Complete for Technical Spike PRs; otherwise write `N/A — not a Technical Spike`.

- Hypothesis:
- Method and environment:
- Result: `PASS / FAIL / NOT_COMPLETED / N/A — reason`
- Unresolved items:

## Real-environment verification

- Windows/device/manual checks: `PASS / FAIL / NOT_RUN / MANUAL_PENDING / N/A — reason`
- Details:

## Unresolved items and decisions

-

## Final checklist

- [ ] Implementation and corresponding tests are in this PR, or `N/A — reason` is recorded for a non-Implementation PR.
- [ ] No unapproved specification or Level 2/3 technical decision was introduced.
- [ ] Acceptance evidence is complete and uses the required result labels.
- [ ] Independent review was performed in a separate Codex context, or its absence is explicitly recorded.
- [ ] This PR is ready for human review; merge is a human action.
