# Form Patterns

- Query type selection: toggle buttons with visual highlight (indigo border + bg)
- Multi-select uses state array; "full" selection clears others
- Agent preview: computed from `DOMAIN_AGENTS` map — shows user which agents will run
- Submission: POST to API, receive 202 + `runId`, redirect to progress page
- Error display: red box below form, cleared on next submit

## Birth-location fields (`PlacePicker` + `lib/place-form.ts`)

Both birth-data forms — `app/page.tsx` and the `ComputeForm` in
`app/unified-charts/page.tsx` — collect birth location the same way:

- `app/components/PlacePicker.tsx` is the shared combobox over `GET /api/places`
  (`Popover` + `Command`, `shouldFilter={false}` because ranking is server-side).
  It is presentation-only: `value` / `onSelect(place)` / `onManualEntry()` /
  `disabled`, and it never touches chart state. Debounced 250 ms with an
  `AbortController`; the hamlet toggle skips the debounce.
- Selecting a place fills the visible latitude/longitude and sets `timezone = '5.5'`.
  Manual coordinate inputs stay behind a `<details>` disclosure — the dataset is
  India-only, so hand entry is a first-class path, not a fallback.
- `lib/place-form.ts` is the single birth-location contract both forms use:
  `PersistedBirthPlace` + `isPersistedBirthPlace`, `persistedPlaceFromSelection`,
  `validateBirthLocation`, and the coordinate bounds. No React, no Prisma — it is
  unit-tested under the repo's node environment.

**Persist the stripped place, never the selection.** `persistedPlaceFromSelection()`
reduces a picker selection to exactly seven display fields before it goes into
`POST /api/unified-charts/from-compute`. That route validates `place` with a
`.strict()` schema, so forwarding the selection's `latitude`/`longitude` is a 400 that
rejects the whole save, not a lost label. Coordinates are top-level compute inputs.
Pass `expectedPlaceId` when the form keeps its own record of the current place (the home
page does); omit the option when the live selection is the only record (the
unified-charts form) — omitting it is not the same as passing `undefined`.

**Do not put `required` / `min` / `max` on inputs inside a collapsed disclosure.**
Browser constraint validation on a control that is not focusable aborts submission
**without firing the submit handler**, so the manual coordinate inputs with `required`
made the Compute button appear inert: no request, no message, nothing in the console.
Validate in JS instead:

```tsx
const location = validateBirthLocation({
  latitude: form.latitude,
  longitude: form.longitude,
  hasSelectedPlace: selectedPlace !== null,
})
if (!location.ok) {
  setError(location.message)      // rendered in a role="alert" container
  setManualCoordinatesOpen(true)  // reveal the fields the message names
  return
}
```

Keep `onInvalid={() => setManualCoordinatesOpen(true)}` on those inputs as
belt-and-braces for residual native checks (a browser's `badInput` on a number field).
