import * as THREE from 'three';

// Procedural fallbacks so the package works with zero assets and without a DOM
// (DataTextures only - fine for React Native / expo-gl, workers, TVs).

function skyColor(dir) {
  const y = dir.y;
  const horizon = [0.78, 0.88, 0.95];
  const zenith = [0.22, 0.48, 0.82];
  const ground = [0.16, 0.24, 0.3];
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  let c = y >= 0 ? lerp(horizon, zenith, Math.pow(y, 0.6)) : lerp(horizon, ground, Math.pow(-y, 0.5));
  // Soft sun glow
  const sun = new THREE.Vector3(0.4, 0.6, -0.7).normalize();
  const s = Math.max(0, dir.dot(sun));
  const glow = Math.pow(s, 64) * 1.2 + Math.pow(s, 8) * 0.15;
  c = c.map((v) => Math.min(1, v + glow));
  return c;
}

// Face orientation follows the WebGL cube map convention (+x, -x, +y, -y, +z, -z).
const FACES = [
  (u, v) => [1, -v, -u],
  (u, v) => [-1, -v, u],
  (u, v) => [u, 1, v],
  (u, v) => [u, -1, -v],
  (u, v) => [u, -v, 1],
  (u, v) => [-u, -v, -1],
];

export function createSkyEnvironment(size = 64) {
  const dir = new THREE.Vector3();
  const images = FACES.map((face) => {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = ((x + 0.5) / size) * 2 - 1;
        const v = ((y + 0.5) / size) * 2 - 1;
        dir.set(...face(u, v)).normalize();
        const c = skyColor(dir);
        const i = (y * size + x) * 4;
        data[i] = c[0] * 255;
        data[i + 1] = c[1] * 255;
        data[i + 2] = c[2] * 255;
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.needsUpdate = true;
    return tex;
  });

  const cube = new THREE.CubeTexture(images);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.magFilter = THREE.LinearFilter;
  cube.minFilter = THREE.LinearFilter;
  cube.generateMipmaps = false;
  cube.needsUpdate = true;
  return cube;
}

export function createSandTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  let seed = 1337;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = (i / size) | 0;
    const ripple = Math.sin(x * 0.09 + Math.sin(y * 0.05) * 2.0) * 0.5 + 0.5;
    const n = rand() * 0.25 + ripple * 0.15;
    data[i * 4] = (0.55 + n) * 200;
    data[i * 4 + 1] = (0.5 + n) * 185;
    data[i * 4 + 2] = (0.38 + n) * 150;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Accepts a CubeTexture, an array of 6 URLs (px, nx, py, ny, pz, nz),
 * or `{ path, files }`. Falls back to a procedural sky.
 */
export function resolveEnvironmentMap(source, manager) {
  if (!source) return createSkyEnvironment();
  if (source.isCubeTexture) return source;

  const loader = new THREE.CubeTextureLoader(manager);
  let files = source;
  if (!Array.isArray(source)) {
    loader.setPath(source.path || '');
    files = source.files || ['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png'];
  }
  const texture = loader.load(files);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Accepts a Texture or a URL. Falls back to procedural sand. */
export function resolveTexture(source, manager) {
  if (!source) return createSandTexture();
  if (source.isTexture) return source;
  const texture = new THREE.TextureLoader(manager).load(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
