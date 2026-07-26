# Run Progress UI

- Group agents by wave (1–4) for visual hierarchy
- Show per-agent: status icon (pulse animation for running), token count, cost
- Show totals: tokens, cost, agents completed
- Halt state: red alert box with Override & Cancel buttons
- Terminal state: link to report viewer

## Token & Cost Display

- Format tokens with `.toLocaleString()` (e.g., `12,345`)
- Format cost with `.toFixed(4)` and `$` prefix
- Show per-agent breakdown + run totals
- Grid layout: 3 columns (Total Tokens | Estimated Cost | Agents Complete)
