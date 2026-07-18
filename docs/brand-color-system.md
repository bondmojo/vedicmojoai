# VedicMojoAI Brand Color System

## Philosophy

VedicMojoAI's visual identity is built on two complementary palettes rooted in Vedic symbolism:

- **Indigo (Brand Primary)** — Represents spiritual depth, cosmic wisdom, and the vastness of the night sky under which astrologers have read charts for millennia. Used as the dominant brand presence: navigation, interactive elements, period hierarchy (Mahadasha), and primary actions.

- **Gold (Brand Accent)** — Represents auspiciousness (shubh), prosperity (Lakshmi energy), and dharmic values. Used sparingly for emphasis: favorable indicators, primary houses, CTAs, and the Pratyantardasha period level.

**Design intent:** Premium, mystical but modern, data-rich but clean. Dark mode is the hero experience.

---

## Token Architecture

Three layers, each consuming the one above:

```
Layer 1: Raw Palette (globals.css)
  --brand-primary-{50..950}    Indigo scale (11 stops)
  --brand-accent-{50..950}     Gold scale (11 stops)
        |
        v
Layer 2: Semantic Tokens (globals.css)
  --color-favorable / -muted   Outcome states
  --color-period-md / -ad / -pd   Dasha hierarchy
  --color-planet-{sun..ketu}   Planet identification
  --color-sade-sati-*          Transit phases
  --color-role-*               House classification
        |
        v
Layer 3: Tailwind Utilities (tailwind.config.ts)
  bg-brand-500, text-gold-400, border-period-md
  text-favorable, bg-unfavorable-muted, etc.
```

All tokens use RGB triplet format (`R, G, B`) consumed via `rgb(var(...) / <alpha-value>)` enabling Tailwind opacity modifiers.

---

## Usage Guidelines

### When to use Brand Primary (Indigo)

| Element | Example Classes |
|---------|----------------|
| Navigation active state | `bg-brand-900/60`, `border-b-brand-500` |
| Primary buttons | `bg-brand-600 hover:bg-brand-500 text-white` |
| Selected/active items | `bg-brand-900/60` |
| Mahadasha period accents | `border-t-period-md`, `text-period-md` |
| Karaka role badges | `bg-period-md/20 text-period-md border-period-md/40` |
| Focus rings | `ring-brand-500/30` |

### When to use Brand Accent (Gold)

| Element | Example Classes |
|---------|----------------|
| Premium CTAs | `bg-gold-500 hover:bg-gold-400 text-gray-900` |
| Primary house chips | `bg-role-primary-bg text-role-primary-text border-role-primary-border` |
| Pratyantardasha accents | `border-t-period-pd`, `text-period-pd` |
| Auspicious indicators | `text-gold-400` |
| Section highlights | `border-l-4 border-l-gold-500` |

### When to use Semantic Tokens

| Context | Token Family |
|---------|-------------|
| Favorable outcomes | `text-favorable`, `bg-favorable-muted` |
| Unfavorable/danger | `text-unfavorable`, `bg-unfavorable-muted` |
| Caution/warning | `text-cautionary`, `bg-cautionary-muted` |
| Planet names in text | `text-planet-sun`, `text-planet-saturn`, etc. |
| Sade Sati callouts | `bg-sade-sati-peak-bg text-sade-sati-peak-text` |
| House role chips | `roleChipClass('primary')` from `lib/brandColors.ts` |

### Precedence Rule

When a UI element spans multiple categories (e.g., a gold-colored button that also indicates a favorable state), **functional purpose overrides decorative**. Use the semantic token for the function, not the palette color for decoration.

---

## Do / Don't

### Do

```tsx
// Use semantic tokens for planet colors
<span className="text-planet-jupiter">{planet}</span>

// Use intensity badge helper for scored periods
<span className={intensityBadgeClass(intensity, favorable)}>Score {score}</span>

// Use period tokens with opacity modifiers for pills
<span className="bg-period-md/20 text-period-md border border-period-md/40">MD</span>

// Use role tokens for house classification
<span className={roleChipClass('benefic')}>5th Aries</span>
```

### Don't

```tsx
// DON'T hardcode Tailwind palette colors for brand elements
<span className="text-indigo-500">Score</span>           // bad
<span className="bg-amber-900 text-amber-200">Primary</span>  // bad

// DON'T use hex values inline
<span style={{ color: '#5D6AF1' }}>Planet</span>         // bad

// DON'T mix dark/light token values manually
<span className="dark:text-green-300 text-green-800">OK</span>  // bad — use semantic token
<span className="text-favorable">OK</span>                      // good — auto-flips
```

---

## Complete Token Inventory

### Brand Primary Palette (Indigo)

| Stop | Dark Mode | Light Mode | Tailwind Class |
|------|-----------|------------|----------------|
| 50 | `#EEF0FF` | `#EEF0FF` | `bg-brand-50` |
| 100 | `#D7DBFE` | `#D7DBFE` | `bg-brand-100` |
| 200 | `#B7BEFD` | `#B7BEFD` | `bg-brand-200` |
| 300 | `#919BFA` | `#919BFA` | `bg-brand-300` |
| 400 | `#727DF6` | `#727DF6` | `bg-brand-400` |
| 500 | `#5D6AF1` | `#4F5AD5` | `bg-brand-500` |
| 600 | `#4952CD` | `#3F47B3` | `bg-brand-600` |
| 700 | `#3C42A8` | `#343994` | `bg-brand-700` |
| 800 | `#313583` | `#2A2E73` | `bg-brand-800` |
| 900 | `#282B66` | `#23265A` | `bg-brand-900` |
| 950 | `#1B1C43` | `#18193B` | `bg-brand-950` |

