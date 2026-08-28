# Accessibility

- Use semantic HTML (`<main>`, `<section>`, `<h1>`–`<h3>`)
- Status indicators: don't rely on color alone — use text labels alongside
- Form buttons: `disabled` state during loading with `cursor-not-allowed`
- Links: descriptive text (not "click here")
- Status badge component: maps status → color + readable text

## Validation must always say something

Never leave a blocked submission silent. Render the reason in a `role="alert"`
container: a red border alone is invisible to a screen-reader user and tells a sighted
user nothing about what to fix.

**Fields inside a collapsed `<details>` cannot carry native constraints.** Browser
constraint validation on a control that is not focusable aborts submission **without
firing the submit handler**, so the browser shows no bubble, the handler's message never
runs, and the button reads as broken. This is why the manual latitude/longitude inputs in
both birth-data forms have no `required` / `min` / `max` — the constraint lives in
`validateBirthLocation()` (`lib/place-form.ts`) instead. On failure the form must:

1. render the returned message in `role="alert"`, and
2. open the disclosure, so the fields the message names are visible and focusable.

Keep `onInvalid` on those inputs to reveal the disclosure if any residual native check
still fires. Do not "fix" the missing `required` attributes — see
`skills/frontend/form-patterns.md`.

## Combobox conventions (`PlacePicker`)

- Trigger carries `role="combobox"`, `aria-expanded`, and `aria-controls` pointing at the
  list only while open; its `aria-label` names the current selection.
- The in-flight row is a `role="status" aria-live="polite"` region — not a page-level
  progress bar — and the spinner glyph itself is `aria-hidden`.
- A correctable instruction (for example, the server reporting a query too short once
  punctuation is discounted) is announced as `role="status"` in muted text, not styled as
  an error: it is not a failure, and it must not be conveyed by colour.
- Settlement class renders as a text `Badge`, never a colour swatch.
- Data attribution stays visible in the footer rather than behind a tooltip.
