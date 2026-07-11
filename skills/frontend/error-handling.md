# Error Handling in UI

- Network errors: show user-friendly message, suggest retry
- 404s: use `notFound()` from `next/navigation` (Server Components)
- Invalid states: defensive rendering — check `null` before accessing nested data
- Loading states: centered gray text ("Loading run...", "Loading chart...")
