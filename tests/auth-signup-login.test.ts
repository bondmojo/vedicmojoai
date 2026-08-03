/**
 * tests/auth-signup-login.test.ts
 * Integration tests for POST /api/auth/signup and POST /api/auth/login.
 *
 * Mocks: @/lib/db (prisma.user) and @/lib/auth's session-cookie helpers.
 * @/lib/auth is mocked rather than exercised for real because it pulls in
 * next-auth, which has an ESM resolution issue with next/server under
 * Vitest's Node environment unrelated to this app's code.
 *
 * Key behavior under test: NFR-2 no-enumeration — login returns the exact
 * same generic 401 for "unknown email" and "wrong password".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth', () => ({
  SESSION_COOKIE_NAME: 'authjs.session-token',
  sessionCookieOptions: () => ({ httpOnly: true, sameSite: 'lax', path: '/', secure: false }),
  createUserSession: vi.fn().mockResolvedValue({
    sessionToken: 'fake-session-token',
    expires: new Date(Date.now() + 1000 * 60 * 60),
  }),
}))

import { POST as signup } from '../app/api/auth/signup/route'
import { POST as login } from '../app/api/auth/login/route'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/passwords'
import * as passwordsModule from '@/lib/passwords'

function makeRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.user.create as any).mockImplementation(({ data }: any) =>
    Promise.resolve({ id: 'new-user-1', ...data })
  )
})

describe('POST /api/auth/signup', () => {
  it('creates a new user and starts a session (201)', async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue(null)

    const res = await signup(makeRequest('/api/auth/signup', {
      email: 'New.User@Example.com',
      password: 'longenoughpassword',
    }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.user.email).toBe('new.user@example.com') // lower-cased
    expect(res.cookies.get('authjs.session-token')).toBeTruthy()
  })

  it('rejects a duplicate email with 409', async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue({ id: 'existing-1', email: 'taken@example.com' })

    const res = await signup(makeRequest('/api/auth/signup', {
      email: 'taken@example.com',
      password: 'longenoughpassword',
    }))

    expect(res.status).toBe(409)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('rejects a too-short password with 400', async () => {
    const res = await signup(makeRequest('/api/auth/signup', {
      email: 'new@example.com',
      password: 'short',
    }))

    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login — NFR-2 no-enumeration', () => {
  it('returns a generic 401 for an unknown email', async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue(null)

    const res = await login(makeRequest('/api/auth/login', {
      email: 'nobody@example.com',
      password: 'whatever123',
    }))

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.message).toBe('Invalid email or password.')
  })

  it('runs a dummy bcrypt compare on the unknown-email branch (no timing oracle)', async () => {
    // Without this, an unknown email would return before any bcrypt.compare,
    // while a wrong password on a real account pays the full compare cost —
    // a reliable latency-based enumeration oracle even though both responses
    // are byte-identical.
    const verifySpy = vi.spyOn(passwordsModule, 'verifyPassword')
    ;(prisma.user.findUnique as any).mockResolvedValue(null)

    await login(makeRequest('/api/auth/login', {
      email: 'nobody@example.com',
      password: 'whatever123',
    }))

    expect(verifySpy).toHaveBeenCalledTimes(1)
    verifySpy.mockRestore()
  })

  it('returns the IDENTICAL generic 401 for a wrong password on a real account', async () => {
    const passwordHash = await hashPassword('correct-password-123')
    ;(prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-1',
      email: 'real@example.com',
      passwordHash,
    })

    const res = await login(makeRequest('/api/auth/login', {
      email: 'real@example.com',
      password: 'wrong-password',
    }))

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.message).toBe('Invalid email or password.')
  })

  it('logs in successfully with correct credentials and sets a session cookie', async () => {
    const passwordHash = await hashPassword('correct-password-123')
    ;(prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-1',
      email: 'real@example.com',
      name: null,
      passwordHash,
    })

    const res = await login(makeRequest('/api/auth/login', {
      email: 'real@example.com',
      password: 'correct-password-123',
    }))

    expect(res.status).toBe(200)
    expect(res.cookies.get('authjs.session-token')).toBeTruthy()
  })
})
