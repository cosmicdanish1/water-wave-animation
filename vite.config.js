import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

// Two outputs from one config:
//   `vite build`            -> the demo site in demo-dist/
//   `vite build --mode lib` -> the publishable library in dist/
export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return {
      // Don't copy the demo's public/ assets into the shipped library.
      publicDir: false,
      build: {
        outDir: 'dist',
        lib: {
          entry: resolve(rootDir, 'src/water/index.js'),
          name: 'WaterWave',
          formats: ['es', 'umd'],
          fileName: (format) => `water-wave.${format}.js`,
        },
        // Core `three` is a peer dependency (don't bundle it), but the small
        // `three/examples/jsm` helpers (OrbitControls, Pass) are bundled so the
        // UMD build is self-contained and consumers don't need them resolvable.
        rollupOptions: {
          external: (id) => id === 'three' || id.startsWith('three/build') || id === 'tweakpane',
          output: {
            globals: { three: 'THREE', tweakpane: 'Tweakpane' },
          },
        },
        sourcemap: true,
      },
    };
  }

  return {
    plugins: [react()],
    build: { outDir: 'demo-dist' },
  };
});
