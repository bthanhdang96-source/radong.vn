---
name: brainstorming
description: Use before creative or behavioral work in this repository: new features, UI/components, architecture changes, API/server behavior, data workflows, refactors that change behavior, or any ambiguous implementation request. Explore context, clarify intent, compare approaches, and produce an approved design spec before writing code.
---

# Brainstorming

Project-local adaptation of the `obra/superpowers` brainstorming workflow:
https://github.com/obra/superpowers/tree/main/skills/brainstorming

Use this skill to turn a rough request into an approved design before implementation.
Do not write code, scaffold files, edit behavior, or invoke implementation-oriented skills until
the design has been reviewed and approved by the user.

## Required Flow

1. Explore project context.
   - Read relevant files, docs, issue history, and recent commits.
   - Follow this repo's `bd` workflow for task tracking.
   - Identify whether the request is small enough for one spec. If it spans independent systems,
     decompose it first and brainstorm the first sub-project only.
2. Ask clarifying questions.
   - Ask one question at a time.
   - Prefer multiple-choice questions when that reduces ambiguity.
   - Focus on purpose, constraints, success criteria, data ownership, user experience, and risk.
3. Compare approaches.
   - Present 2-3 viable approaches with trade-offs.
   - Lead with the recommended approach and explain why it fits this codebase.
   - Reject unnecessary scope explicitly.
4. Present the design.
   - Present sections sized to complexity.
   - Cover architecture, changed components, data flow, error handling, security implications,
     test strategy, and rollout concerns when relevant.
   - Ask for approval before moving on.
5. Write the spec.
   - Save the approved design to `docs/superpowers/specs/YYYY-MM-DD--<short-topic>.md`
     unless the user specifies another location.
   - Commit the spec before implementation when the session workflow allows commits.
6. Self-review the spec.
   - Remove placeholder markers, empty sections, and incomplete notes.
   - Fix contradictions between requirements, architecture, and tests.
   - Make ambiguous choices explicit.
   - Check that the scope is suitable for one implementation plan.
7. User review gate.
   - Ask the user to review the written spec before implementation.
   - If they request changes, update the spec and repeat self-review.
8. Transition to implementation planning.
   - After approval, create a detailed implementation plan.
   - Only then start editing code.

## Existing Codebase Rules

- Explore before proposing. Use current project structure and conventions instead of inventing a
  parallel architecture.
- Improve nearby design problems only when they directly affect the requested work.
- Avoid broad refactors that do not serve the approved design.
- Keep units small, named by purpose, and testable through clear interfaces.
- For frontend work, align with the existing Vite + React + TypeScript stack and project CSS
  patterns unless the design explicitly approves a change.
- For security-sensitive work, combine this skill with the `web-security` skill.

## Visual Questions

If the request involves UI layout, dashboards, diagrams, or visual comparisons, offer a visual
companion before detailed questions:

> Some of what we're working on might be easier to explain if I can show it visually. I can create
> mockups, diagrams, comparisons, or other visuals as we go. Want to use that for this brainstorm?

Use visuals only when seeing the option is materially clearer than reading it. Use text for
requirements, trade-offs, scope, and conceptual choices.

## Spec Template

Use this structure unless a smaller spec is sufficient:

```markdown
# <Feature / Change Name>

Date: YYYY-MM-DD
Status: Approved design

## Goal

## Non-Goals

## Context

## Recommended Approach

## Alternatives Considered

## Design

## Data Flow

## Error Handling

## Security And Privacy

## Testing And Verification

## Rollout / Migration Notes

## Open Decisions
```

Do not leave empty sections. Delete sections that do not apply or state the concrete decision.
