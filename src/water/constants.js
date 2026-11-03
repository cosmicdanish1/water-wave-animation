import * as THREE from 'three';

/** Max bodies the water/ground shaders know about (foam rings, shadows). */
export const MAX_BODIES = 8;

/**
 * Body data shared (by reference) between the water and ground materials.
 * bodyA[i] = (x, z, yaw, contact)   bodyB[i] = (halfX, halfZ, rounding, shadow)
 */
export function createBodyUniforms() {
  return {
    uBodyA: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Vector4()) },
    uBodyB: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Vector4()) },
    uBodyCount: { value: 0 },
  };
}
