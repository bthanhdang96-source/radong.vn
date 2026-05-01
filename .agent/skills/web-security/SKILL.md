---
name: web-security
description: Web application security guardrails for this project. Use when the user explicitly asks for web security, security review, auth hardening, threat modeling, or bao mat; and auto-use when implementing or changing risky features such as Supabase auth, RLS, roles, admin access, service-role usage, secrets or env vars, file upload, form submission, user-generated content rendering, redirects, webhooks, external fetches, API routes, background ingestion, data export, or anything that could expose private data, bypass authorization, or elevate privileges.
---

# Web Security

Apply this skill to keep security decisions explicit while building the Vite + React + TypeScript frontend, the TypeScript server, and the Supabase backend in this repository.

## Operating Rules

- Treat security regressions as release blockers.
- Prefer reducing attack surface over adding flexibility.
- Stop and ask for clarification if the request depends on unclear trust boundaries or impossible guarantees.
- State residual risk in the final answer when a change still depends on external controls.

## Mandatory Workflow

1. Identify the trust boundary.
   - List which parts are browser, server, Supabase policy layer, cron or worker, and third-party services.
   - Decide which side is allowed to enforce identity, authorization, validation, and data mutation.
2. Classify the data and action.
   - Determine whether the change touches public data, account data, internal ops data, secrets, or destructive/admin operations.
   - Treat writes, exports, moderation, role changes, uploads, and external callbacks as high risk by default.
3. Enforce least privilege.
   - Give the browser only the anonymous/public capabilities it needs.
   - Keep privileged reads and writes on the server or service-role worker path.
   - Avoid broad table access when a narrow view, RPC, or server endpoint is safer.
4. Validate input and output.
   - Validate type, enum, range, length, and required fields at the server or database boundary.
   - Reject unknown fields when they can change behavior or permissions.
   - Sanitize or escape untrusted output before rendering or forwarding it.
5. Check abuse paths.
   - Look for IDOR, privilege escalation, mass assignment, open redirects, XSS, CSRF-like flows, SSRF, rate-limit bypass, replay, webhook spoofing, and data leakage through logs or error messages.
6. Verify storage and observability.
   - Confirm secrets stay out of client bundles, browser storage, public repos, and logs.
   - Ensure logs are useful without leaking tokens, raw credentials, or personal data.
7. Close with a security note.
   - Summarize what boundary enforces access.
   - Call out remaining assumptions, follow-up tests, or deployment controls.

## Project-Specific Guardrails

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser, `src/`, client env vars, or any response payload.
- Use the anonymous or publishable Supabase key in the browser only for flows that are safe under RLS.
- Keep service-role clients isolated to trusted server-side code paths. Do not re-export them into shared utilities that client code could import.
- For new Supabase tables or views, require explicit RLS policies and verify whether reads should be public, user-scoped, or service-only.
- Do not trust client-supplied `user_id`, `role`, `status`, `is_verified`, `observation_id`, or any moderation/admin field.
- Lock Supabase auth redirects to exact known URLs. Do not introduce pattern-based or user-controlled redirect targets.
- Treat ingestion, cron refresh, Telegram alerts, and admin data repair flows as privileged operations.
- If the feature can work with a derived public view instead of raw tables or raw payload fields, prefer the derived view.
- Read [references/project-security-hotspots.md](references/project-security-hotspots.md) before changing Supabase access, ingestion, or auth-adjacent files.

## Feature Rules

### Auth, Identity, and Roles

- Derive the acting user from a verified session or JWT, never from request body fields.
- Keep authorization checks server-side or in RLS, not only in client conditionals.
- Do not gate admin features on UI flags alone.
- Require stronger confirmation for destructive or role-changing actions.

### Supabase and Database Access

- Enable RLS on every new user-facing table.
- Write policies that match the actual actor: anonymous, authenticated owner, or service role.
- Prefer `security_invoker` views or constrained RPC functions when they reduce raw table exposure.
- Review whether materialized views or helper functions accidentally widen visibility.
- Keep raw crawl logs, ingestion errors, and operational data service-only unless there is a clear read requirement.

### Forms, Query Params, and User Content

- Validate numbers, dates, URLs, slugs, enum values, and free text before persistence or expensive downstream work.
- Reject hidden fields that should be server-controlled.
- Never use `dangerouslySetInnerHTML` unless sanitized and documented.
- Escape or sanitize untrusted content in notifications, templates, and admin tools.

### File Upload and Storage

- Default to private storage buckets.
- Allowlist MIME type and extension, cap file size, and generate server-side names.
- Do not trust client-reported content type, width, height, or file name.
- Use signed URLs or server-mediated download rules for non-public assets.

### API Routes, Fetches, and Webhooks

- Enforce method checks, auth checks, and authorization checks at the route boundary.
- Add rate limiting or abuse throttling to public, expensive, or mutation endpoints.
- Verify webhook signatures or shared secrets before processing payloads.
- Do not fetch arbitrary user-supplied URLs without an allowlist and SSRF review.
- Avoid returning stack traces, raw SQL errors, internal IDs, or secret-bearing config in responses.

### Redirects and Navigation

- Redirect only to internal paths or exact allowlisted origins.
- Normalize and validate any return URL, next URL, or callback parameter.

### Logging and Secrets

- Keep secrets in server env vars only.
- Redact tokens, auth headers, cookies, phone numbers, chat IDs, and raw third-party payloads unless explicitly needed for debugging.
- Do not add secrets to test fixtures, screenshots, docs, or seed data.

## Security Review Checklist

- What can anonymous users do after this change?
- What can authenticated users do after this change?
- What can service-role code do after this change, and where is that code reachable from?
- Can one user read, overwrite, or infer another user's data?
- Are RLS, view exposure, and server-side authorization aligned?
- Is all untrusted input validated at the correct boundary?
- Could redirects, uploads, HTML rendering, or external fetches be abused?
- Are logs and error messages free of secrets and sensitive raw payloads?
- Are tests, manual verification steps, or migration checks sufficient for the new risk?

## Response Contract

- Mention the main security boundary you relied on, such as RLS, server-only logic, or an allowlist.
- Mention important follow-up verification if code changed in a sensitive path.
- If the task is low risk and does not touch a sensitive boundary, stay concise and do not add unnecessary process.
