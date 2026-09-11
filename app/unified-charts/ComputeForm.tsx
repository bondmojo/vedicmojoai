/**
 * ComputeForm — birth-data form for `/unified-charts` (Path A ingestion).
 *
 * Lives in its own module rather than inside `app/unified-charts/page.tsx`:
 * Next.js type-checks a page module's exports and rejects anything besides
 * `default` and its own reserved names (`metadata`, `generateMetadata`,
 * `dynamic`, …), so exporting this component from the page failed the build.
 * `app/unified-charts/page.test.tsx` imports it from here.
 */

'use client'

import { useState } from 'react'
import PlacePicker, { type SelectedPlace } from '../components/PlacePicker'
import { persistedPlaceFromSelection, validateBirthLocation } from '@/lib/place-form'

export default function ComputeForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '',
    date: '',
    time: '',
    timezone: '5.5',
    latitude: '',
    longitude: '',
    sunriseMode: 'precise' as 'precise' | 'jhora',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null)
  const [manualCoordinatesOpen, setManualCoordinatesOpen] = useState(false)

  function handlePlaceSelect(place: SelectedPlace): void {
    setSelectedPlace(place)
    setManualCoordinatesOpen(false)
    setForm({
      ...form,
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      timezone: '5.5',
    })
  }

  function handleManualCoordinateChange(
    coordinate: 'latitude' | 'longitude',
    value: string,
  ): void {
    setSelectedPlace(null)
    setForm({ ...form, [coordinate]: value })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    // Same contract as the Chart Computation form (`app/page.tsx`), via the same
    // shared validator. It runs here rather than as a `required` attribute
    // because the manual coordinate inputs sit inside a closed-by-default
    // disclosure, where a failed native constraint aborts submission without
    // ever firing this handler — leaving the button apparently inert.
    const location = validateBirthLocation({
      latitude: form.latitude,
      longitude: form.longitude,
      hasSelectedPlace: selectedPlace !== null,
    })
    if (!location.ok) {
      setError(location.message)
      // Reveal the fields the message names.
      setManualCoordinatesOpen(true)
      return
    }

    setSubmitting(true)

    // Stripped to the seven persisted display fields. Forwarding `selectedPlace`
    // verbatim would carry `latitude`/`longitude` into a `.strict()` Zod object
    // and 400 the whole save.
    const place = persistedPlaceFromSelection(selectedPlace)

    try {
      const res = await fetch('/api/unified-charts/from-compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          date: form.date,
          time: form.time,
          timezone: parseFloat(form.timezone),
          latitude: location.latitude,
          longitude: location.longitude,
          sunriseMode: form.sunriseMode,
          ...(place ? { place } : {}),
        }),
      })

      const data = await res.json()

      if (res.status === 201) {
        setSuccess(`Chart "${data.name}" created (${data.lagna} Lagna)`)
        setForm({ name: '', date: '', time: '', timezone: '5.5', latitude: '', longitude: '', sunriseMode: 'precise' })
        setSelectedPlace(null)
        setManualCoordinatesOpen(false)
        onSuccess()
      } else if (res.status === 409) {
        setError(`Duplicate: ${data.message}`)
      } else {
        setError(data.error || 'Failed to compute chart')
      }
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm text-gray-400 mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            placeholder="e.g., Ravi Kumar"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Birth Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Birth Time (24h)</label>
          <input
            type="time"
            step="1"
            value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
            required
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Timezone (hours)</label>
          <input
            type="number"
            step="0.5"
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            required
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            placeholder="5.5"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Sunrise Mode</label>
          <select
            value={form.sunriseMode}
            onChange={(e) => setForm({ ...form, sunriseMode: e.target.value as 'precise' | 'jhora' })}
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            <option value="precise">Precise (astronomical)</option>
            <option value="jhora">JHora (6 AM convention)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Birth Location</label>
          <PlacePicker
            value={selectedPlace}
            onSelect={handlePlaceSelect}
            onManualEntry={() => setManualCoordinatesOpen(true)}
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Resolved Coordinates</label>
          <output
            aria-live="polite"
            className="block min-h-10 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 font-mono text-sm text-gray-200"
          >
            {form.latitude && form.longitude
              ? `${form.latitude}, ${form.longitude}`
              : 'No coordinates selected'}
          </output>
          <details
            className="mt-2"
            open={manualCoordinatesOpen}
            onToggle={(event) => setManualCoordinatesOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-200">
              Enter coordinates manually
            </summary>
            {/*
              No `required`, `min` or `max`: these inputs are inside a disclosure
              that is closed by default, and a native constraint failure on an
              unfocusable control aborts submission without firing `onSubmit`, so
              no message ever reached the practitioner. `validateBirthLocation`
              owns the constraint now; `onInvalid` reveals the field if any
              residual native check (a browser's number-field `badInput`) still
              fires.
            */}
            <div className="mt-2 space-y-2">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Latitude</label>
                <input
                  type="number"
                  step="0.0000001"
                  value={form.latitude}
                  onChange={(e) => handleManualCoordinateChange('latitude', e.target.value)}
                  onInvalid={() => setManualCoordinatesOpen(true)}
                  className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 font-mono text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="28.6139000"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Longitude</label>
                <input
                  type="number"
                  step="0.0000001"
                  value={form.longitude}
                  onChange={(e) => handleManualCoordinateChange('longitude', e.target.value)}
                  onInvalid={() => setManualCoordinatesOpen(true)}
                  className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 font-mono text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="77.2090000"
                />
              </div>
            </div>
          </details>
        </div>
      </div>

      {/* role="alert" so a blocked submission is announced rather than conveyed
          by red text alone. */}
      {error && (
        <div role="alert" className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-lg bg-green-900/30 border border-green-700 p-3 text-green-400 text-sm">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? 'Computing...' : 'Compute & Save Chart'}
      </button>
    </form>
  )
}
