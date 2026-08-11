# Implementation Plan: Brand Color System

## Overview

Establishes a two-palette brand color system (Indigo primary + Golden accent) for VedicMojoAI, layered as: raw palette CSS vars → semantic domain tokens → Tailwind utilities. Implementation is ordered for safe incremental delivery — tokens first (additive, no breaking changes), then refactoring the DurationComputationResults component to consume tokens, then tests and documentation last.

## Tasks

- [ ] 1. Define brand palette CSS custom properties in globals.css
  - [ ] 1.1 Add brand-primary (indigo) palette tokens to globals.css
    - Add `--brand-primary-50` through `--brand-primary-950` (11 stops) under both `:root` and `.dark` selectors
    - Use exact RGB triplet values from design (e.g., dark `--brand-primary-500: 93 106 241`)
    - Place after existing `--color-slate-*` block
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 10.1_

  - [ ] 1.2 Add brand-accent (gold) palette tokens to globals.css
    - Add `--brand-accent-50` through `--brand-accent-950` (11 stops) under both `:root` and `.dark` selectors
    - Use exact RGB triplet values from design (e.g., dark `--brand-accent-500: 217 161 28`)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 10.1_

  - [ ] 1.3 Add semantic favorability tokens to globals.css
    - Add `--color-favorable`, `--color-favorable-muted`, `--color-unfavorable`, `--color-unfavorable-muted`, `--color-cautionary`, `--color-cautionary-muted` under both `:root` and `.dark`
    - Use design values (e.g., dark favorable: `134 239 172`, favorable-muted: `20 83 45`)
    - _Requirements: 3.1, 3.5, 10.1_

  - [ ] 1.4 Add semantic period-level tokens to globals.css
    - Add `--color-period-md`, `--color-period-ad`, `--color-period-pd` under both `:root` and `.dark`
    - MD = indigo (93 106 241 / 79 90 213), AD = teal (45 212 191 / 17 148 132), PD = gold (217 161 28 / 180 130 15)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.7, 10.1_

  - [ ] 1.5 Add semantic planet tokens to globals.css
    - Add `--color-planet-sun` through `--color-planet-ketu` (9 tokens) under both `:root` and `.dark`
    - Use design RGB values per planet
    - _Requirements: 5.1, 5.4, 10.1_

  - [ ] 1.6 Add semantic Sade Sati phase tokens to globals.css
    - Add 9 tokens: `--color-sade-sati-{rising|peak|setting}-{border|bg|text}` under both `:root` and `.dark`
    - Use design RGB values for each phase/role combination
    - _Requirements: 6.1, 6.3, 6.4, 10.1_

  - [ ] 1.7 Add semantic role tokens to globals.css
    - Add 12 tokens: `--color-role-{primary|benefic|malefic|neutral}-{bg|text|border}` under both `:root` and `.dark`
    - Primary role uses golden/amber hue per design
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 10.1_

- [ ] 2. Extend Tailwind configuration with brand color keys
  - [ ] 2.1 Register brand and gold palette keys in tailwind.config.ts
    - Add `brand` key (50–950) using `themedColor("--brand-primary-*")`
    - Add `gold` key (50–950) using `themedColor("--brand-accent-*")`
    - Place after existing `slate` key, preserving all existing colors
    - _Requirements: 1.4, 2.4, 8.1, 8.2, 8.3_

  - [ ] 2.2 Register semantic color shorthand keys in tailwind.config.ts
    - Add favorability keys: `favorable`, `favorable-muted`, `unfavorable`, `unfavorable-muted`, `cautionary`, `cautionary-muted`
    - Add period keys: `period-md`, `period-ad`, `period-pd`
    - Add planet keys: `planet-sun` through `planet-ketu`
    - Add Sade Sati keys: `sade-sati-{phase}-{role}` (9 keys)
    - Add role keys: `role-{role}-{property}` (12 keys)
    - All using `themedColor()` helper
    - _Requirements: 3.6, 8.1, 8.4, 8.5_

- [ ] 3. Checkpoint - Verify token layer compiles
  - Ensure all tests pass, ask the user if questions arise.
  - Run `npx tailwindcss --content ./app/**/*.tsx --output /dev/null` or equivalent to verify no build errors
  - Confirm existing `gray`, `slate`, `ink` keys untouched

- [ ] 4. Create shared brand color utility file
  - [ ] 4.1 Create `lib/brandColors.ts` with extracted color-mapping constructs
    - Export `PLANET_COLORS` record using semantic token classes (`text-planet-sun`, etc.)
    - Export `LEVEL_STYLE` record using period token classes with opacity modifiers
    - Export `SADE_SATI_STYLE` record using sade-sati token classes
    - Export `roleChipClass(role: HouseRole): string` using role token classes
    - Export `intensityBadgeClass(intensity: string, favorable: boolean): string` using favorability tokens
    - Export `shadbalaGrade(ratio: number): { label: string; className: string }` using brand tokens
    - Export `planetChipClass(benefic: boolean): string` using role tokens
    - Export `DEFAULT_LEVEL_STYLE` fallback constant (gray-based)
    - Include fallback for unknown planet names (`?? 'text-ink'`)
    - _Requirements: 9.1, 9.4, 9.5, 9.6, 5.5, 4.6_

