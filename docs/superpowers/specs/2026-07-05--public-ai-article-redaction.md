# Public AI Article Redaction

Date: 2026-07-05
Status: Approved by user request

## Goal

Make approved AI articles read like public editorial content. Public readers must not see source ledgers, internal source data, SEO checks, quality checks, or inline source markers such as `[S1]` and `[S2]`.

## Context

The admin AI article review page intentionally shows the generated article body plus collapsible `Dữ liệu nguồn` and `SEO & quality` JSON. The public article page renders `contentHtml`, so any generated `Nguồn tham khảo` section or inline `[Sx]` markers stored in the article body currently appears to readers after publish. Public API routes can also return the same detail object used by admin, including source facts and quality metadata.

## Recommended Approach

Keep full diagnostics available behind `ADMIN_API_KEY`, but introduce a public-safe article detail shape for public APIs and public news rendering. Strip inline `[Sx]` markers and remove the final `Nguồn tham khảo` section from public body HTML/text. Update the AI blog prompt and validator so future drafts no longer require reader-facing citations or reference sections.

## Alternatives Considered

- Delete references from stored articles. Rejected because admin review still benefits from provenance and validation metadata.
- Hide only with frontend CSS. Rejected because public APIs and server-rendered HTML would still leak the data.
- Keep citations but style them smaller. Rejected because the target reader is phổ thông, not a research/audit user.

## Design

- Add public sanitizers in the AI article service:
  - remove `Nguồn tham khảo` heading and following content from public markdown/text/html;
  - remove inline `[S1]`, `[S2]`, etc. from public copy;
  - do not expose `sourceFacts`, `seo`, or `quality` from public article detail responses.
- Keep admin endpoints unchanged.
- Update AI blog generation prompt to keep `sourcesUsed` and `claimSources` as internal JSON only, not body text.
- Update validation gates to reject drafts that include a public `Nguồn tham khảo` section or inline `[Sx]` markers.
- Add regression tests for public redaction and prompt/validation behavior.

## Data Flow

Generated drafts may still store source facts, SEO, and quality JSON in Supabase. Public routes transform the stored row into a redacted response before returning it or rendering `/tin-tuc/:slug`.

## Security And Privacy

The change reduces public exposure. Admin review diagnostics remain protected by the existing admin-key middleware. No Supabase schema, RLS, or migration changes are required.

## Testing And Verification

- Add focused unit tests for public AI article redaction.
- Update existing AI article tests for the new no-public-citation prompt contract.
- Run the AI article and public production surface tests.
- Run repository quality gates and pre-handoff before completion.
