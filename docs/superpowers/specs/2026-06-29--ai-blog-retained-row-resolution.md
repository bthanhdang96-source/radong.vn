# AI Blog Retained Row Resolution

Date: 2026-06-29
Status: Approved design

## Goal

Resolve the seven agriculture-blog drafts that remained in the draft queue after the retained-draft guardrail rollout. Each row should end with an explicit editorial decision: regenerated and valid, archived as unsafe/duplicate, or documented as manual-retain.

## Context

The final 2026-06-29 audit left seven rows:

- vải trader canonical draft: current quality is valid, but the latest regeneration attempt still attached a citation to unsupported trader advice;
- vải trader legacy duplicate: deterministic duplicate identity collision with the canonical vải draft;
- Tuyên Quang farmer and exporter: failed `SOURCE_PRIMARY_CONTENT_MISMATCH`, but the source evidence is actually about Tuyên Quang agricultural production; the false positive comes from title filler such as "bứt phá" and the category phrase "môi trường";
- rice Philippines exporter and legacy trader: failed source mismatch because one source title is about rice import-price enforcement while the stored snippets are about traceability, and the legacy row remains unsafe;
- Mavin exporter: current quality is valid, but new regeneration overran word count and mixed source-supported factual claims with checklist/advice mapping.

## Recommended Approach

Use a mixed editorial cleanup:

1. Archive rows that are structurally unsafe to regenerate:
   - legacy duplicate vải;
   - rice Philippines exporter and legacy trader unless a coherent source pack is available through the existing admin context.
2. Fix deterministic false positives and retry:
   - add Tuyên Quang title filler words to primary-source title stopwords;
   - keep strong entity matching (`tuyen-quang`) as the real topic signal.
3. Tighten prose-generation guidance and retry:
   - narrower word target to prevent Mavin overrun;
   - stronger rule that advisory/trader/exporter interpretation must not be cited unless the exact sentence is source-backed;
   - avoid treating a source-supported body claim as a checklist claim merely because similar words appear in a checklist question.

## Non-Goals

- Do not publish any draft.
- Do not delete database rows.
- Do not bypass source mismatch for rice traceability/price-title rows.
- Do not weaken factual claim validation.
- Do not create a broad manual editor UI.

## Design

### Archive decisions

Use the existing admin PATCH `/api/admin/ai-articles/:slug` endpoint with `{ "status": "archived" }` only for rows that should leave the draft review queue:

- duplicate legacy row with `DUPLICATE_DRAFT_IDENTITY`;
- source mismatch rows whose primary source title/content cannot be made coherent by deterministic stopwords.

Archiving is reversible through the same endpoint and preserves row history.

### Source coherence refinement

Add non-topic title words to the source-title stopword list:

- `but`
- `pha`
- `truong`

This makes titles like "Nông nghiệp và Môi trường Tuyên Quang bứt phá" rely on the strong entity `tuyen-quang` and the actual production evidence, rather than failing because "bứt phá" is absent from snippets.

### Checklist claim mapping refinement

Keep the ban on mapping `claimSources` to checklist-only advice, but do not fail a valid source-backed body claim merely because similar words appear in a checklist question.

Implementation:

- extract checklist items as today;
- remove the checklist section from the body when deciding whether a mapped claim exists elsewhere;
- only emit `CHECKLIST_CLAIM_MAPPING_FORBIDDEN` when the claim matches checklist text and has no matching non-checklist body sentence.

### Prose guidance refinement

Update prompt/repair guidance:

- target 760-860 words, with core H2 sections around 110-140 words;
- for `WORD_COUNT_MAX`, cut examples, FAQ verbosity, conclusion padding, and repeated source detail;
- for `WORD_COUNT_MIN`, expand only source-bounded analysis in core sections;
- advisory sentences should avoid `[Sx]` unless the fact snippet directly supports the whole sentence;
- if advice needs support but is not sourced, rewrite as an uncited verification question or remove factual/material terms.

### Retry follow-up refinements

The first production retry resolved the canonical vai draft and the Tuyen Quang farmer draft. Two valid retained drafts still produced rejected candidates:

- Tuyen Quang exporter candidate left a material benefit/planning sentence uncited (`CLAIM_INLINE_CITATION`).
- Mavin exporter candidate used a checklist question about "ha tang van chuyen"; the current checklist regex falsely treated folded `ha` as the hectare unit.

Additional implementation:

- For `CLAIM_INLINE_CITATION`, tell the model that material planning, benefit, outcome, capacity, logistics, contract, or market implication sentences must either be directly source-backed with `[Sx]` and a matching `claimSources` entry, or rewritten as a non-factual verification question.
- Remove standalone `ha` from the checklist hard-fact regex. Numeric area is already caught by digits and the technical-detail pattern; standalone folded `ha` also appears in normal Vietnamese words such as "ha tang".
- If a sentence contains a source-specific number such as `124/124`, it cannot be made safe merely by saying "can xac minh". It must either keep the number with `[Sx]` plus `claimSources`, or move the idea into a checklist question without repeating the number.

## Testing And Verification

Add regression tests for:

- Tuyên Quang-style source title passing when `tuyen-quang` evidence is present;
- source-backed body claims not being rejected only because a checklist question uses similar words;
- prompt/repair guidance containing the tighter word and advice-citation rules.
- exporter checklist questions about "ha tang van chuyen" not being rejected as hectare facts.

Run server tests, lint, build, deploy/push, then regenerate the repairable rows and archive the unsafe rows through admin API. Finish with an admin audit of draft/archived statuses.

## Rollout Notes

All production writes must use admin-authenticated endpoints. Replacements remain in `draft`. Archived rows are removed from the default draft review queue but remain recoverable and auditable.
