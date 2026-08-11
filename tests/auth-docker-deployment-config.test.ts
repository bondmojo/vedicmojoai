/**
 * tests/auth-docker-deployment-config.test.ts
 * Regression guard for a bug found via live testing of this repo's own
 * docker-compose stack: logging in succeeded (Session row created) but every
 * following request 401'd, because two independent cookie/host-trust
 * defaults silently diverged once NODE_ENV=production with no TLS proxy in
 * front (see .kiro/specs/user-management/design.md's "Self-hosted production
 * deployment" section for the full incident).
 *
 * lib/auth.ts can't safely be imported directly in this test environment —
 * it transitively pulls in next-auth, which has a documented ESM resolution
 * issue with next/server under Vitest (see tests/auth-signup-login.test.ts's
 * header comment). These are structural/source assertions instead of
 * behavioral ones, guarding the two specific invariants that broke:
 *   1. authConfig.useSecureCookies must be wired to the SAME env var that
 *      drives the app's own cookie name/attributes (not left for @auth/core
 *      to infer independently from request protocol).
 *   2. docker-compose.yml's app service must set AUTH_TRUST_HOST, since
 *      Auth.js only defaults trustHost=true outside NODE_ENV=production.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const authTs = readFileSync(join(__dirname, '../lib/auth.ts'), 'utf-8')
const dockerCompose = readFileSync(join(__dirname, '../docker-compose.yml'), 'utf-8')
const middlewareTs = readFileSync(join(__dirname, '../middleware.ts'), 'utf-8')

describe('lib/auth.ts — cookie security config', () => {
  it('computes useSecureCookies exactly once, from COOKIE_SECURE (not NODE_ENV)', () => {
    const matches = authTs.match(/const useSecureCookies\s*=\s*.+/g) ?? []
    expect(matches).toHaveLength(1)
    expect(matches[0]).toContain("process.env.COOKIE_SECURE === 'true'")
  })

  it('passes useSecureCookies into authConfig (so auth() and the manual cookie code agree)', () => {
    // authConfig's object literal contains nested braces (session:, callbacks:),
    // so just check the key appears within a reasonable window after the
    // object literal opens, rather than trying to bracket-match it exactly.
    const start = authTs.indexOf('export const authConfig = {')
    expect(start).toBeGreaterThan(-1)
    const configBlock = authTs.slice(start, start + 300)
    expect(configBlock).toContain('useSecureCookies,')
  })

  it('does not gate SESSION_COOKIE_NAME on NODE_ENV directly', () => {
    const cookieNameBlock = authTs.slice(authTs.indexOf('SESSION_COOKIE_NAME ='))
    expect(cookieNameBlock.slice(0, 100)).not.toContain("NODE_ENV")
  })
})

describe('middleware.ts — cookie name matches lib/auth.ts', () => {
  it('keys its own SESSION_COOKIE_NAME off COOKIE_SECURE, matching lib/auth.ts', () => {
    expect(middlewareTs).toContain("process.env.COOKIE_SECURE === 'true'")
    expect(middlewareTs).not.toContain("process.env.NODE_ENV === 'production'")
  })
})

describe('docker-compose.yml — auth env vars', () => {
  it('sets AUTH_TRUST_HOST for the app service (required once NODE_ENV=production)', () => {
    const appService = dockerCompose.slice(dockerCompose.indexOf('\n  app:'))
    expect(appService).toMatch(/AUTH_TRUST_HOST:\s*"true"/)
  })
})