- [ ] 5. Refactor DurationComputationResults to consume tokens
  - [ ] 5.1 Replace color-mapping constructs in DurationComputationResults.tsx
    - Remove local `PLANET_COLORS`, `SADE_SATI_STYLE`, `LEVEL_STYLE` constants
    - Remove local `roleChipClass`, `intensityBadgeClass` functions
    - Import all from `@/lib/brandColors`
    - Ensure no hardcoded palette classes remain in the 6 refactored constructs
    - _Requirements: 9.1, 9.2, 9.6, 3.2, 3.3, 3.4, 4.5, 5.2, 5.3, 6.2_

  - [ ] 5.2 Replace inline hardcoded color classes in component JSX
    - Audit `TransitCallouts`, `FactorBreakdown`, `DomainContextHeader`, `LordCard`, `DomainHouseCard` sections
    - Replace any remaining hardcoded Tailwind palette colors with semantic token utilities
    - Verify net line count does not increase by more than 20 lines
    - _Requirements: 9.1, 9.3_

- [ ] 6. Checkpoint - Verify refactoring renders correctly
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm dark-mode rendering is pixel-identical to pre-refactoring
  - Confirm light-mode rendering has adequate contrast

- [ ] 7. Add property-based tests for color token correctness
  - [ ]* 7.1 Write property test for monotonic perceptual lightness
    - **Property 1: Monotonic Perceptual Lightness**
    - Parse globals.css, extract brand palette RGB values, compute CIELAB L*, verify strict monotonic decrease from stop 50→950
    - **Validates: Requirements 1.5, 2.6**

  - [ ]* 7.2 Write property test for WCAG contrast compliance
    - **Property 2: WCAG Contrast Compliance for All Token Pairs**
    - Generate all designated fg/bg token pairs × 2 themes, compute WCAG contrast ratio, assert ≥ 4.5:1
    - **Validates: Requirements 3.5, 6.3, 6.4, 7.4, 9.3, 10.4**

  - [ ]* 7.3 Write property test for theme luminance bounds
    - **Property 3: Theme Luminance Bounds**
    - Verify dark-mode foreground relative luminance ≥ 0.30, background ≤ 0.05; inverse for light mode
    - **Validates: Requirements 10.2, 10.3**

  - [ ]* 7.4 Write property test for token completeness
    - **Property 4: Token Completeness Across Theme Modes**
    - Parse globals.css, verify every `--brand-*` and `--color-{semantic}*` property appears in both `:root` and `.dark`
    - **Validates: Requirements 10.1**

  - [ ]* 7.5 Write property test for token value format
    - **Property 5: Token Value Format Consistency**
    - Verify all new token values match `^\d{1,3} \d{1,3} \d{1,3}$` with each channel in [0, 255]
    - **Validates: Requirements 7.2, 1.1, 2.1**

  - [ ]* 7.6 Write property test for no hardcoded palette classes
    - **Property 6: No Hardcoded Palette Classes in Refactored Constructs**
    - Parse `lib/brandColors.ts`, verify zero occurrences of `(amber|red|emerald|green|indigo|teal|fuchsia|orange|blue|yellow|pink|purple)-\d+`
    - **Validates: Requirements 9.1**

  - [ ]* 7.7 Write property test for existing config preservation
    - **Property 7: Existing Tailwind Color Config Preservation**
    - Parse `tailwind.config.ts`, verify all pre-existing color keys remain present and unmodified
    - **Validates: Requirements 8.3**

- [ ] 8. Add unit tests for brand color utilities
  - [ ]* 8.1 Write unit tests for `lib/brandColors.ts`
    - Test `roleChipClass('primary')` returns expected token class string
    - Test `intensityBadgeClass('high', false)` returns unfavorable classes
    - Test `PLANET_COLORS['Sun']` resolves to `'text-planet-sun'`
    - Test unknown planet fallback returns `'text-ink'`
    - Test `LEVEL_STYLE['MD']` contains period-md token references
    - Test `LEVEL_STYLE` fallback for unknown level returns DEFAULT_LEVEL_STYLE
    - _Requirements: 5.5, 4.6, 9.4_

- [ ] 9. Add token completeness lint/CI check
  - [ ] 9.1 Create a stylelint rule or CI script for token completeness validation
    - Implement a script (or custom stylelint plugin) that verifies every `--brand-*` and `--color-{category}-*` property defined in one selector is also defined in the other
    - Add an ESLint/grep-based check that DurationComputationResults contains no hardcoded palette class patterns
    - Wire into `package.json` scripts for CI usage
    - _Requirements: 10.5, 9.1_

- [ ] 10. Create style guide documentation
  - [ ] 10.1 Create `docs/brand-color-system.md` style guide
    - Document brand color philosophy (indigo = spiritual depth/wisdom, gold = auspiciousness/prosperity)
    - Document usage guidelines per UI element category (navigation, actions, data viz, status, decorative)
    - Include do/don't section with ≥ 3 "do" and ≥ 3 "don't" examples showing correct token usage and antipatterns
    - List complete token inventory with hex values for both dark and light modes
    - Document component patterns for: score badges, period cards, planet chips, status indicators, section headers
    - Include code snippets with shadcn/ui primitives showing correct implementation
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify property tests, unit tests, and lint checks all green
  - Confirm no regressions in existing component behavior

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- The implementation order ensures no breaking changes: tokens are additive (tasks 1–2), refactoring consumes tokens (tasks 4–5), validation comes last (tasks 7–9)
- The `lib/brandColors.ts` extraction keeps DurationComputationResults lean per requirement 9.6
- All new CSS vars use the existing `R G B` triplet format for opacity modifier compatibility

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "8.1"] },
    { "id": 5, "tasks": ["9.1", "10.1"] }
  ]
}
```
