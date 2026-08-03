/**
 * POST /api/auth/logout — end the current session.
 */

import { NextRequest, NextResponse } from 'next/server'
import { destroySessionByToken, SESSION_COOKIE_NAME } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value

  if (sessionToken) {
    await destroySessionByToken(sessionToken).catch(() => {
      // Session row already gone (expired/cleaned up) — still clear the cookie.
    })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}
