import type { Config } from "tailwindcss";

/**
 * Builds a Tailwind color value backed by a CSS variable, using the
 * `<alpha-value>` placeholder so opacity modifiers (e.g. `bg-gray-800/50`)
 * keep working. See https://tailwindcss.com/docs/customizing-colors#using-css-variables
 */
const themedColor = (cssVar: string) => `rgb(var(${cssVar}) / <alpha-value>)`;

/**
 * The app was built with hardcoded gray/slate utility classes (bg-gray-900,
 * text-gray-400, border-gray-700, …) rather than the `dark:` variant system.
 * To support a light theme without rewriting every className, `gray` and
 * `slate` are redefined here to resolve through CSS variables that flip
 * between `:root` (light) and `.dark` (dark) in globals.css. `ink` is a new
 * semantic color used to replace bare `text-white` (primary text) so it also
 * flips instead of staying literally white on a light background.
 */
/**
 * shadcn/ui semantic tokens (classic Tailwind v3 pattern: HSL CSS variables
 * consumed via `hsl(var(--token))`, defined in globals.css `:root`/`.dark`).
 * These are additive — separate from the `ink`/`gray`/`slate` system above,
 * which existing app code keeps using unchanged. New shadcn components use
 * these tokens instead.
 */
const themedHsl = (cssVar: string) => `hsl(var(${cssVar}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: themedHsl("--border"),
        input: themedHsl("--input"),
        ring: themedHsl("--ring"),
        background: themedHsl("--background"),
        foreground: themedHsl("--foreground"),
        primary: {
          DEFAULT: themedHsl("--primary"),
          foreground: themedHsl("--primary-foreground"),
        },
        secondary: {
          DEFAULT: themedHsl("--secondary"),
          foreground: themedHsl("--secondary-foreground"),
        },
        destructive: {
          DEFAULT: themedHsl("--destructive"),
          foreground: themedHsl("--destructive-foreground"),
        },
        muted: {
          DEFAULT: themedHsl("--muted"),
          foreground: themedHsl("--muted-foreground"),
        },
        accent: {
          DEFAULT: themedHsl("--accent"),
          foreground: themedHsl("--accent-foreground"),
        },
        popover: {
          DEFAULT: themedHsl("--popover"),
          foreground: themedHsl("--popover-foreground"),
        },
        card: {
          DEFAULT: themedHsl("--card"),
          foreground: themedHsl("--card-foreground"),
        },
        ink: themedColor("--color-ink"),
        gray: {
          50: themedColor("--color-gray-50"),
          100: themedColor("--color-gray-100"),
          200: themedColor("--color-gray-200"),
          300: themedColor("--color-gray-300"),
          400: themedColor("--color-gray-400"),
          500: themedColor("--color-gray-500"),
          600: themedColor("--color-gray-600"),
          700: themedColor("--color-gray-700"),
          800: themedColor("--color-gray-800"),
          900: themedColor("--color-gray-900"),
          950: themedColor("--color-gray-950"),
        },
        slate: {
          50: themedColor("--color-slate-50"),
          100: themedColor("--color-slate-100"),
          200: themedColor("--color-slate-200"),
          300: themedColor("--color-slate-300"),
          400: themedColor("--color-slate-400"),
          500: themedColor("--color-slate-500"),
          600: themedColor("--color-slate-600"),
          700: themedColor("--color-slate-700"),
          800: themedColor("--color-slate-800"),
          900: themedColor("--color-slate-900"),
          950: themedColor("--color-slate-950"),
        },
        // ─── Brand Primary Palette (Indigo) ───
        brand: {
          50: themedColor("--brand-primary-50"),
          100: themedColor("--brand-primary-100"),
          200: themedColor("--brand-primary-200"),
          300: themedColor("--brand-primary-300"),
          400: themedColor("--brand-primary-400"),
          500: themedColor("--brand-primary-500"),
          600: themedColor("--brand-primary-600"),
          700: themedColor("--brand-primary-700"),
          800: themedColor("--brand-primary-800"),
          900: themedColor("--brand-primary-900"),
          950: themedColor("--brand-primary-950"),
        },
        // ─── Brand Accent Palette (Gold) ───
        gold: {
          50: themedColor("--brand-accent-50"),
          100: themedColor("--brand-accent-100"),
          200: themedColor("--brand-accent-200"),
          300: themedColor("--brand-accent-300"),
          400: themedColor("--brand-accent-400"),
          500: themedColor("--brand-accent-500"),
          600: themedColor("--brand-accent-600"),
          700: themedColor("--brand-accent-700"),
          800: themedColor("--brand-accent-800"),
          900: themedColor("--brand-accent-900"),
          950: themedColor("--brand-accent-950"),
        },
        // ─── Semantic: Favorability ───
        favorable: themedColor("--color-favorable"),
        "favorable-muted": themedColor("--color-favorable-muted"),
        unfavorable: themedColor("--color-unfavorable"),
        "unfavorable-muted": themedColor("--color-unfavorable-muted"),
        cautionary: themedColor("--color-cautionary"),
        "cautionary-muted": themedColor("--color-cautionary-muted"),
        // ─── Semantic: Dasha Period Levels ───
        "period-md": themedColor("--color-period-md"),
        "period-ad": themedColor("--color-period-ad"),
        "period-pd": themedColor("--color-period-pd"),
        // ─── Semantic: Planet Colors ───
        "planet-sun": themedColor("--color-planet-sun"),
        "planet-moon": themedColor("--color-planet-moon"),
        "planet-mars": themedColor("--color-planet-mars"),
        "planet-mercury": themedColor("--color-planet-mercury"),
        "planet-jupiter": themedColor("--color-planet-jupiter"),
        "planet-venus": themedColor("--color-planet-venus"),
        "planet-saturn": themedColor("--color-planet-saturn"),
        "planet-rahu": themedColor("--color-planet-rahu"),
        "planet-ketu": themedColor("--color-planet-ketu"),
        // ─── Semantic: Sade Sati Phases ───
        "sade-sati-rising-border": themedColor("--color-sade-sati-rising-border"),
        "sade-sati-rising-bg": themedColor("--color-sade-sati-rising-bg"),
        "sade-sati-rising-text": themedColor("--color-sade-sati-rising-text"),
        "sade-sati-peak-border": themedColor("--color-sade-sati-peak-border"),
        "sade-sati-peak-bg": themedColor("--color-sade-sati-peak-bg"),
        "sade-sati-peak-text": themedColor("--color-sade-sati-peak-text"),
        "sade-sati-setting-border": themedColor("--color-sade-sati-setting-border"),
        "sade-sati-setting-bg": themedColor("--color-sade-sati-setting-bg"),
        "sade-sati-setting-text": themedColor("--color-sade-sati-setting-text"),
        // ─── Semantic: House Role Classification ───
        "role-primary-bg": themedColor("--color-role-primary-bg"),
        "role-primary-text": themedColor("--color-role-primary-text"),
        "role-primary-border": themedColor("--color-role-primary-border"),
        "role-benefic-bg": themedColor("--color-role-benefic-bg"),
        "role-benefic-text": themedColor("--color-role-benefic-text"),
        "role-benefic-border": themedColor("--color-role-benefic-border"),
        "role-malefic-bg": themedColor("--color-role-malefic-bg"),
        "role-malefic-text": themedColor("--color-role-malefic-text"),
        "role-malefic-border": themedColor("--color-role-malefic-border"),
        "role-neutral-bg": themedColor("--color-role-neutral-bg"),
        "role-neutral-text": themedColor("--color-role-neutral-text"),
        "role-neutral-border": themedColor("--color-role-neutral-border"),
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
