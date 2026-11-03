// JavaScript mirror of shaders/noise2d.glsl + getElevation() in water.vert.
// Lets the CPU know the exact wave height anywhere, so objects can float on it.

const C0 = 0.211324865405187;
const C1 = 0.366025403784439;
const C2 = -0.577350269189626;
const C3 = 0.024390243902439;

const mod289 = (x) => x - Math.floor(x / 289) * 289;
const permute = (x) => mod289((x * 34 + 1) * x);
const fract = (x) => x - Math.floor(x);

export function snoise2(vx, vy) {
  const s = (vx + vy) * C1;
  let ix = Math.floor(vx + s);
  let iy = Math.floor(vy + s);
  const t = (ix + iy) * C0;
  const x0x = vx - ix + t;
  const x0y = vy - iy + t;

  const i1x = x0x > x0y ? 1 : 0;
  const i1y = x0x > x0y ? 0 : 1;

  const x1x = x0x + C0 - i1x;
  const x1y = x0y + C0 - i1y;
  const x2x = x0x + C2;
  const x2y = x0y + C2;

  ix = mod289(ix);
  iy = mod289(iy);

  const p0 = permute(permute(iy) + ix);
  const p1 = permute(permute(iy + i1y) + ix + i1x);
  const p2 = permute(permute(iy + 1) + ix + 1);

  let m0 = Math.max(0.5 - (x0x * x0x + x0y * x0y), 0);
  let m1 = Math.max(0.5 - (x1x * x1x + x1y * x1y), 0);
  let m2 = Math.max(0.5 - (x2x * x2x + x2y * x2y), 0);
  m0 *= m0; m0 *= m0;
  m1 *= m1; m1 *= m1;
  m2 *= m2; m2 *= m2;

  const gx0 = 2 * fract(p0 * C3) - 1;
  const gx1 = 2 * fract(p1 * C3) - 1;
  const gx2 = 2 * fract(p2 * C3) - 1;
  const h0 = Math.abs(gx0) - 0.5;
  const h1 = Math.abs(gx1) - 0.5;
  const h2 = Math.abs(gx2) - 0.5;
  const a0 = gx0 - Math.floor(gx0 + 0.5);
  const a1 = gx1 - Math.floor(gx1 + 0.5);
  const a2 = gx2 - Math.floor(gx2 + 0.5);

  m0 *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h0 * h0);
  m1 *= 1.79284291400159 - 0.85373472095314 * (a1 * a1 + h1 * h1);
  m2 *= 1.79284291400159 - 0.85373472095314 * (a2 * a2 + h2 * h2);

  const g0 = a0 * x0x + h0 * x0y;
  const g1 = a1 * x1x + h1 * x1y;
  const g2 = a2 * x2x + h2 * x2y;

  return 130 * (m0 * g0 + m1 * g1 + m2 * g2);
}

/**
 * Height of the procedural waves at world (x, z), relative to the water level.
 * `params` uses the same names as the water uniforms (without the `u` prefix).
 */
export function waveElevation(x, z, time, params) {
  let elevation = 0;
  let amplitude = 1;
  let frequency = params.wavesFrequency;
  const offset = time * params.wavesSpeed;
  const iterations = Math.min(16, params.wavesIterations | 0);

  for (let i = 0; i < iterations; i++) {
    elevation += amplitude * snoise2(x * frequency + offset, z * frequency + offset);
    amplitude *= params.wavesPersistence;
    frequency *= params.wavesLacunarity;
  }

  return elevation * params.wavesAmplitude;
}
