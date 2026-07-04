/**
 * /charts/new — Submit a new chart (Client Component)
 * Accepts ChartInputV1 JSON via paste or file upload.
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewChartPage() {
  const router = useRouter()
  const [jsonInput, setJsonInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setWarnings([])
    setLoading(true)

    try {
      // Validate JSON locally first
      let parsed
      try {
        parsed = JSON.parse(jsonInput)
      } catch {
        setError('Invalid JSON. Please check your input.')
        setLoading(false)
        return
      }

      const res = await fetch('/api/charts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })

      const data = await res.json()

      if (res.status === 201) {
        if (data.warnings?.length > 0) {
          setWarnings(data.warnings)
          // Brief delay to show warnings before redirect
          setTimeout(() => router.push(`/charts/${data.id}`), 2000)
        } else {
          router.push(`/charts/${data.id}`)
        }
      } else if (res.status === 409) {
        // Duplicate — offer to use existing
        setError(`${data.message}`)
        // Could add a button to navigate to existing chart
      } else {
        setError(data.error || 'Submission failed')
        if (data.fieldErrors) setFieldErrors(data.fieldErrors)
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    setJsonInput(text)
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Submit New Chart</h1>
        <p className="text-gray-400 mb-6">
          Paste or upload a ChartInputV1 JSON file. The chart will be validated
          against the schema before submission.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* File upload */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Upload .json file
            </label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 file:cursor-pointer"
            />
          </div>

          {/* JSON textarea */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Or paste JSON directly
            </label>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              rows={20}
              className="w-full rounded-lg bg-gray-900 border border-gray-700 p-4 text-sm font-mono text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder='{"meta": {"client_name": "...", "birth_datetime": "...", ...}}'
            />
          </div>

          {/* Error display */}
          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-700 p-4">
              <p className="text-red-400 font-medium">{error}</p>
              {Object.keys(fieldErrors).length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-red-300">
                  {Object.entries(fieldErrors).map(([field, errors]) => (
                    <li key={field}>
                      <span className="font-mono text-red-400">{field}</span>: {errors.join(', ')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Warnings display */}
          {warnings.length > 0 && (
            <div className="rounded-lg bg-amber-900/30 border border-amber-700 p-4">
              <p className="text-amber-400 font-medium mb-2">Chart submitted with warnings:</p>
              <ul className="space-y-1 text-sm text-amber-300">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !jsonInput.trim()}
            className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Validating...' : 'Submit Chart'}
          </button>
        </form>
      </div>
    </main>
  )
}
