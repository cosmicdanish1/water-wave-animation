import * as THREE from 'three';
import causticsChunk from './shaders/caustics.glsl?raw';
import bodiesChunk from './shaders/bodies.glsl?raw';
import groundVertexShader from './shaders/ground.vert?raw';
import groundFragmentShader from './shaders/ground.frag?raw';
import { MAX_BODIES } from './constants.js';

export const DEFAULT_CAUSTICS_PARAMS = {
  causticsColor: '#ffffff',
  causticsIntensity: 0.2,
  causticsScale: 20.0,
  causticsSpeed: 1.0,
  causticsThickness: 0.4,
  causticsOffset: 0.75,
  shadowStrength: 0.45,
  shadowSoftness: 0.06,
};

const uniformName = (key) => 'u' + key[0].toUpperCase() + key.slice(1);

export class Ground extends THREE.Mesh {
  constructor({ texture, bodyUniforms, size = 2, depth = 0.12, params = {} } = {}) {
    super();

    const values = { ...DEFAULT_CAUSTICS_PARAMS, ...params };
    const uniforms = {
      uTexture: { value: texture },
      uTime: { value: 0 },
      uGroundSize: { value: size },
      ...bodyUniforms,
    };
    for (const [key, value] of Object.entries(values)) {
      uniforms[uniformName(key)] = {
        value: typeof value === 'string' ? new THREE.Color(value) : value,
      };
    }

    this.material = new THREE.ShaderMaterial({
      defines: { MAX_BODIES },
      vertexShader: groundVertexShader,
      fragmentShader: causticsChunk + '\n' + bodiesChunk + '\n' + groundFragmentShader,
      uniforms,
    });

    this.geometry = new THREE.PlaneGeometry(size, size);
    this.rotation.x = -Math.PI * 0.5;
    this.position.y = -depth;
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
