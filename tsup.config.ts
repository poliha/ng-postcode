import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts', mock: 'src/mock.ts', msw: 'src/msw.ts', server: 'src/server.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    external: ['msw'],
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
  },
])
