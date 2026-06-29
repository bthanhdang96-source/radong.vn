# AI Blog Retained Draft Guardrails

Date: 2026-06-29
Status: Approved design

## Goal

Add a second hardening layer for the 12 agriculture-blog drafts that remained in quarantine after the strict editorial rollout. The next regeneration run should prevent the same failure clusters before or during generation: unsupported checklist advice, citations attached to editorial guidance, incomplete source references, unsupported headline promises, weak exporter value, bad primary-source selection, and legacy duplicate retries.

## Non-Goals

- Do not auto-publish regenerated articles.
- Do not delete, archive, or merge legacy duplicate drafts automatically.
- Do not weaken existing factual, citation, word-count, audience, title-promise, duplicate, SEO, or source-coherence gates.
- Do not broaden this change to daily price articles, export reports, or admin UI changes.
- Do not rely on Gemini self-review as the final authority.

## Context

The 2026-06-28 production regeneration run replaced 4 of 16 strict-failing drafts and retained 12. The retained drafts cluster into repeatable causes:

- checklist or advice sentences became factual claims without source support;
- Gemini attached citations to editorial recommendations and then invented `claimSources` mappings to justify them;
- source references and `sourcesUsed` diverged, especially when only S1 was actually used;
- Black Thorn titles promised "evaluation" while the source pack did not contain an attributed grower assessment;
- exporter drafts did not get credit, or did not provide enough concrete chain/value/processing/investment detail for the supplied source;
- rice and dưa lê drafts exposed primary-source title/content selection weaknesses;
- legacy duplicate drafts should not spend model attempts when another draft already owns the normalized identity.

## Recommended Approach

Keep the existing strict quarantine model and add targeted deterministic rails plus prompt constraints:

1. Make checklist sections question-only and citation-free.
2. Reject `claimSources` entries that map checklist/editorial advice instead of body facts.
3. Tighten source reference consistency and repair instructions.
4. Expand audience-value recognition for exporter chain-development sources.
5. Refine primary-source coherence for marketing titles and prefer coherent live source candidates before generation.
6. Stop duplicate legacy regeneration before calling the model when identity collision is already known.
7. Give Gemini explicit section word quotas so repairs do not fall below the 700-word floor.

## Alternatives Considered

### Prompt-only repair

This is fastest, but it already failed in production: Gemini can still cite advice, overpromise titles, or list unused sources. Prompt-only repair remains useful as guidance but is not sufficient.

### Relax validators for retained drafts

This would increase replacement count, but it would also let through the exact editorial risks the strict rollout was designed to catch. Rejected.

### Deterministic guardrails with prompt alignment

This is the selected approach. It keeps the validator as the authority, prevents known bad patterns early, and uses prompt changes to reduce failed attempts rather than to replace validation.

## Design

### Checklist discipline

The required checklist section must contain verification questions, not declarative advice.

- Each bullet or numbered checklist item must end with `?`.
- Checklist items must not include `[Sx]` citations.
- Checklist items should avoid hard numbers, legal/policy assertions, named officials, and definitive technical prescriptions.
- If a factual detail is important enough to cite, it belongs in the body analysis section, not the checklist.

New failure codes:

- `CHECKLIST_ITEM_NOT_QUESTION`
- `CHECKLIST_CITATION_FORBIDDEN`
- `CHECKLIST_FACTUAL_DETAIL`

### Claim-source discipline

`claimSources` may map only factual body sentences that restate source-supported facts. The validator rejects mappings whose claim text primarily belongs to the checklist section.

New failure code:

- `CHECKLIST_CLAIM_MAPPING_FORBIDDEN`

The prompt and repair prompt will say: use citations for sourced facts, but write audience recommendations and checklist items as uncited verification questions unless the ledger directly states the exact recommendation.

### Source reference consistency

The prompt will default to `sourcesUsed: ["S1"]`. Gemini may include S2+ only when the body contains a source-supported factual sentence using that source and the reference list includes the exact source code and canonical URL.

