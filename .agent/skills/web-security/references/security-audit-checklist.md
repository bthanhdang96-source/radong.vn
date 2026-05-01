# Security Audit Checklist

Load this file for explicit audit or security review tasks. Use it to drive a two-pass review: discovery first, checklist second.

## Pass 1: Discovery

- Identify framework, runtime, deployment, auth provider, database model, and external services.
- Enumerate entry points: pages, forms, API routes, webhooks, cron jobs, workers, migrations, and scripts.
- Trace user input through validation, authorization, storage, rendering, and outbound requests.

## Pass 2: Checklist

Give each item an explicit verdict: `PASS`, `FAIL`, `PARTIAL`, or `N/A`.

### 1. Secrets and Environment

- `1.1` Hardcoded secrets, tokens, webhook URLs, connection strings, and suspicious long credentials in source or config.
- `1.2` `.gitignore` coverage for `.env`, `.env.local`, `.env.production`, `.env*.local`, and previously committed secrets.
- `1.3` Public-prefix leaks such as `VITE_` or `NEXT_PUBLIC_` on server-only secrets.
- `1.4` Console, error, or UI leaks of env vars, tokens, stack traces, or internal config.
- `1.5` Production source map exposure or equivalent build artifact leakage.
- `1.6` Startup validation for required env vars instead of insecure fallback behavior.

### 2. Database and Supabase

- `2.1` RLS enabled on every user-facing table and bucket.
- `2.2` Required policies exist and match actual access patterns.
- `2.3` `WITH CHECK` clauses on insert and update paths.
- `2.4` Identity derived from `auth.uid()` or trusted server context, not mutable metadata.
- `2.5` Service-role isolation to server-only code paths.
- `2.6` Storage bucket permissions and signed/private access where needed.
- `2.7` SQL injection risk in raw SQL, RPC wrappers, or string-built queries.
- `2.8` `SECURITY DEFINER` functions, helper views, and RLS bypass risk.

### 3. Authentication and Sessions

- `3.1` Auth middleware or equivalent protection exists on sensitive routes.
- `3.2` Default-deny or allowlist routing instead of fragile blocklists.
- `3.3` Verified identity checks on server-side Supabase operations.
- `3.4` Safe auth callback handling and no token leakage in logs or URLs.
- `3.5` Session token storage avoids client-readable storage for sensitive apps.
- `3.6` Every protected API route verifies authentication before work.
- `3.7` OAuth callback validation and CSRF `state` protection when applicable.
- `3.8` Password reset and recovery flows expire and prevent reuse when applicable.

### 4. Validation and Request Handling

- `4.1` Server-side schema validation for every write or security-sensitive input.
- `4.2` User identity for writes derived from session or JWT, not body fields.
- `4.3` XSS prevention in HTML rendering, templates, markdown, and admin tools.
- `4.4` Correct HTTP method enforcement for state-changing actions.
- `4.5` Error responses do not expose internal details.
- `4.6` Webhook signature verification before processing.

### 5. Dependencies and Supply Chain

- `5.1` Package audit results and severity summary.
- `5.2` Hallucinated, obscure, or suspicious packages.
- `5.3` Committed lockfile.
- `5.4` Outdated packages with relevant CVEs.
- `5.5` Unused dependencies that widen attack surface.

### 6. Abuse Controls

- `6.1` Rate limiting on expensive or billable endpoints.
- `6.2` Rate limiting on auth, OTP, reset, and signup flows.
- `6.3` Reliable server-side enforcement, not just frontend debouncing.

### 7. Cross-Origin Boundaries

- `7.1` CORS origin restrictions on endpoints not intended for public cross-site use.
- `7.2` Credentials mode only with explicit origins, never wildcard origins.

### 8. File Uploads

- `8.1` Server-side file type and size validation.
- `8.2` Storage permissions match public vs private use.
- `8.3` Uploaded files cannot execute as server code.
