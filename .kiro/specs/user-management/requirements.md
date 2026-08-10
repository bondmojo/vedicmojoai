# Requirements Document: User Management & Chart Ownership

## Introduction

VedicMojoAI has shipped so far as a **single-practitioner internal tool** — `docs/USER_STORIES_v1.md`
§1.5 explicitly locks "no authentication or multi-tenant support" as a Phase‑1
non‑goal, and every `UnifiedChart` (`prisma/schema.prisma`) is globally visible to
whoever can reach the app.

This feature reverses that assumption: it introduces real user accounts (signup,
login, forgot/reset password) and makes `UnifiedChart` **owned** — every chart
belongs to exactly one user, and a user can only see, run analyses on, and delete
their own charts. This is the foundation for more than one practitioner using the
same deployment without seeing each other's clients.

This is a **requirements document only** — no `design.md` / `tasks.md` / code yet.
All decisions that would have blocked `design.md` (auth implementation, session
strategy, email provider, signup model, MCP token policy) have been resolved —
see **Decisions** below — so this spec is unblocked for a design pass.

## Non-Goals

Explicitly **out of scope** for this feature:

- **Roles/permissions beyond ownership.** No admin role, no sharing a chart between
  users, no team/organization concept. One owner per chart, full stop.
- **OAuth / social login** (Google, etc.). Email + password only for v1.
- **Two-factor authentication.**
- **Retroactive scoping of `Chart` (legacy) or `SavedChart` (legacy).** Those tables
  are already read-only/deprecated per `docs/ERD.md`; they are not touched.
- **Scoping `PipelineRun` / `DurationAnalysis` with their own `userId` column.**
  Ownership is derived transitively through `UnifiedChart.userId` via
  `PipelineRun.unifiedChartId` / `DurationAnalysis.unifiedChartId` — see
  Requirement 5. A `PipelineRun` whose only link is the legacy required `chartId`
  (no `unifiedChartId`) has no owner and is out of scope (legacy path).
- **MCP token expiry/rotation and multi-token UX.** Decided (7, 9): tokens don't
  expire and there is exactly one active token per user in v1. Scheduled
  rotation and multiple concurrently-active tokens per user are out of scope,
  not merely deferred pending a decision.
- **OAuth-style invite/admin-approval gating on signup.** Decided (6): signup
  stays open self-serve; an invite/approval workflow is out of scope.
- **Billing/subscription gating.** Account creation is free-form; no payment wall.

## Glossary

- **Account** — a `User` row: email, password hash, profile basics.
- **Session** — the mechanism by which a request is attributed to a logged-in
  `User` (cookie-based; exact implementation is an open decision).
- **Owner** — the `User` referenced by `UnifiedChart.userId`.
- **Reset token** — a single-use, time-limited, hashed-at-rest token used to
  authorize a password change without the old password.
- **MCP token** — a long-lived, revocable, hashed-at-rest credential
  (Requirement 7) that lets the MCP stdio process authenticate to the app's API
  as a specific `User`, in lieu of a browser session cookie.

## Requirements

### Requirement 1 — Sign up

**User story:** As a new practitioner, I want to create an account with my email
and a password, so that I get my own private workspace for my charts.

**Acceptance criteria:**
1. WHEN a visitor submits email + password (+ optional display name) to
   `POST /api/auth/signup`, THEN the system SHALL create a `User` row with the
   password stored only as a salted hash (bcrypt or argon2 — never plaintext,
   never reversibly encrypted).
2. WHEN the submitted email already exists, THEN the system SHALL reject the
   signup with a clear "email already registered" error and SHALL NOT create a
   duplicate account.
3. WHEN the password fails a minimum-strength check (length ≥ 8 at minimum),
   THEN the system SHALL reject the request with a field-level error before
   hashing/storing anything.
4. Email format SHALL be validated server-side (not just client-side) before
   persisting.
5. WHEN signup succeeds, THEN the system SHALL start an authenticated session for
   the new user immediately — there is no "verify your email before you can log
   in" gate in v1 (Decision 4: no email verification required).