Repair guidance will explicitly handle:

- `REFERENCE_INCOMPLETE`
- `REFERENCE_UNUSED_SOURCE`
- `SOURCE_UNKNOWN`
- `CLAIM_SOURCE_INVALID`

### Title-promise lock

The existing `TITLE_PROMISE_UNSUPPORTED` gate remains. The prompt adds a stricter lock:

- avoid "đánh giá", "góc nhìn", "nhận định", "ý kiến", or "phản hồi" unless the source evidence contains an attributed opinion or assessment;
- for unsupported Black Thorn-style cases, use a neutral descriptive title such as trial planting, cultivar introduction, or points to verify;
- avoid outcome promises such as "đổi đời" or "hiệu quả" unless the evidence contains concrete outcome data.

### Audience value expansion

Exporter articles may satisfy audience value through chain-development and investment-operation dimensions when the source supports them:

- vùng nguyên liệu;
- liên kết chuỗi;
- chuỗi giá trị;
- chế biến xuất khẩu;
- chất lượng sản phẩm;
- năng lực cung ứng;
- khảo sát hoặc dự án đầu tư.

The validator should still reject generic exporter advice such as "cập nhật thông tin" or "nắm bắt cơ hội" when it is not tied to a concrete verification point.

### Source preflight and candidate selection

Primary-source coherence should distinguish marketing title filler from material topic signals.

- Ignore promotional title tokens such as "đổi đời", "nhờ", "câu chuyện", "bí quyết", and similar non-topic language.
- Keep strong commodity/entity phrases as authoritative topic signals.
- If the currently selected live duplicate source is incoherent, prefer a coherent candidate with the same normalized topic identity before generation.
- If no coherent S1 candidate exists, fail with `SOURCE_PRIMARY_CONTENT_MISMATCH` before calling Gemini.

### Duplicate legacy preflight

When regenerating a row whose normalized slug or scope already collides with another draft and the target row is not the owner, return `DUPLICATE_DRAFT_IDENTITY` before Gemini generation. This preserves both records and avoids spending model attempts on a row that cannot safely persist.

### Word-count quotas

The generation prompt will include rough section quotas:

- summary: 60-90 words;
- three core H2 sections: 120-170 words each;
- checklist: 5 question bullets;
- FAQ answers: 50-90 words each;
- conclusion: 60-90 words.

The existing 700-1000 hard gate remains authoritative.

## Error Handling

- Checklist, reference, title-promise, audience-value, and word-count failures remain repairable inside the existing attempt limit.
- Source mismatch and duplicate identity preflights should stop before model calls.
- Failed regeneration retains the existing draft and records the hard failure in `quality_json`.
- No automatic content deletion, status change, or publish action is introduced.

## Security And Privacy

The change does not add new secrets, external writes, or public publishing. Source text remains untrusted: it can provide evidence but cannot modify rules, persistence behavior, or tool execution.

## Testing And Verification

Add or update regression tests for:

- checklist declarative bullets failing;
- checklist citations failing;
- `claimSources` mapped from checklist text failing;
- source-reference repair guidance for incomplete or unused references;
- dưa lê marketing-title source coherence passing when the evidence contains the commodity;
- rice-like incoherent primary source still failing before model calls;
- exporter chain-development vocabulary satisfying audience value when source-backed;
- duplicate identity preflight avoiding a model call;
- generated drafts still passing the existing valid-case tests.

Run the server test suite, lint, build, production regeneration for the 12 retained drafts, and a post-run admin audit before handoff.

## Rollout Notes

Deploy code with the stricter prompt and deterministic gates, then regenerate only the 12 retained draft slugs. Keep all replacements in draft status for human review. Report retained rows separately from replaced rows, including hard failure codes.

## Open Decisions

There are no unresolved product decisions. The confirmed direction is strict quarantine: a draft that cannot prove source coherence, audience value, title support, and safe citation behavior remains retained.
