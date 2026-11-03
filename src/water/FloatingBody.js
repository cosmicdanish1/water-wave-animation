import * as THREE from 'three';

const GRAVITY = 9.8;
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _qYaw = new THREE.Quaternion();
const _qTilt = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _dir = new THREE.Vector3();

/**
 * Simple, stable buoyancy for any Object3D: it bobs, tilts with the waves,
 * pushes the water around (ripples), and splashes when it enters fast.
 */
export class FloatingBody {
  /**
   * @param {THREE.Object3D} object
   * @param {object} [o]
   * @param {THREE.Vector3} [o.halfExtents]  auto-detected from the bounding box
   * @param {'box'|'sphere'} [o.shape]
   * @param {number} [o.density]  relative to water: <1 floats, >1 sinks
   * @param {boolean} [o.draggable]
   * @param {boolean} [o.splashes]
   * @param {number} [o.interaction]  how strongly it moves the water
   */
  constructor(object, {
    halfExtents,
    shape = 'box',
    density = 0.55,
    linearDrag = 3.0,
    tiltResponse = 5.0,
    tiltAmount = 1.0,
    draggable = true,
    splashes = true,
    interaction = 1.0,
    waveDrift = 0.4,
  } = {}) {
    this.object = object;
    if (!halfExtents) {
      _box.setFromObject(object, true);
      _box.getSize(_size);
      halfExtents = _size.multiplyScalar(0.5);
    }
    this.halfExtents = halfExtents.clone();
    this.shape = shape;
    this.density = density;
    this.linearDrag = linearDrag;
    this.tiltResponse = tiltResponse;
    this.tiltAmount = tiltAmount;
    this.draggable = draggable;
    this.splashes = splashes;
    this.interaction = interaction;
    this.waveDrift = waveDrift;

    _euler.setFromQuaternion(object.quaternion);
    this.yaw = _euler.y;
    this.velocity = new THREE.Vector3();
    this.angularVelocity = 0;

    this.held = false;
    this.holdTarget = new THREE.Vector3();

    this.submerged = 0;
    this.contact = 0;
    this.shadow = 0;

    this._prevDepth = 0;
    this._prevState = null;
    this._sprayTimer = 0;
  }

  get radius() {
    return Math.max(this.halfExtents.x, this.halfExtents.z);
  }

  /** Footprint for the shaders. Spheres are a fully rounded box. */
  get footprint() {
    if (this.shape === 'sphere') {
      return { halfX: 0, halfZ: 0, rounding: this.halfExtents.x };
    }
    const rounding = Math.min(this.halfExtents.x, this.halfExtents.z) * 0.15;
    return { halfX: this.halfExtents.x - rounding, halfZ: this.halfExtents.z - rounding, rounding };
  }

  hold(target) {
    this.held = true;
    this.holdTarget.copy(target);
  }

  release() {
    this.held = false;
  }

  /** Gives the object a push (world units / second). */
  push(vx, vy, vz) {
    this.velocity.x += vx;
    this.velocity.y += vy;
    this.velocity.z += vz;
  }

