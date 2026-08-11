import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  esbuild: {
    // Automatic JSX runtime (same one Next.js's SWC uses) so component modules that don't
    // import `React` themselves — like YogasView.tsx — still transform correctly under
    // vitest's esbuild-based transform. No DOM/component-testing library involved.
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
