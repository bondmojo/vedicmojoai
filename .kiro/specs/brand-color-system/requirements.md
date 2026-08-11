# Requirements Document

## Introduction

This feature establishes a cohesive Indigo + Golden brand color system for VedicMojoAI — a Vedic astrology SaaS platform. The brand palette conveys spiritual depth and wisdom (indigo) alongside auspiciousness and prosperity (gold/golden), aligning with the platform's dharmic identity.

The system introduces brand color tokens as CSS custom properties, creates semantic color tokens for domain-specific UI elements (planet classification, favorable/unfavorable states, dasha period levels, intensity indicators), refactors the DurationComputationResults component to consume these tokens, and provides a style guide for consistent brand application across the entire application.

## Glossary

- **Brand_Color_System**: The complete set of CSS custom properties, Tailwind color definitions, and usage guidelines that define VedicMojoAI's visual identity through indigo and golden hues.
- **Color_Token**: A named CSS custom property (e.g. `--brand-primary-500`) that maps to a specific color value, enabling centralized management and theme-aware rendering.
- **Semantic_Token**: A Color_Token whose name describes its purpose rather than its hue (e.g. `--color-favorable`, `--color-period-md`), allowing the underlying color to change without updating consuming code.
- **Brand_Primary_Palette**: The indigo-based color scale (50–950) serving as the primary brand identity color, used for interactive elements, navigation accents, and primary actions.
- **Brand_Accent_Palette**: The golden/amber-based color scale (50–950) serving as the secondary brand accent, used for highlights, auspicious indicators, premium elements, and call-to-action emphasis.
- **Domain_Color_Token**: A Semantic_Token scoped to Vedic astrology domain concepts — planet classification, dasha period levels, favorability states, and transit indicators.
- **DurationComputationResults**: The React component (`app/components/DurationComputationResults.tsx`) that renders scored dasha sub-periods, drivers panels, transit overlays, and supporting chart data for the Duration Analyser tab.
- **Theme_Mode**: The active visual mode (light or dark), toggled by `next-themes` via the `.dark` class on `<html>`, with dark as the default.
- **Style_Guide**: A documented set of color usage patterns, component examples, and do/don't guidelines ensuring consistent brand application by contributors.

## Requirements

### Requirement 1: Brand Primary Palette Definition

**User Story:** As a developer, I want a named indigo brand-primary color scale defined as CSS custom properties, so that all components reference a single source of truth for the primary brand color.

#### Acceptance Criteria

1. THE Brand_Color_System SHALL define CSS custom properties `--brand-primary-50` through `--brand-primary-950` (steps: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950) in `globals.css` under both `:root` and `.dark` selectors, with each value expressed as a space-separated RGB channel triplet (e.g., `99 102 241`) compatible with the `rgb(var(...) / <alpha-value>)` compositing pattern used by the existing gray and slate scales.
2. WHEN Theme_Mode is dark, THE Brand_Color_System SHALL resolve `--brand-primary-500` to an indigo value (HSL hue between 225 and 245 inclusive) with a minimum WCAG AA contrast ratio of 4.5:1 for text against the `--color-gray-900` background.
3. WHEN Theme_Mode is light, THE Brand_Color_System SHALL resolve `--brand-primary-500` to an indigo value (HSL hue between 225 and 245 inclusive) with a minimum WCAG AA contrast ratio of 4.5:1 for text against the `--color-gray-950` background.
4. THE Brand_Color_System SHALL register a `brand` color key in `tailwind.config.ts` with sub-keys 50–950, each resolving through the corresponding `--brand-primary-*` CSS variable using the existing `themedColor` helper function.
5. THE Brand_Color_System SHALL define all 11 stops in both `:root` and `.dark` selectors such that luminance decreases monotonically from step 50 (lightest) to step 950 (darkest) within each theme mode.

### Requirement 2: Brand Accent Palette Definition

**User Story:** As a developer, I want a named golden/amber brand-accent color scale defined as CSS custom properties, so that all components reference a single source of truth for the accent brand color.

#### Acceptance Criteria

