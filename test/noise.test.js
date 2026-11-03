import { describe, it, expect } from 'vitest';
import { snoise2 } from '../src/water/noise.js';

// Regression lock for the CPU simplex noise in src/water/noise.js. This JS is a
// hand-port of the GLSL snoise() in shaders/noise2d.glsl so the CPU can know the
// exact wave height (floating objects rely on it). These values were captured
// from the implementation; if a refactor changes them, CPU and GPU waves may
// have drifted apart, so re-verify against the shader before updating them.
const REFERENCE = [
  [0, 0, 0],
  [0.5, 0.5, -0.47133295421789617],
  [1.5, -2.25, -0.03583527362577769],
  [12.34, -5.67, 0.6331674709071349],
  [-3.14159, 2.71828, 0.6454217296946584],
  [100.1, 200.2, 0.194774325883813],
];

describe('snoise2 (CPU mirror of the GLSL simplex noise)', () => {
  it('is deterministic and stays within [-1, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.123;
      const y = -i * 0.456;
      const v = snoise2(x, y);
      expect(v).toBeGreaterThanOrEqual(-1.0001);
      expect(v).toBeLessThanOrEqual(1.0001);
      expect(snoise2(x, y)).toBe(v);
    }
  });

  it('matches the captured reference values', () => {
    for (const [x, y, expected] of REFERENCE) {
      expect(snoise2(x, y)).toBeCloseTo(expected, 10);
    }
  });

  it('actually varies across the plane', () => {
    const samples = new Set();
    for (let i = 0; i < 50; i++) samples.add(snoise2(i * 1.3, i * 0.7).toFixed(4));
    expect(samples.size).toBeGreaterThan(40);
  });
});
