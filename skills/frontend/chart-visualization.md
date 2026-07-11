# Chart Visualization Components

Located in `app/compute/components/`:

| Component | Purpose |
|---|---|
| `NorthIndianChart.tsx` | Diamond-style Rashi chart |
| `SouthIndianChart.tsx` | South Indian square chart |
| `ChartGrid.tsx` | Multi-chart grid (D1–D60) |
| `DashaTimeline.tsx` | Visual dasha period timeline |
| `PlanetTable.tsx` | Planet positions/dignities table |
| `NakshatraTable.tsx` | Nakshatra analysis view |
| `KarakaTable.tsx` | Jaimini karaka assignments |
| `AshtakavargaView.tsx` | Bindhu scores display |
| `PindaStrengthView.tsx` | Pinda/Bala strength bars |
| `TransitsView.tsx` | Current transits overlay |

**Rules for chart components:**
- Accept typed props — no `any` or loose objects
- Use SVG for chart diagrams (not canvas)
- All chart types defined in `chartTypes.ts`
- Responsive: work at 300px–800px widths