1. THE Brand_Color_System SHALL define CSS custom properties `--brand-accent-50` through `--brand-accent-950` (steps: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950 — 11 tokens total) in `globals.css` under both `:root` and `.dark` selectors, with each value specified as a space-separated RGB triplet (e.g., `210 160 60`).
2. WHEN Theme_Mode is dark, THE Brand_Color_System SHALL resolve `--brand-accent-500` to a warm golden hue (HSL hue 35–50°) with a minimum WCAG AA contrast ratio of 4.5:1 for normal text against the `--color-gray-900` background value.
3. WHEN Theme_Mode is light, THE Brand_Color_System SHALL resolve `--brand-accent-500` to a warm golden hue (HSL hue 35–50°) with a minimum WCAG AA contrast ratio of 4.5:1 for normal text against a `#ffffff` background.
4. THE Brand_Color_System SHALL register a `gold` color key in `tailwind.config.ts` with sub-keys 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, and 950, each resolving through the corresponding `--brand-accent-*` CSS variable using the `rgb(var(--brand-accent-<step>) / <alpha-value>)` pattern.
5. IF any `--brand-accent-*` CSS custom property is referenced but not defined for the active theme mode, THEN THE Brand_Color_System SHALL fall back to the `:root` (light) value rather than producing an invalid or transparent color.
6. THE Brand_Color_System SHALL ensure that the 11-step palette progresses monotonically in perceptual lightness — `--brand-accent-50` being the lightest (L* ≥ 90 in CIELAB) and `--brand-accent-950` being the darkest (L* ≤ 15 in CIELAB) — so that numeric ordering reliably indicates contrast hierarchy.

### Requirement 3: Semantic Tokens for Favorability States

**User Story:** As a developer, I want semantic color tokens for favorable and unfavorable states, so that domain-specific components convey astrological outcomes using brand-aligned colors without hardcoding hex values.

#### Acceptance Criteria

1. THE Brand_Color_System SHALL define semantic CSS custom properties `--color-favorable`, `--color-favorable-muted`, `--color-unfavorable`, `--color-unfavorable-muted`, `--color-cautionary`, and `--color-cautionary-muted` in `globals.css` under both `:root` and `.dark` selectors, using the existing RGB triplet format (e.g., `R G B`) consistent with the project's `--color-gray-*` and `--color-ink` conventions.
2. WHEN a scored period has `favorable === true`, THE DurationComputationResults component SHALL apply `--color-favorable` for text color, `--color-favorable-muted` for background color, and a corresponding border derived from the favorable token family, replacing hardcoded `text-green-300`, `bg-green-900`, and `border-green-700` classes.
3. WHEN a scored period has `favorable === false` AND `intensity === 'high'`, THE DurationComputationResults component SHALL apply `--color-unfavorable` for text color, `--color-unfavorable-muted` for background color, and a corresponding border derived from the unfavorable token family, replacing hardcoded `text-red-300`, `bg-red-900`, and `border-red-700` classes.
4. WHEN a scored period has `favorable === false` AND `intensity` is `'medium'` or `'low'`, THE DurationComputationResults component SHALL apply `--color-cautionary` for text color, `--color-cautionary-muted` for background color, and a corresponding border derived from the cautionary token family, replacing hardcoded `text-amber-300`, `bg-amber-900`, and `border-amber-700` classes.
5. THE Brand_Color_System SHALL ensure that text rendered using `--color-favorable`, `--color-unfavorable`, and `--color-cautionary` tokens meets a minimum contrast ratio of 4.5:1 against its corresponding `*-muted` background in both `:root` and `.dark` themes.
6. THE Brand_Color_System SHALL register the six semantic tokens as named Tailwind colors in `tailwind.config.ts` so that utility classes (e.g., `text-favorable`, `bg-favorable-muted`) are available project-wide without inline `rgb(var(...))` expressions in component code.

### Requirement 4: Semantic Tokens for Dasha Period Levels

**User Story:** As a developer, I want semantic color tokens for MD, AD, and PD period levels, so that the dasha hierarchy is visually distinct using brand-aligned colors and any color changes propagate automatically.

#### Acceptance Criteria