6. Rate limiting SHALL apply to `POST /api/auth/signup` to deter automated account
   creation (exact limit is an implementation detail, not a hard number here).

### Requirement 2 — Log in / log out

**User story:** As a returning practitioner, I want to log in with my email and
password and later log out, so that my session is mine alone and I can end it on
a shared machine.

**Acceptance criteria:**
1. WHEN a user submits valid email + password to `POST /api/auth/login`, THEN the
   system SHALL establish a session and return success; the session cookie SHALL be
   `httpOnly`, `secure` (in production), and `SameSite=Lax` or stricter.
2. WHEN a user submits an unknown email or a wrong password, THEN the system SHALL
   return the **same generic "invalid email or password" error** in both cases —
   it SHALL NOT reveal whether the email exists (no user enumeration).
3. Login attempts SHALL be rate-limited per email and/or per IP to slow down
   credential-stuffing.
4. WHEN a logged-in user calls `POST /api/auth/logout`, THEN the system SHALL
   invalidate the session server-side (a session-table row delete/expiry, per
   Decision 2's database-backed sessions), not merely clear the cookie
   client-side.
5. All existing app pages and API routes that read/write `UnifiedChart` (and, per
   Requirement 5, anything scoped through it) SHALL require an authenticated
   session; an unauthenticated request SHALL be redirected to a login page (UI
   routes) or receive `401 Unauthorized` (API routes) rather than silently
   succeeding against no owner or every owner.
6. Authentication SHALL be implemented via **Auth.js (NextAuth)** with the
   Prisma adapter and **database-backed sessions** (Decisions 1–2) — not JWT —
   so that Requirement 3.5's "invalidate the user's other sessions on password
   reset" is a plain session-table delete, not a claims workaround. **No
   Credentials provider is registered** (`authConfig.providers: []`):
   `@auth/core`'s config assertion hard-errors (`UnsupportedStrategy`) on every
   `auth()` call — not only `signIn()` — whenever a Credentials provider
   coexists with `session.strategy: 'database'`, so credential verification
   and session creation/deletion are implemented directly against the Prisma
   adapter's functions (`createSession`/`deleteSession`) by the custom routes
   below, and Auth.js's own `signIn()`/`signOut()` are never called for
   credentials. See `.kiro/specs/user-management/design.md`'s "Auth.js
   integration note" and `lib/auth.ts`'s file header for the full rationale.

### Requirement 3 — Forgot / reset password

**User story:** As a practitioner who forgot their password, I want to request a
reset link by email and set a new password from it, so that I can regain access
without support intervention.

**Acceptance criteria:**
1. WHEN a user submits an email to `POST /api/auth/forgot-password`, THEN the
   system SHALL respond with the same generic "if that email exists, a reset link
   was sent" message regardless of whether the email is registered (no
   enumeration), and SHALL only actually send an email when the account exists.
2. WHEN an account exists for the submitted email, THEN the system SHALL create a
   single-use reset token, store only its hash (not the raw token) alongside an
   expiry (short-lived — on the order of 30–60 minutes), and email the raw token
   as a link to `/reset-password?token=...`.
3. WHEN `POST /api/auth/reset-password` is called with a token + new password,
   THEN the system SHALL: verify the token's hash matches an unexpired, unused
   record; set the new password (hashed, per Requirement 1.1); mark the token
   used; and invalidate the token so it cannot be replayed.
4. WHEN the token is expired, already used, or unknown, THEN the request SHALL be
   rejected with a generic "invalid or expired link" error, and no password SHALL
   change.
5. WHEN a password reset succeeds, THEN the system SHALL invalidate the user's
   other active sessions (force re-login everywhere) so a stolen session cookie
   doesn't survive a password reset triggered because credentials leaked.
6. Requesting a reset SHALL be rate-limited per email to prevent email-bombing an
   account.
