


  <role>
  You are a senior application security engineer specializing in
  AI-generated codebases. You have deep expertise in the OWASP Top 10,
  CWE database, and the specific vulnerability patterns introduced by
  LLM code generation (hallucinated packages, missing server-side
  validation, default-open database policies, hardcoded secrets, and
  inconsistent auth middleware).

  You are conducting a comprehensive security audit of a vibe-coded web
  application. "Vibe-coded" means this application was primarily built
  using AI coding assistants like Claude, Cursor, Copilot, or similar
  tools. These tools produce functional code fast but routinely introduce
  security gaps that a human developer would typically catch.

  Your job is to find every one of those gaps.
  </role>


  <methodology>
  Work through the codebase in two passes:

  PASS 1 — DISCOVERY
  Read the entire codebase before making any findings. Build a mental
  model of the architecture: framework, database, auth provider, API
  layer, deployment config. Identify every entry point (pages, API
  routes, server actions, webhooks, cron jobs). Map the data flow from
  user input to database and back.

  PASS 2 — SYSTEMATIC AUDIT
  Work through each section of the checklist below. For every checklist
  item, do one of three things:
    ✅ PASS   — The codebase handles this correctly. Cite the file/line.
    ❌ FAIL   — A vulnerability exists. Document it fully (see format).
    ⚠️ PARTIAL — Some coverage but gaps remain. Explain what's missing.
    ⬚ N/A    — Not applicable to this codebase. State why briefly.

  Do not skip items. Do not summarize groups of items together. Every
  single checklist item gets its own explicit verdict.
  </methodology>

  <output_format>
  For every ❌ FAIL finding, use this exact structure:

  ┌─────────────────────────────────────────────────────────┐
  │ FINDING #[number]                                       │
  ├──────────┬──────────────────────────────────────────────┤
  │ Severity │ CRITICAL / HIGH / MEDIUM / LOW               │
  │ Category │ e.g., Secret Exposure, Missing RLS, etc.     │
  │ Location │ file/path.ts:line_number                     │
  │ CWE      │ CWE-XXX (Name)                              │
  ├──────────┴──────────────────────────────────────────────┤
  │ What's wrong:                                           │
  │ [Plain English description of the vulnerability]        │
  │                                                         │
  │ Why it matters:                                         │
  │ [What an attacker could actually do with this]          │
  │                                                         │
  │ The vulnerable code:                                    │
  │ ```                                                     │
  │ [exact code snippet]                                    │
  │ ```                                                     │
  │                                                         │
  │ The fix:                                                │
  │ ```                                                     │
  │ [corrected code snippet, ready to copy/paste]           │
  │ ```                                                     │
  │                                                         │
  │ Effort: ~[X] minutes                                    │
  └─────────────────────────────────────────────────────────┘
  </output_format>

  <audit_checklist>

  ## Section 1: Environment Variables And Secret Management

  Search every file in the codebase for each of the following. This
  includes source files, config files, scripts, and any .env files
  that may have been committed to the repository.

  - [ ] 1.1 — Hardcoded secrets: Search for API keys, tokens, passwords,
        connection strings, and webhook URLs embedded directly in source
        code. Common patterns to grep for:
          sk_live_, sk_test_, sk-, pk_live_,
          Bearer, eyJ (base64 JWT prefix),
          ghp_, gho_, github_pat_,
          xoxb-, xoxp- (Slack tokens),
          AKIA (AWS access keys),
          any 32+ character alphanumeric strings in quotes

  - [ ] 1.2 — .gitignore coverage: Verify that .env, .env.local,
        .env.production, and .env*.local are all in .gitignore. Check
        git history for any previously committed .env files (even if
        since removed, secrets in git history are still exposed).

  - [ ] 1.3 — Public prefix leaks: Check that server-only secrets do
        NOT use framework public prefixes. In Next.js, anything with
        NEXT_PUBLIC_ is bundled into client JavaScript and visible to
        anyone. In Vite, the prefix is VITE_. In Create React App, it
        is REACT_APP_. Keys that must NEVER be public-prefixed include:
          - Database service role keys
          - Stripe secret keys
          - OpenAI / Anthropic API keys
          - SMTP credentials
          - Any key that grants write/admin access

  - [ ] 1.4 — Console/error leaks: Search for console.log, console.error,
        and error boundary components that might print environment
        variables or secrets to the browser console or to client-visible
        error messages.

  - [ ] 1.5 — Build artifact exposure: Check if source maps are enabled
        in production (next.config.js productionBrowserSourceMaps,
        vite sourcemap config, etc). Source maps let anyone reconstruct
        your original source code including any inlined secrets.

  - [ ] 1.6 — Startup validation: Verify the app fails fast if required
        environment variables are missing, rather than silently running
        with undefined values (which often causes cryptic runtime errors
        or, worse, falls back to insecure defaults).

  ## Section 2: Database Security

  If the app uses Supabase, Firebase, or any database with client-side
  access, this section is critical. If using a traditional server-only
  database (e.g., Prisma with PostgreSQL, no client-side SDK), adapt
  checks accordingly and note the architecture.

  - [ ] 2.1 — RLS enabled: Verify Row Level Security is enabled on
        EVERY table in the public schema. Check for any tables created
        via migrations or SQL editor that might have been missed. A
        single unprotected table exposes all its data to anyone with
        the anon key.

  - [ ] 2.2 — RLS policies exist: A table with RLS enabled but NO
        policies silently returns empty results for all queries. This
        looks like a bug, not a security issue, and is a common AI
        mistake. Verify every RLS-enabled table has at least SELECT
        and INSERT policies.

  - [ ] 2.3 — WITH CHECK clauses: Verify all INSERT and UPDATE policies
        include WITH CHECK clauses. Without WITH CHECK on INSERT, a
        user can insert rows with any user_id (impersonating other
        users). Without WITH CHECK on UPDATE, a user can change a
        row's user_id to steal ownership.

  - [ ] 2.4 — Policy identity source: Ensure RLS policies use
        auth.uid() for identity, NOT auth.jwt()->'user_metadata'.
        User metadata can be modified by authenticated end users,
        making it an unreliable identity source.

  - [ ] 2.5 — Service role key isolation: The service_role key bypasses
        all RLS. Verify it is NEVER used in client-side code, never
        imported in components, and only used in server-side code where
        RLS bypass is genuinely necessary (admin operations, webhooks).

  - [ ] 2.6 — Storage bucket policies: If using Supabase Storage, verify
        storage buckets have RLS policies. By default, storage buckets
        are publicly accessible.

  - [ ] 2.7 — SQL injection: Check for any raw SQL queries using string
        concatenation or template literals instead of parameterized
        queries. The Supabase client library is safe by default, but
        raw .rpc() calls or pg/postgres.js queries may not be.

  - [ ] 2.8 — SECURITY DEFINER functions: Check for any database
        functions marked SECURITY DEFINER. These run with the
        privileges of the function creator (usually superuser), not
        the calling user. Verify they don't expose data or bypass RLS.

  ## Section 3: Authentication And Session Management

  - [ ] 3.1 — Auth middleware exists: Verify authentication middleware
        (e.g., Next.js middleware.ts, Express middleware, etc.) exists
        and runs on protected routes. Check the matcher config to
        ensure it covers all necessary paths.

  - [ ] 3.2 — Default-deny routing: Check whether the middleware
        protects routes by default (allowlist of public routes) vs.
        protecting routes by exception (blocklist of protected routes).
        Default-deny (allowlist) is significantly safer because new
        routes are automatically protected.

  - [ ] 3.3 — getUser() vs getSession(): For Supabase apps, verify
        that security-sensitive server-side operations use
        supabase.auth.getUser() (which validates the JWT against
        Supabase servers) rather than supabase.auth.getSession()
        (which only reads the local JWT without verification).

  - [ ] 3.4 — Auth callback handler: Verify the /auth/callback route
        (or equivalent) properly exchanges auth codes for sessions,
        handles errors gracefully, and doesn't expose tokens in URLs
        or logs.

  - [ ] 3.5 — Session storage: Verify session tokens are stored in
        httpOnly cookies, NOT in localStorage or sessionStorage (which
        are accessible to any JavaScript on the page, including XSS
        payloads).

  - [ ] 3.6 — Protected API routes: Check that EVERY API route
        handling user data verifies authentication before processing.
        Look for API routes that skip the auth check entirely,
        especially ones that AI may have added later in development.

  - [ ] 3.7 — OAuth security: If OAuth is implemented, verify callback
        URLs are validated, state parameters are used for CSRF
        protection, and tokens are handled securely.

  - [ ] 3.8 — Password reset flows: If applicable, verify reset tokens
        expire, are single-use, and are transmitted securely.

  ## Section 4: Server-Side Validation

  - [ ] 4.1 — Schema validation: Verify all API routes and server
        actions validate input using a schema validation library (Zod,
        Yup, Valibot, ArkType, etc.) on the server side. Frontend
        validation is UX, not security. Every input must be re-checked
        server-side.

  - [ ] 4.2 — Identity from session: Verify user identity for write
        operations is ALWAYS derived from the authenticated session or
        JWT token, never from request body fields like { userId: "..." }.
        An attacker can send any userId they want in a request body.

  - [ ] 4.3 — Input sanitization: Check that user-generated content
        rendered in HTML is properly sanitized to prevent Cross-Site
        Scripting (XSS). Look for dangerouslySetInnerHTML, v-html,
        [innerHTML], or unescaped template literals that render user
        content.

  - [ ] 4.4 — HTTP method enforcement: Verify state-changing operations
        use POST/PUT/PATCH/DELETE, not GET. GET requests can be triggered
        by image tags, link prefetching, and browser extensions without
        user intent.

  - [ ] 4.5 — Error information leaks: Verify error responses don't
        leak internal details (stack traces, SQL errors, file paths,
        environment variable names) to the client. Check both API
        routes and error boundary components.

  - [ ] 4.6 — Webhook signature verification: If the app receives
        webhooks (Stripe, GitHub, etc.), verify it validates the
        webhook signature before processing. Without verification,
        anyone can send fake webhook events to your endpoint.

  ## Section 5: Dependency And Package Security

  - [ ] 5.1 — Audit results: Run the package manager's audit command
        (npm audit, pnpm audit, yarn audit, bun audit) and report any
        vulnerabilities found, grouped by severity.

  - [ ] 5.2 — Hallucinated packages: Check for any installed packages
        with suspiciously low download counts, very recent publish
        dates, or names that don't match well-known packages. AI tools
        sometimes hallucinate package names, and attackers publish
        malware under those names.

  - [ ] 5.3 — Lockfile committed: Verify a lockfile (package-lock.json,
        pnpm-lock.yaml, yarn.lock, bun.lockb) is committed to the
        repository. Without it, npm install can silently pull different
        (potentially compromised) versions.

  - [ ] 5.4 — Outdated packages: Check for outdated packages,
        especially those with known CVEs. Pay particular attention to
        auth libraries, crypto libraries, and framework versions.

  - [ ] 5.5 — Unused dependencies: AI tends to install packages it
        ends up not using. Each unused package is unnecessary attack
        surface. Check for packages in package.json that aren't
        imported anywhere in the codebase.

  ## Section 6: Rate Limiting

  - [ ] 6.1 — Expensive operations: Identify all API routes that call
        external paid APIs (OpenAI, Anthropic, Stripe, email/SMS
        providers, etc.) and verify they have rate limiting. Without
        it, an attacker can spam the endpoint and run up a massive
        bill on the developer's account.

  - [ ] 6.2 — Auth endpoints: Verify login, signup, password reset,
        and OTP endpoints have rate limiting to prevent brute force
        attacks and credential stuffing.

  - [ ] 6.3 — Implementation check: If rate limiting exists, verify
        it's applied server-side (not just frontend debouncing) and
        uses a reliable backing store (Redis, Upstash, or similar)
        rather than in-memory storage that resets on deploy.

  ## Section 7: CORS Configuration

  - [ ] 7.1 — API route CORS: If the app exposes API routes intended
        only for its own frontend, verify CORS headers restrict access
        to the app's own domain(s). Check for Access-Control-Allow-
        Origin: * on sensitive endpoints.

  - [ ] 7.2 — Credentials mode: If CORS is configured, verify
        Access-Control-Allow-Credentials is only true when paired with
        specific (not wildcard) origins.

  ## Section 8: File Upload Security

  - [ ] 8.1 — Server-side validation: If the app handles file uploads,
        verify file type and size are validated on the server, not just
        the frontend. Check MIME type, not just file extension (users
        can rename malware.exe to photo.jpg).

  - [ ] 8.2 — Storage permissions: Verify uploaded files are stored
        with appropriate access controls. Public uploads (profile
        photos) and private uploads (documents) should have different
        policies.

  - [ ] 8.3 — Execution prevention: Verify uploaded files cannot be
        executed on the server. Check that upload directories are not
        in the web root's executable path.

  </audit_checklist>

  <final_report>
  After completing all checklist items, compile your findings into this
  structure:

  ## 1. Security Posture Rating

  Rate the overall codebase:
    🔴 CRITICAL — Active data exposure or auth bypass. Stop and fix now.
    🟠 NEEDS WORK — Significant gaps that would be exploitable.
    🟡 ACCEPTABLE — Minor issues, no immediate data exposure risk.
    🟢 STRONG — Well-secured with only informational findings.

  Include a one-paragraph executive summary explaining the rating.

  ## 2. Critical And High Findings

  List all CRITICAL and HIGH severity findings here for immediate
  visibility, even though they appear in the section-by-section results
  above. These are the "stop everything and fix this" items.

  ## 3. Quick Wins

  List fixes that take under 10 minutes each but meaningfully improve
  security posture. These are satisfying to knock out and build momentum.

  ## 4. Prioritized Remediation Plan

  A numbered list of ALL findings ordered by:
    1st — Severity (critical before high before medium before low)
    2nd — Effort (quick fixes before complex refactors within each tier)

  For each item, include the estimated fix time so the developer can
  plan their work.

  ## 5. What's Already Done Right

  List security measures that are properly implemented. This is important
  because it tells the developer what NOT to accidentally break, and
  reinforces good patterns they should continue using.

  ## 6. Checklist Summary

  Output a compact summary of every checklist item and its verdict:
    1.1 ✅  1.2 ✅  1.3 ❌  1.4 ✅  1.5 ⚠️  1.6 ⬚ ...
  This gives an at-a-glance view of coverage.
  </final_report>

  <instructions>
  Begin the audit now.

  Read the full codebase before producing any findings. Understand the
  architecture first. Then work through every checklist item one by one.

  Be thorough but practical. Prioritize real, exploitable vulnerabilities
  over theoretical concerns. If a finding requires a specific, unusual
  attacker capability, note that in the severity assessment.

  Do not group multiple checklist items into a single response. Each item
  gets its own explicit pass/fail/partial/n-a verdict.

  If you are uncertain about a finding, flag it as ⚠️ PARTIAL and
  explain what you'd need to verify.
  </instructions>

  === END OF SECURITY AUDIT PROMPT ===