1. THE Brand_Color_System SHALL define semantic CSS custom properties `--color-period-md`, `--color-period-ad`, and `--color-period-pd` in `globals.css` under both `:root` and `.dark` selectors, where each property value uses the same channel format (RGB triplet) already established by the existing `--color-*` variables in that file.
2. THE Brand_Color_System SHALL assign the MD (Mahadasha) token (`--color-period-md`) a value from the indigo family (Brand_Primary_Palette) such that in both light and dark themes the MD accent meets a minimum WCAG 2.1 contrast ratio of 3:1 against its adjacent card background (`--card` surface).
3. THE Brand_Color_System SHALL assign the AD (Antardasha) token (`--color-period-ad`) a hue at least 30° apart on the HSL color wheel from both the MD and PD token hues, ensuring the three period levels are distinguishable without relying solely on color (the existing level label text "MD"/"AD"/"PD" in the pill satisfies the non-color differentiator).
4. THE Brand_Color_System SHALL assign the PD (Pratyantardasha) token (`--color-period-pd`) a value from the golden family (Brand_Accent_Palette) such that in both light and dark themes the PD accent meets a minimum WCAG 2.1 contrast ratio of 3:1 against its adjacent card background (`--card` surface).
5. WHEN the `LEVEL_STYLE` constant in the DurationComputationResults component is rendered, THE DurationComputationResults component SHALL reference the CSS custom properties `--color-period-md`, `--color-period-ad`, and `--color-period-pd` for the border-top accent color and pill background color of each period level, replacing the current hardcoded Tailwind utility classes (`border-t-indigo-500`/`bg-indigo-900`, `border-t-teal-500`/`bg-teal-900`, `border-t-fuchsia-500`/`bg-fuchsia-900`).
6. IF a `--color-period-*` CSS custom property is undefined or fails to resolve, THEN THE DurationComputationResults component SHALL fall back to the existing `DEFAULT_LEVEL_STYLE` (gray border and gray pill) so that the UI remains readable.
7. THE Brand_Color_System SHALL derive pill background and pill text colors for each period level from the same `--color-period-*` token (e.g., using opacity modifiers or computed tints) rather than introducing additional independent tokens for pill-bg and pill-text per level, keeping the total new custom properties to at most 3 (one per period level).

### Requirement 5: Semantic Tokens for Planet Classification

**User Story:** As a developer, I want semantic color tokens for each planet, so that planet names are consistently color-coded across all views without scattering raw color literals through components.

#### Acceptance Criteria

1. THE Brand_Color_System SHALL define Semantic_Tokens `--color-planet-sun`, `--color-planet-moon`, `--color-planet-mars`, `--color-planet-mercury`, `--color-planet-jupiter`, `--color-planet-venus`, `--color-planet-saturn`, `--color-planet-rahu`, and `--color-planet-ketu` as RGB triplet custom properties in `globals.css` under both the `:root` selector (light-mode values) and the `.dark` selector (dark-mode values), where each value achieves a minimum WCAG AA contrast ratio of 4.5:1 against the theme's surface color (`--background`).
2. WHEN a component renders a planet name in text, THE component SHALL apply the planet color exclusively via the corresponding Semantic_Token and SHALL NOT use hardcoded Tailwind color classes (e.g. `text-orange-400`) for planet identification.
3. THE DurationComputationResults component SHALL replace the `PLANET_COLORS` constant's hardcoded Tailwind color classes with references to the planet Semantic_Tokens.
4. WHEN Theme_Mode changes between light and dark, THE planet Semantic_Tokens SHALL resolve to their respective theme-appropriate values automatically via the `:root` / `.dark` cascade, requiring zero component code changes to maintain readable contrast.
5. IF a planet name is not found in the set of nine Navagraha tokens, THEN the component SHALL fall back to the existing `text-ink` utility class rather than rendering unstyled text.

### Requirement 6: Semantic Tokens for Transit and Sade Sati Indicators

**User Story:** As a developer, I want semantic color tokens for Sade Sati phases and transit states, so that these astrological indicators use brand-coherent colors and dark/light compatibility without per-component hardcoding.

#### Acceptance Criteria

1. THE Brand_Color_System SHALL define semantic CSS custom properties in `globals.css` under both `:root` and `.dark` selectors for each Sade Sati phase, providing three tokens per phase — border, background, and text — following the naming convention `--color-sade-sati-{phase}-{role}` (where phase is `rising`, `peak`, or `setting` and role is `border`, `bg`, or `text`), resulting in nine total tokens.
2. THE DurationComputationResults component SHALL replace the hardcoded Tailwind color classes in the `SADE_SATI_STYLE` constant with Tailwind utility classes that resolve through the Sade Sati semantic tokens defined in `globals.css`, following the same `rgb(var(...))` consumption pattern used by the existing `--color-gray-*` and `--color-ink` tokens.
3. THE Brand_Color_System SHALL assign `--color-sade-sati-peak-*` tokens values from the red/warm color family to preserve the existing high-severity visual meaning of the peak phase, and both `:root` and `.dark` values SHALL produce a minimum WCAG 2.1 contrast ratio of 4.5:1 between the text token and the background token for that phase.
4. WHEN the application renders in light mode, THE Brand_Color_System SHALL provide `:root` values for all nine Sade Sati tokens that maintain the same phase-to-color-family mapping (rising→amber/warm, peak→red/danger, setting→blue/cool) while ensuring text remains legible against the background token at WCAG AA contrast (4.5:1 minimum).

### Requirement 7: Semantic Tokens for Role Classification

