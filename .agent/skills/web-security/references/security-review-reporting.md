# Security Review Reporting

Use this file when the task is an audit or code review with a security focus.

## Finding Format

For each `FAIL`, report:

- `Finding #`
- `Severity`: `CRITICAL`, `HIGH`, `MEDIUM`, or `LOW`
- `Category`
- `Location`: file path and line
- `CWE`
- `What's wrong`
- `Why it matters`
- `Vulnerable code`
- `Fix`
- `Effort`

Use `PARTIAL` when evidence is incomplete or a control exists but coverage is uncertain.

## Final Report Structure

1. `Security posture rating`
   - `CRITICAL`: active exposure or auth bypass
   - `NEEDS WORK`: significant exploitable gaps
   - `ACCEPTABLE`: minor issues, no immediate exposure
   - `STRONG`: well-secured with only informational findings
2. `Critical and high findings`
3. `Quick wins`
4. `Prioritized remediation plan`
5. `What's already done right`
6. `Checklist summary`

## Prioritization Rules

- Order by severity first.
- Within the same severity, put lower-effort fixes earlier.
- Call out unusual attacker assumptions when they affect severity.
