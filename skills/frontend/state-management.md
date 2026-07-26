# State Management

- Local component state (`useState`) for UI state — no global store
- SSE-driven state: agents array, run status, cost totals
- Initial state loaded via `fetch` on mount, then SSE takes over
- No polling — SSE is the live update mechanism