**User Story:** As a developer, I want semantic color tokens for house role classification (primary, benefic, malefic), so that role chips use a unified, brand-aware color vocabulary.

#### Acceptance Criteria

1. THE Brand_Color_System SHALL define semantic token sets for each HouseRole value (`primary`, `benefic`, `malefic`, `neutral`) in `globals.css` under both `:root` and `.dark` selectors, where each role token set comprises three CSS custom properties: `--color-role-{role}-bg`, `--color-role-{role}-text`, and `--color-role-{role}-border`.
2. WHEN the token value format is chosen, THE Brand_Color_System SHALL use the same RGB triplet format (`R G B`) already used by the `--color-gray-*` and `--color-slate-*` scales in `globals.css`, so that tokens can be consumed via `rgb(var(--color-role-{role}-bg))` consistently with the existing pattern.
3. THE DurationComputationResults component SHALL reference the role semantic token CSS custom properties for the `roleChipClass` function instead of hardcoded Tailwind utility class combinations (`amber-900`/`emerald-900`/`red-900`/`gray-800`), applying the `-bg`, `-text`, and `-border` tokens for all four HouseRole values including the `neutral` default case.
4. THE Brand_Color_System SHALL assign `--color-role-primary-bg`, `--color-role-primary-text`, and `--color-role-primary-border` values in the golden/amber hue range (hue 35–50) to reinforce the concept of primacy and auspiciousness, maintaining a minimum WCAG AA contrast ratio of 4.5:1 between the `-text` and `-bg` values.
5. IF the `:root` (light mode) and `.dark` selectors require different token values to maintain legible contrast against their respective page backgrounds, THEN THE Brand_Color_System SHALL define distinct values under each selector; otherwise the same values SHALL be used in both selectors.

### Requirement 8: Tailwind Configuration Integration

**User Story:** As a developer, I want the brand and semantic tokens accessible as first-class Tailwind utilities, so that I can use them with standard class syntax (`bg-brand-500`, `text-gold-400`, `border-period-md`) and opacity modifiers.

#### Acceptance Criteria

1. THE Brand_Color_System SHALL extend the `tailwind.config.ts` `extend.colors` block to include a `brand` key with shades 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, and 950, a `gold` key with shades 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, and 950, and semantic shorthand keys `favorable`, `unfavorable`, `period-md`, `period-ad`, and `period-pd`, each referencing its corresponding CSS custom property via the existing `themedColor` helper.
2. THE Brand_Color_System SHALL support Tailwind opacity modifiers (e.g. `bg-brand-500/20`, `text-gold-400/50`) for every brand, gold, and semantic color token by using the `<alpha-value>` placeholder pattern in each token's value definition.
3. THE Brand_Color_System SHALL preserve all existing color definitions in `extend.colors` — including `ink`, `gray` (50–950), `slate` (50–950), `border`, `input`, `ring`, `background`, `foreground`, `primary`, `secondary`, `destructive`, `muted`, `accent`, `popover`, and `card` — without modification, removal, or reordering.
4. WHEN the Tailwind configuration is compiled, THE Brand_Color_System SHALL produce valid utility classes for all new tokens such that `bg-brand-{shade}`, `text-brand-{shade}`, `border-brand-{shade}`, `bg-gold-{shade}`, `text-gold-{shade}`, `border-gold-{shade}`, `bg-favorable`, `text-unfavorable`, `border-period-md`, `bg-period-ad`, and `text-period-pd` each resolve to a non-empty CSS declaration.
5. IF a referenced CSS custom property is undefined at runtime, THEN THE Brand_Color_System SHALL render the element with a transparent color rather than causing a build error or producing invalid CSS output.

### Requirement 9: DurationComputationResults Refactoring

**User Story:** As a developer, I want the DurationComputationResults component to exclusively use semantic brand tokens for its color-coded elements, so that the component is maintainable and visually consistent with the brand system.

#### Acceptance Criteria

