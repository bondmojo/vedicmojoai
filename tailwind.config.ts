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
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
      },
    },
  },
  plugins: [],
};

export default config;
