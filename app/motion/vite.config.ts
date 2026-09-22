import {defineConfig} from 'vite';
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: '@motion-canvas/2d/lib' },
  build: {
    target: 'es2020',
    minify: true,
    lib: { entry: 'src/main.ts', name: 'mc', formats: ['iife'], fileName: () => 'mc.js' },
    outDir: 'dist', emptyOutDir: true,
  },
});