1. WHEN the refactoring is complete, THE DurationComputationResults component SHALL contain zero hardcoded Tailwind palette color classes (amber, red, emerald, green, indigo, teal, fuchsia, orange, blue, yellow, pink, purple) in the following constructs: `PLANET_COLORS`, `SADE_SATI_STYLE`, `LEVEL_STYLE`, `roleChipClass`, `intensityBadgeClass`, `planetChipClass`, `shadbalaGrade`, and all inline color classes within `TransitCallouts`, `FactorBreakdown`, `DomainContextHeader`, `LordCard`, and `DomainHouseCard`; each SHALL instead reference a CSS-variable-backed semantic token defined in `tailwind.config.ts` and `globals.css`.
2. WHEN the component renders in dark mode (`.dark` class on `<html>`), THE DurationComputationResults component SHALL produce pixel-identical output to the pre-refactoring rendering for planet text colors, badge backgrounds, border colors, LEVEL_STYLE bar accents, and Sade Sati callout styling.
3. WHEN the component renders in light mode (no `.dark` class on `<html>`), THE DurationComputationResults component SHALL resolve every semantic token to its `:root` CSS variable value, producing sufficient contrast (WCAG AA minimum 4.5:1 for text, 3:1 for UI components) against the light-mode surface colors.
4. IF a semantic token CSS variable is undefined (not declared in the active theme's `:root` or `.dark` block), THEN THE DurationComputationResults component SHALL fall back to the `gray` scale tokens (`text-gray-400` for text, `bg-gray-800` for backgrounds, `border-gray-700` for borders) so that all color-coded elements remain legible.
5. WHEN new semantic token CSS variables are added to `globals.css` and `tailwind.config.ts`, THE token naming convention SHALL follow the pattern `--color-{category}-{variant}` (e.g., `--color-planet-sun`, `--color-period-md`) with both `:root` (light) and `.dark` values declared for each token, and a corresponding Tailwind color key registered via the existing `themedColor()` helper.
6. IF the component file contains more than 6 distinct color-mapping objects or functions after refactoring, THEN THE semantic token lookup helpers SHALL be extracted into a single shared utility file imported by `DurationComputationResults.tsx`, so that the component's net line count does not increase by more than 20 lines compared to the pre-refactoring baseline.

### Requirement 10: Dark and Light Mode Compatibility

**User Story:** As a developer, I want all brand and semantic tokens to have appropriate values for both dark and light Theme_Modes, so that the brand identity is cohesive regardless of the user's theme preference.

#### Acceptance Criteria

1. THE Brand_Color_System SHALL define values for every brand and semantic token under both `:root` (light) and `.dark` selectors in `globals.css`, such that no CSS custom property referenced by a component resolves to an undefined or empty value in either mode.
2. WHILE Theme_Mode is dark, THE Brand_Color_System SHALL assign token lightness values that produce foreground text at or above 80% relative luminance on surfaces at or below 15% relative luminance (consistent with the existing inverted-scale approach).
3. WHILE Theme_Mode is light, THE Brand_Color_System SHALL assign token lightness values that produce foreground text at or below 30% relative luminance on surfaces at or above 90% relative luminance.
4. THE Brand_Color_System SHALL maintain minimum WCAG AA contrast ratio (4.5:1 for normal text sized below 18.66px bold or 24px regular, 3:1 for text at or above those thresholds and for non-text UI components) for all designated foreground/background token pairings in both modes.
5. IF a brand or semantic token is added to one Theme_Mode selector but omitted from the other, THEN THE Brand_Color_System SHALL treat this as a build-time or lint-time error, preventing deployment with an incomplete token set.

### Requirement 11: Style Guide Documentation

**User Story:** As a contributor, I want a documented style guide for the brand color system, so that new components and future development consistently apply the brand identity without guesswork.

#### Acceptance Criteria

1. THE Style_Guide SHALL document the brand color philosophy — stating the semantic meaning of each primary palette (indigo = spiritual depth/wisdom, gold = auspiciousness/prosperity), its rationale rooted in Vedic astrology symbolism, and the intended emotional response for end users — in a markdown file located in the project `docs/` folder or `.kiro/steering/` directory.
2. THE Style_Guide SHALL provide usage guidelines specifying which palette (primary vs accent) to use for each UI element category: navigation, primary actions, data visualization, status indicators, and decorative accents. WHERE a UI element spans multiple categories, THE Style_Guide SHALL state a precedence rule (e.g., functional purpose overrides decorative).
3. THE Style_Guide SHALL include a "do/don't" section containing at least 3 "do" examples (correct token usage with Tailwind class names) and at least 3 "don't" examples (antipatterns including hardcoded hex values, arbitrary Tailwind palette colors for brand elements, and mixing tokens across dark/light contexts).
4. THE Style_Guide SHALL list the complete token inventory — defined as every CSS custom property or Tailwind theme extension key representing a brand color — with its hex value for both dark and light modes displayed together per token.
5. THE Style_Guide SHALL document component patterns for the following UI elements: score badges, period cards, planet chips, status indicators, and section headers. Each pattern SHALL specify the exact token names to apply, the Tailwind utility classes used, and at minimum one code snippet showing correct implementation with shadcn/ui primitives.