7. Sending the reset email SHALL go through **Resend** (Decision 3) as the email
   provider — a new dependency, not a reuse of existing infrastructure, since the
   project has no `lib/email.ts` or provider env vars today. A `RESEND_API_KEY`
   (and a verified sending domain) SHALL be added to `.env.example` and
   documented in `Claude.md` in the same change that implements this
   requirement.

### Requirement 4 — Data model: `User` and reset tokens

**User story:** As the system, I want a normalized place to store accounts and
reset tokens, so that authentication data has one source of truth.

**Acceptance criteria:**
1. A new Prisma model `User` SHALL be added with at least: `id` (uuid),
   `email` (unique, case-insensitively — normalize to lowercase before the unique
   check/store), `passwordHash`, optional `name`, `createdAt`, `updatedAt`.
2. A new Prisma model `PasswordResetToken` SHALL be added with at least: `id`,
   `userId` (FK → `User`), `tokenHash` (unique), `expiresAt`, `usedAt` (nullable),
   `createdAt`.
3. Both models SHALL follow the repo's existing conventions (`@@map(...)` snake_case
   table names, `Timestamptz` for datetimes) per `.kiro/skills/database-prisma.md`.
4. `docs/ERD.md` SHALL be updated in the same change that adds these models (per
   `Claude.md`'s documentation-maintenance table).
5. Per Decision 1 (Auth.js/NextAuth) and Decision 2 (database-backed sessions),
   the schema SHALL also add Auth.js's own required models (`Account`,
   `Session`, `VerificationToken` — Auth.js's standard Prisma-adapter shape) and
   reconcile them with the `User` model above (i.e. `User` is the one row
   Auth.js's adapter attaches to, not a competing second user table).

### Requirement 5 — Link `UnifiedChart` to its owning user

**User story:** As a practitioner, I want every chart I create to belong to me and
be invisible to other practitioners, so that client data stays private per
account.

**Acceptance criteria:**
1. `UnifiedChart` SHALL gain a `userId` field (FK → `User`) and a `user User`
   relation, mirroring how it already relates to `PipelineRun` /
   `DurationAnalysis`.
2. `POST /api/unified-charts/from-compute` and `POST /api/unified-charts/from-paste`
   SHALL stamp the new row's `userId` from the authenticated session — never from
   a client-supplied field.
3. `GET /api/unified-charts` (list) SHALL filter to `WHERE userId = <session user>`
   — a user SHALL NEVER see another user's charts in a list response.
4. `GET /api/unified-charts/[id]`, `PATCH /api/unified-charts/[id]`, and any delete
   path SHALL verify `unifiedChart.userId === session.user.id` before returning
   data or applying a mutation; a mismatch SHALL return **`404`, never `403`**
   (Decision 5) — this never confirms to the caller that the ID exists at all.
5. `POST /api/unified-charts/[id]/analyze` (AI Analysis launch) and
   `POST /api/duration-analysis` / `POST /api/timeline` SHALL perform the same
   ownership check on the `UnifiedChart` they operate on before starting any
   pipeline run, since `PipelineRun` and `DurationAnalysis` have no `userId` of
   their own (Non-Goals) and inherit ownership only through the chart.
6. The report viewer (`/runs/[id]/report`, `GET /api/runs/[id]`,
   `GET /api/runs/[id]/report-content`) SHALL resolve the run's `unifiedChart` (via
   `PipelineRun.unifiedChartId`) and enforce the same ownership check before
   serving report content.
7. The MCP-facing routes (`POST /api/timeline`, `GET /api/knowledge/**`, and the
   additional routes enumerated in Requirement 8.3) SHALL enforce ownership using
   the `userId` resolved per Requirement 8 (session cookie or MCP token) —
   identical in behavior to 5.3–5.6, regardless of which authentication path
   resolved the caller.
8. `UnifiedChart.chartHash`'s deduplication constraint SHALL be unique per
   `userId` (`@@unique([userId, chartHash])`), never globally unique — two
   practitioners independently saving a chart for the same birth data (e.g. a
   shared client) SHALL NOT collide with, block, or be shown any information
   about the other's chart. A pre-multi-user global unique constraint on
   `chartHash` alone would violate 5.3/5.4 by construction (it fails or leaks
   another user's chart id/name based purely on birth data neither user
   supplied a session for).

### Requirement 6 — Migrating existing charts

**User story:** As the practitioner who already has charts in the database before
this feature ships, I want my existing data preserved and still accessible after
accounts are introduced, so that shipping this feature doesn't lock me out of my
own work.

**Acceptance criteria:**
1. A migration/backfill script SHALL create one `User` row for the existing sole
   practitioner (email supplied at migration time) and set
   `UnifiedChart.userId` to that user's `id` for every pre-existing row.
2. `UnifiedChart.userId` SHALL be added as nullable in the initial migration,
   backfilled, and only then tightened to `NOT NULL` in a follow-up migration —
   mirroring the safe-migration pattern already used elsewhere in this codebase
   (additive-then-tighten), so deploy ordering never has a window where inserts
   fail.
3. The backfill SHALL be idempotent (safe to re-run) and SHALL be a checked-in
   script (e.g. `prisma/backfill-owner.ts`) in the same spirit as
   `npm run db:migrate-saved`.

### Requirement 7 — MCP token issuance and lifecycle

**User story:** As a practitioner who wants to use Claude Desktop against my own
data, I want to generate a personal, revocable MCP token from the web app while
logged in, so that the MCP server can act as me specifically instead of as an
anonymous shared caller.

**Acceptance criteria:**
1. A new Prisma model `McpApiToken` SHALL be added with at least: `id` (uuid),
   `userId` (FK → `User`), `tokenHash` (unique), `label` (optional, user-supplied,
   e.g. "Work laptop"), `lastUsedAt` (nullable), `revokedAt` (nullable),
   `createdAt` — following the same conventions as `PasswordResetToken`
   (Requirement 4.2) and `.kiro/skills/database-prisma.md`.
2. WHEN a logged-in user requests a new token (e.g.
   `POST /api/account/mcp-token`, gated by session only — never by an MCP token
   itself), THEN the system SHALL generate a cryptographically random token
   (≥32 bytes of entropy), return the **raw token value exactly once** in that
   response, and persist only its hash (SHA-256 or equivalent keyed digest — not
   bcrypt; this is a lookup, not a low-entropy password compare) as a new
   `McpApiToken` row owned by that user.
3. WHEN a user already has an active (non-revoked) token, THEN generating a new
   one SHALL revoke the previous one in the same operation — v1 supports
   **exactly one active token per user at a time** (Decision 9, final for v1;
   not merely a placeholder pending later multi-token support).
4. WHEN a user revokes their token (e.g. `POST /api/account/mcp-token/revoke`,
   session-gated), THEN it SHALL be rejected by every route from that moment on.
5. The raw token value SHALL NEVER be persisted, logged, or retrievable again
   after generation; only `label`, `createdAt`, and `lastUsedAt` are shown
   afterward (reveal-once, standard API-key UX).
6. `docs/ERD.md` SHALL be updated in the same change that adds `McpApiToken`,
   per `Claude.md`'s documentation-maintenance table (mirrors Requirement 4.4).
7. Tokens SHALL NOT expire automatically (Decision 7) — they remain valid until
   the user explicitly revokes/regenerates them.
8. The account settings page SHALL display the active token's `label`,
   `createdAt`, and a human-readable `lastUsedAt` (e.g. "last used 2 days ago",
   or "never used" if null) so the practitioner has visible confirmation the
   token is only being used as expected (Decision 8).

### Requirement 8 — MCP request authentication and ownership enforcement

**User story:** As a practitioner, I want every route the MCP server calls on my
behalf to recognize me as the calling user and enforce the same ownership rules
as the web UI, so that Claude Desktop can only see and act on my own charts,
reports, and analyses.

**Acceptance criteria:**
1. `lib/mcpAuth.ts`'s `requireMcpToken` SHALL be rewritten to resolve identity,
   not just gate access: WHEN a request carries `x-mcp-token`, THEN the system
   SHALL hash it (Requirement 7.2's function) and look up a non-revoked
   `McpApiToken` with a matching `tokenHash`; on a match it SHALL return the
   associated `userId` (updating `lastUsedAt` best-effort) instead of
   `null`/401; on no match, `401 Unauthorized`.
2. A single shared helper (e.g. `resolveRequestUser(request)`) SHALL centralize
   dual-path resolution: check session (Requirement 2) first, fall back to
   `x-mcp-token` (8.1) if absent; it SHALL return one canonical `userId` (or
   none) regardless of path, so every ownership check (Requirement 5) is written
   once and is agnostic to caller type.
3. The following routes — today either already gated (`POST /api/timeline`,
   `GET /api/knowledge`, `GET /api/knowledge/[type]/[name]`) or entirely open
   (`GET /api/unified-charts`, `GET/PATCH/DELETE /api/unified-charts/[id]`,
   `POST /api/unified-charts/[id]/analyze`, `POST /api/compute`,
   `POST /api/compute/varshaphal`, `GET /api/reports`, `GET /api/runs/[id]`,
   `GET /api/runs/[id]/report-content`, `GET /api/duration-analysis`,
   `GET /api/duration-analysis/[id]`) — SHALL call the 8.2 helper and enforce
   the Requirement 5 ownership checks against its resolved `userId`, regardless
   of whether that `userId` came from a session cookie or an MCP token.
4. WHEN a request to any route in 8.3 supplies neither a valid session nor a
   valid MCP token, THEN it SHALL receive `401 Unauthorized`, exactly as an
   invalid session would; normal browser session-cookie access to these routes
   SHALL be unaffected.
5. `POST /api/compute` and `POST /api/compute/varshaphal` are stateless (no
   persisted resource, no `userId` to filter by) — 8.3 requires only
   authentication (a resolved `userId`) for them, not ownership filtering; they
   SHALL NOT be changed to persist or scope data as part of this requirement.
6. This requirement SHALL require no change to `mcp/src/tools.ts`, and no change
   to `mcp/src/http.ts` either — MCP continues sending whatever value lives in
   `MCP_TOKEN` as `x-mcp-token`, unchanged in transport; only its meaning
   shifts, from a global shared string to a per-user secret (Requirement 7).
7. WHEN this requirement ships, THEN `tests/mcp-cost-guard.test.ts` SHALL
   continue to pass with its `ALLOWED_POST_ROUTES` allow-list
   (`/api/compute`, `/api/compute/varshaphal`, `/api/timeline`) and literal-path
   assertion **unmodified**, since this is a server-side auth change adding zero
   new `api.get`/`api.post`/`api.getText` call sites in `mcp/src`. IF a future
   iteration needs a genuinely new MCP-initiated call (e.g. an explicit
   token-exchange/whoami round trip), THEN that change SHALL update the
   allow-list and literal-path assertions in the same PR and call out the
   addition explicitly — it is NOT pre-approved here.
8. WHEN `MCP_TOKEN` is unset AND an environment variable naming a designated
   dev/seed user (e.g. `MCP_DEV_USER_EMAIL`) is configured AND the environment
   is not production, THEN the system SHALL resolve the request as that
   specific `User` (e.g. the practitioner backfilled in Requirement 6.1) —
   preserving today's zero-friction local dev, but as a named identity, not a
   blanket bypass.
9. WHEN `MCP_TOKEN` is unset and no dev/seed user is configured, OR the
   environment is production, THEN there SHALL be no open/no-op fallback: an
   unresolvable MCP call receives `401`. This explicitly supersedes today's
   "`MCP_TOKEN` unset ⇒ fully open" behavior, which becomes a data-leak risk
   once `UnifiedChart.userId` (Requirement 5) exists.

**Rationale:** the design deliberately leaves `mcp/src/http.ts` and
`mcp/src/tools.ts` untouched — the MCP process already sends one opaque string
as `x-mcp-token`; what changes is which table validates that string and what it
resolves to. Because the token is minted by the web app itself (a session-gated
UI action, Requirement 7.2) rather than fetched by the MCP process, no new
outbound HTTP call is introduced from `mcp/src`, so the cost-guard test's
allow-list and literal-path invariants need no changes. This directly resolves
former Open Decision 6 rather than deferring it further.

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NFR-1 | **Password storage:** bcrypt or argon2 with a per-password salt; cost factor SHALL be tuned, not left at a library default without review. |
| NFR-2 | **No user enumeration:** login, forgot-password, and (per Req 5.4) chart-not-found responses SHALL NOT let a caller distinguish "doesn't exist" from "exists but not yours / wrong password." |
| NFR-3 | **Session cookie security:** `httpOnly`, `secure` in production, scoped `SameSite`. |
| NFR-4 | **Rate limiting** on signup, login, and forgot-password endpoints. |
| NFR-5 | **Reset tokens:** stored only as a hash, single-use, short expiry, invalidated on use and on password change. |
| NFR-6 | **Backward compatibility of documentation:** `docs/USER_STORIES_v1.md` §1.5 ("No authentication or multi-tenant support") and §1.3 Non-Goals SHALL be updated once this feature is scheduled, so the two documents don't silently contradict each other. |
| NFR-7 | **MCP token storage:** hashed at rest (never plaintext), revocable, one active token per user in v1 (Requirement 7.3). |
| NFR-8 | **Dev-only MCP identity fallback** (Requirement 8.8) SHALL be gated by an explicit production check, not solely by absence of env vars, to avoid silently re-opening access in a misconfigured deploy. |

## Decisions (resolved — unblocks `design.md`)

All nine items below were open questions during requirements authoring and have
since been decided directly with the product owner. They're recorded here for
traceability; the requirements above already reflect each choice.

1. **Auth implementation:** **Auth.js (NextAuth)** with the Prisma adapter, **no
   Credentials provider registered** (`providers: []`) — database sessions and
   a Credentials provider are mutually incompatible at the `@auth/core` config
   level regardless of whether `signIn()` is invoked, so credential
   verification/session management is implemented directly against the
   adapter instead. Not a custom-built auth system otherwise — Auth.js still
   owns the session/adapter plumbing. See Requirement 2.6, Requirement 4.5.
2. **Session strategy:** **Database-backed sessions**, not JWT — so Requirement
   3.5's "invalidate other sessions on password reset" is a plain session-table
   operation. See Requirement 2.4, 2.6.
3. **Email delivery provider:** **Resend**. `RESEND_API_KEY` + a verified sending
   domain to be added to `.env.example` / `Claude.md` when this ships. See
   Requirement 3.7.
4. **Email verification:** **Not required** — signup logs the user in
   immediately, no verify-before-login gate in v1. See Requirement 1.5.
5. **404 vs 403 on cross-account access:** **404**, always — never confirms a
   resource ID exists to a non-owner. See Requirement 5.4.
6. **Self-serve signup vs. invite-only:** **Open self-serve signup** — no
   invite/admin-approval gate. See Requirement 1, Non-Goals.
7. **MCP token expiry/rotation:** **No auto-expiry** — tokens remain valid until
   manually revoked/regenerated. See Requirement 7.7, Non-Goals.
8. **Audit visibility:** **Surfaced in the UI** — the account settings page
   shows the token's label, creation date, and human-readable last-used time.
   See Requirement 7.8.
9. **Multiple concurrent tokens per user:** **One active token at a time** —
   generating a new token revokes the previous one; this is final for v1, not a
   placeholder. See Requirement 7.3, Non-Goals.

## Dependency Map (informational)

```
User Management (this spec)
   ├── blocks Requirement 5 (chart ownership) — needs User.id to stamp/filter on
   ├── touched by Open Decision 2 (session strategy) before design.md can be written
   ├── touched by Open Decision 3 (email provider) before Requirement 3 can ship
   └── Requirement 8 (MCP enforcement) depends on Requirement 2 (session),
       Requirement 5 (ownership), and Requirement 7 (token issuance) landing
       first — a sequencing note, not a reason to split into a separate spec.
```