  update(dt, world) {
    const p = this.object.position;
    const h = this.halfExtents;
    const limit = world.size * 0.5;
    const floorY = world.floorY;

    if (this.held) {
      const k = 1 - Math.exp(-18 * dt);
      _dir.copy(this.holdTarget).sub(p).multiplyScalar(k);
      p.add(_dir);
      // Keep the throw velocity so releasing flings the object.
      this.velocity.copy(_dir).divideScalar(Math.max(dt, 1e-4));
    } else {
      const surface = world.getSurfaceHeight(p.x, p.z);
      const bottom = p.y - h.y;
      const submerged = THREE.MathUtils.clamp((surface - bottom) / (2 * h.y), 0, 1);

      // Gravity + Archimedes. density < 1 settles at `density` fraction submerged.
      const ay = -GRAVITY + (GRAVITY * submerged) / this.density;
      this.velocity.y += ay * dt;

      // Water drag, and drifting down the wave slope.
      if (submerged > 0) {
        const drag = Math.exp(-this.linearDrag * submerged * dt);
        this.velocity.multiplyScalar(drag);
        const e = 0.02;
        const sx = (world.getWaveHeight(p.x + e, p.z) - world.getWaveHeight(p.x - e, p.z)) / (2 * e);
        const sz = (world.getWaveHeight(p.x, p.z + e) - world.getWaveHeight(p.x, p.z - e)) / (2 * e);
        this.velocity.x -= sx * GRAVITY * this.waveDrift * submerged * dt;
        this.velocity.z -= sz * GRAVITY * this.waveDrift * submerged * dt;
      } else {
        this.velocity.multiplyScalar(Math.exp(-0.1 * dt));
      }

      p.addScaledVector(this.velocity, dt);
    }

    // Pool walls and floor.
    const r = this.radius;
    for (const axis of ['x', 'z']) {
      const max = limit - r;
      if (p[axis] > max) { p[axis] = max; this.velocity[axis] *= -0.4; }
      if (p[axis] < -max) { p[axis] = -max; this.velocity[axis] *= -0.4; }
    }
    if (p.y - h.y < floorY) {
      p.y = floorY + h.y;
      if (this.velocity.y < 0) this.velocity.y *= -0.2;
      this.velocity.x *= Math.exp(-4 * dt);
      this.velocity.z *= Math.exp(-4 * dt);
    }

    // Re-evaluate after moving.
    const surface = world.getSurfaceHeight(p.x, p.z);
    const bottom = p.y - h.y;
    const depth = THREE.MathUtils.clamp(surface - bottom, 0, 2 * h.y);
    this.submerged = depth / (2 * h.y);
    // Foam only where the object pierces the surface.
    this.contact = THREE.MathUtils.smoothstep(this.submerged, 0.0, 0.08) * (1 - THREE.MathUtils.smoothstep(this.submerged, 0.92, 1.0));
    const heightAboveFloor = Math.max(0, bottom - floorY);
    this.shadow = THREE.MathUtils.clamp(1 - heightAboveFloor / (world.depth + 0.4), 0.15, 1);

    this._updateTilt(dt, world);
    this._interact(dt, world, depth, surface);
  }

  _updateTilt(dt, world) {
    const p = this.object.position;
    const h = this.halfExtents;
    const cs = Math.cos(this.yaw);
    const sn = Math.sin(this.yaw);
    // Local x / z axes in world space.
    const ax = { x: cs, z: -sn };
    const az = { x: sn, z: cs };
    const hx = Math.max(h.x, 0.01);
    const hz = Math.max(h.z, 0.01);
    const slopeX = (world.getWaveHeight(p.x + ax.x * hx, p.z + ax.z * hx) - world.getWaveHeight(p.x - ax.x * hx, p.z - ax.z * hx)) / (2 * hx);
    const slopeZ = (world.getWaveHeight(p.x + az.x * hz, p.z + az.z * hz) - world.getWaveHeight(p.x - az.x * hz, p.z - az.z * hz)) / (2 * hz);

    const amount = this.held ? 0 : this.tiltAmount * Math.min(1, this.submerged * 3);
    _qYaw.setFromAxisAngle(_up, this.yaw);
    _euler.set(-Math.atan(slopeZ) * amount, 0, Math.atan(slopeX) * amount, 'YXZ');
    _qTilt.setFromEuler(_euler);
    _qYaw.multiply(_qTilt);
    this.object.quaternion.slerp(_qYaw, 1 - Math.exp(-this.tiltResponse * dt));
  }

  _interact(dt, world, depth, surface) {
    const p = this.object.position;
    const state = { x: p.x, z: p.z, yaw: this.yaw, depth };
    if (this._prevState) {
      world.ripples.addBodyMotion(this._prevState, state, this.footprint, this.interaction);
    }
    this._prevState = state;

    if (!this.splashes) {
      this._prevDepth = depth;
      return;
    }

    const vy = this.velocity.y;
    const enteredFast = this._prevDepth <= 0.002 && depth > 0.002 && vy < -0.35;
    if (enteredFast) {
      const impact = Math.min(3, -vy);
      world.splash(p.x, surface, p.z, {
        count: Math.round(25 + impact * 45 * (this.radius / 0.06)),
        speed: 0.45 + impact * 0.35,
        radius: this.radius * 1.1,
        spread: 0.9,
      });
      world.disturb(p.x, p.z, this.radius * 2.2, -0.012 * impact * this.interaction);
    }

    // Spray in front of an object dragged or thrown through the surface.
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this._sprayTimer -= dt;
    if (this.contact > 0.2 && horizontalSpeed > 0.35 && this._sprayTimer <= 0) {
      this._sprayTimer = 0.05;
      _dir.set(this.velocity.x, 0, this.velocity.z).normalize();
      world.splash(p.x + _dir.x * this.radius, surface, p.z + _dir.z * this.radius, {
        count: Math.round(3 + horizontalSpeed * 6),
        speed: 0.25 + horizontalSpeed * 0.25,
        radius: this.radius * 0.4,
        spread: 0.8,
        direction: _dir,
      });
    }

    this._prevDepth = depth;
  }
}
