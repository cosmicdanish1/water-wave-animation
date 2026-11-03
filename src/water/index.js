// water-wave: an interactive stylised water surface for three.js.
// Framework-agnostic core + optional helpers. Works on web, mobile
// (React Native / expo-gl), desktop and TV wherever WebGL/WebGL2 runs.

export { WaterWorld, createWaterWorld } from './WaterWorld.js';
export { Water, DEFAULT_WATER_PARAMS } from './Water.js';
export { Ground, DEFAULT_CAUSTICS_PARAMS } from './Ground.js';
export { RippleSimulation } from './RippleSimulation.js';
export { Splashes } from './Splashes.js';
export { FloatingBody } from './FloatingBody.js';
export { PointerInteraction } from './PointerInteraction.js';
export { applyUnderwaterLighting } from './underwaterMaterial.js';
export { createDebugUI } from './debug.js';
export {
  createSkyEnvironment,
  createSandTexture,
  resolveEnvironmentMap,
  resolveTexture,
} from './environment.js';
export { waveElevation, snoise2 } from './noise.js';
export { QUALITY_PRESETS, detectQuality, resolveQuality } from './quality.js';
export { MAX_BODIES } from './constants.js';
