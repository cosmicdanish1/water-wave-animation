import * as THREE from 'three';
import splashVertexShader from './shaders/splash.vert?raw';
import splashFragmentShader from './shaders/splash.frag?raw';

const GRAVITY = 9.8;

/**
 * Pooled droplet particles (CPU simulated, GPU drawn as soft point sprites).
 * Droplets that fall back into the water notify `onImpact` so they can ripple.
 */
export class Splashes extends THREE.Points {
  constructor({ maxParticles = 800, color = '#e8f6ff', size = 0.012, gravityScale = 0.6 } = {}) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(maxParticles * 3);
    const sizes = new Float32Array(maxParticles);
    const alphas = new Float32Array(maxParticles);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));

    const material = new THREE.ShaderMaterial({
      vertexShader: splashVertexShader,
      fragmentShader: splashFragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uScale: { value: 500 },
      },
      transparent: true,
      depthWrite: false,
    });

    super(geometry, material);
    this.frustumCulled = false;
    this.renderOrder = 2;

    this.maxParticles = maxParticles;
    this.baseSize = size;
    this.gravity = GRAVITY * gravityScale;
    this._velocities = new Float32Array(maxParticles * 3);
    this._life = new Float32Array(maxParticles);
    this._maxLife = new Float32Array(maxParticles);
    this._baseSizes = new Float32Array(maxParticles);
    this._cursor = 0;
    this._alive = 0;
  }

  /** Call on resize: matches three's sizeAttenuation scale. */
  setViewportHeight(heightInPixels) {
    this.material.uniforms.uScale.value = heightInPixels * 0.5;
  }

  /**
   * Emit a crown of droplets.
   * @param {THREE.Vector3} origin  center of the splash (on the water surface)
   * @param {object} o  { count, speed, radius, spread, up, size }
   */
  emit(origin, { count = 30, speed = 0.6, radius = 0.05, spread = 0.6, up = 1, size = this.baseSize, direction = null } = {}) {
    const pos = this.geometry.attributes.position.array;
    const n = Math.min(count | 0, this.maxParticles);
    for (let k = 0; k < n; k++) {
      const i = this._cursor;
      this._cursor = (this._cursor + 1) % this.maxParticles;

      const angle = Math.random() * Math.PI * 2;
      let dx = Math.cos(angle);
      let dz = Math.sin(angle);
      if (direction) {
        // Bias toward a direction (spray in front of a moving object).
        dx = dx * 0.5 + direction.x;
        dz = dz * 0.5 + direction.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
      }
      const r = radius * (0.6 + Math.random() * 0.5);
      pos[i * 3] = origin.x + dx * r;
      pos[i * 3 + 1] = origin.y + Math.random() * 0.005;
      pos[i * 3 + 2] = origin.z + dz * r;

      const s = speed * (0.4 + Math.random() * 0.8);
      this._velocities[i * 3] = dx * s * spread;
      this._velocities[i * 3 + 1] = s * up * (0.6 + Math.random() * 0.7);
      this._velocities[i * 3 + 2] = dz * s * spread;

      const life = 0.6 + Math.random() * 0.9;
      this._life[i] = life;
      this._maxLife[i] = life;
      this._baseSizes[i] = size * (0.4 + Math.random() * 1.0);
    }
    this._alive = Math.min(this.maxParticles, this._alive + n);
  }

  /**
   * @param {number} dt
   * @param {(x:number, z:number) => number} surfaceAt  water height at (x, z)
   * @param {(x:number, z:number, size:number) => void} [onImpact]
   */
  update(dt, surfaceAt, onImpact) {
    if (this._alive === 0) return;
    const pos = this.geometry.attributes.position.array;
    const sizes = this.geometry.attributes.aSize.array;
    const alphas = this.geometry.attributes.aAlpha.array;
    const vel = this._velocities;
    let alive = 0;

    for (let i = 0; i < this.maxParticles; i++) {
      if (this._life[i] <= 0) {
        if (alphas[i] !== 0) {
          alphas[i] = 0;
          sizes[i] = 0;
        }
        continue;
      }
      alive++;
      this._life[i] -= dt;
      vel[i * 3 + 1] -= this.gravity * dt;
      const drag = Math.exp(-0.8 * dt);
      vel[i * 3] *= drag;
      vel[i * 3 + 2] *= drag;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

      const x = pos[i * 3];
      const z = pos[i * 3 + 2];
      if (vel[i * 3 + 1] < 0 && pos[i * 3 + 1] < surfaceAt(x, z)) {
        if (onImpact) onImpact(x, z, this._baseSizes[i]);
        this._life[i] = 0;
      }

      const t = Math.max(0, this._life[i] / this._maxLife[i]);
      alphas[i] = Math.min(1, t * 3) * 0.9;
      sizes[i] = this._baseSizes[i] * (0.6 + 0.4 * t);
    }

    this._alive = alive;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  clear() {
    this._life.fill(0);
    this._alive = 1; // force one update pass to hide everything
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
