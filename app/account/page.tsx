/**
 * /account — account settings: log out, and MCP token management
 * (Requirement 7). Shows the active token's label/createdAt/lastUsedAt
 * (Decision 8) without ever re-displaying the raw value — a freshly
 * generated token is shown exactly once (reveal-once UX).
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface TokenMeta {
  label: string | null
  createdAt: string
  lastUsedAt: string | null
}

export default function AccountPage() {
  const router = useRouter()
  const [tokenMeta, setTokenMeta] = useState<TokenMeta | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true)
    try {
      const res = await fetch('/api/account/mcp-token')
      if (res.ok) {
        const data = await res.json()
        setTokenMeta(data.token)
      }
    } finally {
      setLoadingMeta(false)
    }
  }, [])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  const handleGenerate = async () => {
    setBusy(true)
    setError(null)
    setRevealedToken(null)
    try {
      const res = await fetch('/api/account/mcp-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || 'Failed to generate token.')
        return
      }
      setRevealedToken(data.token)
      await loadMeta()
    } finally {
      setBusy(false)
    }
  }

  const handleRevoke = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/account/mcp-token/revoke', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.message || 'Failed to revoke token.')
        return
      }
      setRevealedToken(null)
      await loadMeta()
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold">Account</h1>

        <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
          <button
            onClick={handleLogout}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-gray-600 transition-colors"
          >
            Log out
          </button>
        </section>

        <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">MCP Token</h2>
            <p className="text-sm text-gray-400 mt-1">
              Lets Claude Desktop authenticate to this app as you (see mcp/README.md).
              Only one active token at a time — generating a new one revokes the old one.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {revealedToken && (
            <div className="rounded-lg border border-amber-700 bg-amber-900/20 px-3 py-3 text-sm space-y-2">
              <p className="text-amber-200 font-medium">
                Copy this now — it won&apos;t be shown again.
              </p>
              <code className="block break-all rounded bg-gray-900 px-3 py-2 text-xs text-gray-200">
                {revealedToken}
              </code>
            </div>
          )}

          {loadingMeta ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : tokenMeta ? (
            <div className="text-sm text-gray-300 space-y-1">
              <p><span className="text-gray-500">Label:</span> {tokenMeta.label || '(none)'}</p>
              <p><span className="text-gray-500">Created:</span> {new Date(tokenMeta.createdAt).toLocaleString()}</p>
              <p>
                <span className="text-gray-500">Last used:</span>{' '}
                {tokenMeta.lastUsedAt ? new Date(tokenMeta.lastUsedAt).toLocaleString() : 'Never'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No active token.</p>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <input
              type="text"
              placeholder="Label (optional, e.g. laptop)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="flex-1 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
            <button
              onClick={handleGenerate}
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {tokenMeta ? 'Generate new token' : 'Generate token'}
            </button>
            {tokenMeta && (
              <button
                onClick={handleRevoke}
                disabled={busy}
                className="rounded-lg border border-red-800 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-900/30 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                Revoke
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