### Brand Accent Palette (Gold)

| Stop | Dark Mode | Light Mode | Tailwind Class |
|------|-----------|------------|----------------|
| 50 | `#FFFBEB` | `#FFFBEB` | `bg-gold-50` |
| 100 | `#FEF3C7` | `#FEF3C7` | `bg-gold-100` |
| 200 | `#FDE68A` | `#FDE68A` | `bg-gold-200` |
| 300 | `#FBD44D` | `#FBD44D` | `bg-gold-300` |
| 400 | `#F5BD2C` | `#F5BD2C` | `bg-gold-400` |
| 500 | `#D9A11C` | `#B4820F` | `bg-gold-500` |
| 600 | `#B27D0E` | `#94670A` | `bg-gold-600` |
| 700 | `#8E610A` | `#764F08` | `bg-gold-700` |
| 800 | `#734D0B` | `#603F09` | `bg-gold-800` |
| 900 | `#5E3E0C` | `#4E330A` | `bg-gold-900` |
| 950 | `#372208` | `#2E1C06` | `bg-gold-950` |

### Semantic Tokens

| Token | Dark Mode Hex | Light Mode Hex | Class |
|-------|--------------|----------------|-------|
| favorable | `#86EFAC` | `#166534` | `text-favorable` |
| favorable-muted | `#14532D` | `#DCFCE7` | `bg-favorable-muted` |
| unfavorable | `#FCA5A5` | `#991B1B` | `text-unfavorable` |
| unfavorable-muted | `#7F1D1D` | `#FEE2E2` | `bg-unfavorable-muted` |
| cautionary | `#FCD34D` | `#926208` | `text-cautionary` |
| cautionary-muted | `#78350F` | `#FEF3C7` | `bg-cautionary-muted` |
| period-md | `#5D6AF1` | `#4F5AD5` | `border-period-md` |
| period-ad | `#2DD4BF` | `#119484` | `border-period-ad` |
| period-pd | `#D9A11C` | `#B4820F` | `border-period-pd` |

### Planet Tokens

| Planet | Dark Mode Hex | Light Mode Hex | Class |
|--------|--------------|----------------|-------|
| Sun | `#FB923C` | `#C2580A` | `text-planet-sun` |
| Moon | `#CBD5E1` | `#334155` | `text-planet-moon` |
| Mars | `#F87171` | `#B91C1C` | `text-planet-mars` |
| Mercury | `#4ADE80` | `#15803D` | `text-planet-mercury` |
| Jupiter | `#FACC15` | `#A18207` | `text-planet-jupiter` |
| Venus | `#F472B6` | `#BE185D` | `text-planet-venus` |
| Saturn | `#60A5FA` | `#1E56A0` | `text-planet-saturn` |
| Rahu | `#9CA3AF` | `#4B5563` | `text-planet-rahu` |
| Ketu | `#C084FC` | `#7E3ABF` | `text-planet-ketu` |

---

## Component Patterns

### Score Badge

```tsx
import { intensityBadgeClass } from '@/lib/brandColors'

<span className={`text-xs px-3 py-1 rounded-full border font-medium ${intensityBadgeClass(period.intensity, period.favorable)}`}>
  {period.favorable ? 'Favorable' : 'Unfavorable'} · {period.intensity} · score {period.score}
</span>
```

### Period Level Card (Lord Card)

```tsx
import { LEVEL_STYLE, DEFAULT_LEVEL_STYLE, PLANET_COLORS } from '@/lib/brandColors'

const levelStyle = LEVEL_STYLE[driver.level] ?? DEFAULT_LEVEL_STYLE
const color = PLANET_COLORS[driver.lord] ?? 'text-ink'

<div className={`h-full ${levelStyle.bar} p-4 flex flex-col`}>
  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${levelStyle.pill}`}>
    {driver.level}
  </span>
  <span className={`text-base font-semibold ${color}`}>{driver.lord}</span>
</div>
```

### Planet Chip (Benefic/Malefic)

```tsx
import { planetChipClass } from '@/lib/brandColors'

<span className={`px-1.5 py-0.5 rounded border ${planetChipClass(aspect.benefic)}`}>
  {aspect.from}
</span>
```

### House Role Chip

```tsx
import { roleChipClass } from '@/lib/brandColors'

<span className={`text-[11px] px-1.5 py-0.5 rounded border ${roleChipClass(house.role)}`}>
  {ordinal(house.house)} {house.sign}
</span>
```

### Section Header with Gold Accent

```tsx
<h2 className="text-lg font-semibold text-ink">
  <span className="text-gold-500">Career</span> Analysis — Jan 2024 to Jun 2027
</h2>
```

---

## File Locations

| File | Purpose |
|------|---------|
| `app/globals.css` | All CSS custom property definitions (`:root` + `.dark`) |
| `tailwind.config.ts` | Tailwind color key registrations |
| `lib/brandColors.ts` | Shared color utility exports for components |
| `docs/brand-color-system.md` | This style guide |
