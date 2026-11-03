import * as THREE from 'three';
import noiseChunk from './shaders/noise2d.glsl?raw';
import bodiesChunk from './shaders/bodies.glsl?raw';
import waterVertexShader from './shaders/water.vert?raw';
import waterFragmentShader from './shaders/water.frag?raw';
import { MAX_BODIES } from './constants.js';

export const DEFAULT_WATER_PARAMS = {
  opacity: 0.8,
  wavesAmplitude: 0.025,
  wavesFrequency: 1.07,
  wavesPersistence: 0.3,
  wavesLacunarity: 2.18,
  wavesIterations: 8,
  wavesSpeed: 0.4,
  troughColor: '#186691',
  surfaceColor: '#9bd8c0',
  peakColor: '#bbd8e0',
  peakThreshold: 0.08,
  peakTransition: 0.05,
  troughThreshold: -0.01,
  troughTransition: 0.15,
  fresnelScale: 0.8,
  fresnelPower: 0.5,
  foamColor: '#ffffff',
  foamIntensity: 0.85,
  foamWidth: 0.025,
  rippleFoam: 0.006,
  rippleStrength: 1.0,
};

const uniformName = (key) => 'u' + key[0].toUpperCase() + key.slice(1);

export class Water extends THREE.Mesh {
  constructor({
    environmentMap,
    rippleMap,
    rippleTexel = new THREE.Vector2(1 / 256, 1 / 256),
    bodyUniforms,
    size = 2,
    resolution = 256,
    params = {},
  } = {}) {
    super();

    const values = { ...DEFAULT_WATER_PARAMS, ...params };
    const uniforms = {
      uTime: { value: 0 },
      uEnvironmentMap: { value: environmentMap },
      uRippleMap: { value: rippleMap },
      uRippleTexel: { value: rippleTexel },
      uWaterSize: { value: size },
      ...bodyUniforms,
    };
    for (const [key, value] of Object.entries(values)) {
      uniforms[uniformName(key)] = {
        value: typeof value === 'string' ? new THREE.Color(value) : value,
      };
    }

    this.material = new THREE.ShaderMaterial({
      defines: { MAX_BODIES },
      vertexShader: noiseChunk + '\n' + waterVertexShader,
      fragmentShader: noiseChunk + '\n' + bodiesChunk + '\n' + waterFragmentShader,
      uniforms,
      transparent: true,
      side: THREE.DoubleSide,
    });

    this.size = size;
    this.setResolution(resolution);
    this.rotation.x = -Math.PI * 0.5;
    // The vertex shader displaces vertices, so the default bounds are wrong.
    this.frustumCulled = false;
  }

  /** Uniform access by friendly name, e.g. water.params.wavesAmplitude = 0.05 */
  get params() {
    const u = this.material.uniforms;
    return new Proxy({}, {
      get: (_, key) => u[uniformName(String(key))]?.value,
      set: (_, key, value) => {
        const uniform = u[uniformName(String(key))];
        if (!uniform) return false;
        if (uniform.value?.isColor) uniform.value.set(value);
        else uniform.value = value;
        return true;
      },
    });
  }

  setResolution(resolution) {
    const segments = Math.max(2, Math.round(resolution));
    this.resolution = segments;
    this.geometry?.dispose();
    this.geometry = new THREE.PlaneGeometry(this.size, this.size, segments, segments);
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
