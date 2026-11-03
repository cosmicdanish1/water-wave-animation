import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import quadVertexShader from './shaders/sim/quad.vert?raw';
import updateFragmentShader from './shaders/sim/update.frag?raw';
import dropFragmentShader from './shaders/sim/drop.frag?raw';
import bodyFragmentShader from './shaders/sim/body.frag?raw';
import clearFragmentShader from './shaders/sim/clear.frag?raw';

const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 4;
const MAX_QUEUED_DROPS = 32;

/**
 * GPU height-field water (wave equation, ping-pong render targets).
 * World (x, z) in [-size/2, size/2] maps to uv (x / size + 0.5, z / size + 0.5).
 *
 * If the device cannot render to float textures the simulation disables itself
 * and exposes a flat texture, so everything else keeps working.
 */
export class RippleSimulation {
  constructor(renderer, { resolution = 256, size = 2, damping = 0.995, strength = 1 } = {}) {
    this.renderer = renderer;
    this.resolution = resolution;
    this.size = size;
    this.strength = strength;
    this.texel = new THREE.Vector2(1 / resolution, 1 / resolution);
    this._accumulator = 0;
    this._drops = [];
    this._bodies = [];

    const ext = renderer.extensions;
    this.supported = !!(ext && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')));

    this._flat = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    this._flat.needsUpdate = true;

    if (!this.supported) {
      console.warn('[water-wave] Float render targets unsupported: interactive ripples disabled.');
      return;
    }

    const targetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this._read = new THREE.WebGLRenderTarget(resolution, resolution, targetOptions);
    this._write = new THREE.WebGLRenderTarget(resolution, resolution, targetOptions);

    const make = (fragmentShader, uniforms) => new THREE.ShaderMaterial({
      vertexShader: quadVertexShader,
      fragmentShader,
      uniforms: { uState: { value: null }, ...uniforms },
      depthTest: false,
      depthWrite: false,
    });

    this._updateMaterial = make(updateFragmentShader, {
      uDelta: { value: this.texel },
      uDamping: { value: damping },
    });
    this._dropMaterial = make(dropFragmentShader, {
      uCenter: { value: new THREE.Vector2() },
      uRadius: { value: 0.02 },
      uStrength: { value: 0.01 },
    });
    this._bodyMaterial = make(bodyFragmentShader, {
      uOld: { value: new THREE.Vector4() },
      uNew: { value: new THREE.Vector4() },
      uShape: { value: new THREE.Vector3() },
      uSoftness: { value: 2 / resolution },
      uStrength: { value: 1 },
    });
    this._clearMaterial = make(clearFragmentShader, {});

    this._quad = new FullScreenQuad();
    this.reset();
  }

  /** Texture to sample in the water shader (r = height). */
  get texture() {
    return this.supported ? this._read.texture : this._flat;
  }

  get damping() {
    return this._updateMaterial?.uniforms.uDamping.value ?? 0;
  }

  set damping(value) {
    if (this._updateMaterial) this._updateMaterial.uniforms.uDamping.value = value;
  }

  toUv(x, z) {
    return [x / this.size + 0.5, z / this.size + 0.5];
  }

  /** Add a bump (strength > 0) or dip (strength < 0) at world (x, z). */
  addDrop(x, z, radius = 0.04, strength = -0.015) {
    if (!this.supported || this._drops.length >= MAX_QUEUED_DROPS) return;
    const [u, v] = this.toUv(x, z);
    if (u < -0.1 || u > 1.1 || v < -0.1 || v > 1.1) return;
    this._drops.push({ u, v, radius: radius / this.size, strength });
  }

  /**
   * Displace water by the change of a body's submerged footprint.
   * state = { x, z, yaw, depth }, shape = { halfX, halfZ, rounding } in world units.
   */
  addBodyMotion(previous, current, shape, strength = 1) {
    if (!this.supported) return;
    if (previous.depth <= 0 && current.depth <= 0) return;
    this._bodies.push({ previous, current, shape, strength });
  }

  _pass(material) {
    material.uniforms.uState.value = this._read.texture;
    this._quad.material = material;
    this.renderer.setRenderTarget(this._write);
    this._quad.render(this.renderer);
    const tmp = this._read;
    this._read = this._write;
    this._write = tmp;
  }

  reset() {
    if (!this.supported) return;
    const previous = this.renderer.getRenderTarget();
    this._pass(this._clearMaterial);
    this._pass(this._clearMaterial);
    this.renderer.setRenderTarget(previous);
  }

  update(dt) {
    if (!this.supported) return;
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousXr = renderer.xr.enabled;
    renderer.xr.enabled = false;

    for (const drop of this._drops) {
      const u = this._dropMaterial.uniforms;
      u.uCenter.value.set(drop.u, drop.v);
      u.uRadius.value = drop.radius;
      u.uStrength.value = drop.strength;
      this._pass(this._dropMaterial);
    }
    this._drops.length = 0;

    const scale = 1 / this.size;
    for (const { previous, current, shape, strength } of this._bodies) {
      const u = this._bodyMaterial.uniforms;
      u.uOld.value.set(previous.x * scale + 0.5, previous.z * scale + 0.5, previous.yaw, previous.depth);
      u.uNew.value.set(current.x * scale + 0.5, current.z * scale + 0.5, current.yaw, current.depth);
      u.uShape.value.set(shape.halfX * scale, shape.halfZ * scale, shape.rounding * scale);
      u.uStrength.value = strength * this.strength;
      this._pass(this._bodyMaterial);
    }
    this._bodies.length = 0;

    // Fixed time step keeps the wave speed identical on 30, 60 and 120 Hz screens.
    this._accumulator = Math.min(this._accumulator + dt, STEP * MAX_STEPS_PER_FRAME);
    while (this._accumulator >= STEP) {
      this._pass(this._updateMaterial);
      this._accumulator -= STEP;
    }

    renderer.setRenderTarget(previousTarget);
    renderer.xr.enabled = previousXr;
  }

  dispose() {
    this._flat.dispose();
    if (!this.supported) return;
    this._read.dispose();
    this._write.dispose();
    this._updateMaterial.dispose();
    this._dropMaterial.dispose();
    this._bodyMaterial.dispose();
    this._clearMaterial.dispose();
    this._quad.dispose();
  }
}
