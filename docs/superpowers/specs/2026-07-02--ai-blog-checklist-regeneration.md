# AI Blog Checklist Regeneration

Date: 2026-07-02
Status: Approved design via user request

## Goal

Regenerate the affected AI agriculture-blog drafts after closing the remaining checklist defects found in the 2026-07-02 production audit, and verify whether the daily Gemini article jobs are still producing normally.

## Non-Goals

- Do not publish drafts.
- Do not delete or directly rewrite database rows outside the existing admin regeneration flow.
- Do not weaken source/citation validation to make regeneration pass.
- Do not change Supabase schema.

## Context

The production audit found that stored `quality.valid` was green for all current `agri_blog` drafts, but rendered HTML still exposed checklist defects in 11 drafts:

- checklist sections with 4, 6, 7, or 8 items;
- checklist items with `[Sx]` citations;
- numbered instruction paragraphs instead of bullet questions;
- advisory/logistics details that should be uncited verification questions, not sourced claims.

The root cause is narrow checklist validation: the generator prompt already asks for a checklist, but the validator does not explicitly require exactly five bullet-only question items in every checklist-like H2.

## Recommended Approach

Use a narrow code hardening pass before regenerating:

1. Make checklist validation inspect the checklist section body, not just extracted items.
2. Require exactly five bullet items using `-`, `*`, or `+`.
3. Reject numbered list items and prose/instruction paragraphs inside the checklist section.
4. Keep existing bans on checklist citations and hard factual/technical details.
5. Tighten prompt and repair guidance so Gemini rewrites checklist sections as five short uncited questions.
6. Deploy and regenerate only the 11 affected slugs; leave all output in `draft`.
7. Check `ai_article_generation_runs` and recent generated articles to confirm scheduled Gemini daily/article jobs are healthy.

## Alternatives Considered

- Regenerate immediately without code changes: faster, but likely repeats the same checklist failure patterns.
- Manually edit drafts: would fix visible content but leave the generation bug alive.
- Archive all affected drafts: too aggressive because the source packs are mostly usable.

## Design

`server/services/aiArticles/service.ts`:

- Add a helper that parses checklist section lines into bullet, numbered, and prose buckets.
- Emit `CHECKLIST_COUNT` when the section does not contain exactly five bullet items.
- Emit `CHECKLIST_NUMBERED_FORBIDDEN` when numbered checklist lines appear.
- Emit `CHECKLIST_PROSE_FORBIDDEN` when non-list prose appears inside the checklist section.
- Continue validating each bullet item for:
  - no `[Sx]`;
  - ends with `?`;
  - no hard factual / legal / technical detail.

Prompt/repair updates:

- Explicitly require `## Việc cần kiểm tra...` or `## Checklist...` to be followed immediately by exactly five `-` bullets.
- Ban intro paragraph, numbered list, citation, and source-specific numbers in checklist.

Tests:

- Add regressions for checklist count, numbered/prose checklist bodies, and checklist headings without the literal word "Checklist".
- Keep the existing operational-question allowance for generic verification questions.

## Rollout And Verification

1. Run `npm --prefix server test`, `npm run lint`, and `npm run build`.
2. Commit/push and wait for backend redeploy.
3. Regenerate the 11 affected slugs via admin API.
4. Audit rendered HTML/admin detail for:
   - exactly five checklist bullets;
   - no checklist citations;
   - every checklist item is a question;
   - no auto-publish.
5. Query recent `ai_article_generation_runs` and generated article rows to report whether Gemini daily jobs are succeeding or failing.
