import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Water } from './Water.js';
import { Ground } from './Ground.js';
import { RippleSimulation } from './RippleSimulation.js';
import { Splashes } from './Splashes.js';
import { FloatingBody } from './FloatingBody.js';
import { PointerInteraction } from './PointerInteraction.js';
import { applyUnderwaterLighting } from './underwaterMaterial.js';
import { createBodyUniforms, MAX_BODIES } from './constants.js';
import { resolveQuality } from './quality.js';
import { resolveEnvironmentMap, resolveTexture } from './environment.js';
import { waveElevation } from './noise.js';

const _v = new THREE.Vector3();

/**
 * A self-contained interactive pool: waves, reflections, caustics, ripples,
 * floating objects and splashes. Framework-agnostic - give it a container
 * element, a canvas, or your own WebGLRenderer.
 *
 * @example
 * const world = createWaterWorld({ container: document.getElementById('app') });
 * world.addCube({ size: 0.12, color: '#ff7a45' });
 */
export class WaterWorld {
  constructor(options = {}) {
    const {
      container = null,
      canvas = null,
      renderer = null,
      width,
      height,
      pixelRatio,
      quality = 'auto',
      size = 2,
      depth = 0.12,
      environmentMap = null,
      groundTexture = null,
      background = true,
      camera = {},
      controls = true,
      interaction = true,
      autoStart = true,
      water = {},
      caustics = {},
      ripples = {},
      splashes = {},
      lights = true,
      loadingManager,
    } = options;

    this.options = options;
    this.size = size;
    this.depth = depth;
    this.quality = resolveQuality(quality);
    this.container = container;
    this.bodies = [];
    this.time = 0;
    this.running = false;
    this._listeners = new Map();
    this._ownsRenderer = !renderer;
    this._disposables = [];

    // Renderer -----------------------------------------------------------
    this.renderer = renderer || new THREE.WebGLRenderer({
      canvas: canvas || undefined,
      antialias: this.quality.antialias,
      alpha: !background,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (this._ownsRenderer && container && !canvas) {
      this.renderer.domElement.style.display = 'block';
      container.appendChild(this.renderer.domElement);
    }

    // Scene / camera -----------------------------------------------------
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(camera.fov ?? 60, 1, camera.near ?? 0.01, camera.far ?? 50);
    const cp = camera.position ?? [0.8, 0.35, 0.8];
    this.camera.position.set(cp[0], cp[1], cp[2]);
    const target = camera.target ?? [0, -0.02, 0];
    this.camera.lookAt(target[0], target[1], target[2]);

    this.environmentMap = resolveEnvironmentMap(environmentMap, loadingManager);
    this.groundTexture = resolveTexture(groundTexture, loadingManager);
    if (!environmentMap?.isCubeTexture) this._disposables.push(this.environmentMap);
    if (!groundTexture?.isTexture) this._disposables.push(this.groundTexture);
    if (background) this.scene.background = this.environmentMap;
    this.scene.environment = this.environmentMap;

    if (lights) {
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(1, 2, -1.2);
      this.scene.add(sun);
    }

    // Water systems ------------------------------------------------------
    this.uniforms = { waterLevel: { value: 0 } };
    this._bodyUniforms = createBodyUniforms();

    this.ripples = new RippleSimulation(this.renderer, {
      resolution: ripples.resolution ?? this.quality.rippleResolution,
      size,
      damping: ripples.damping ?? 0.995,
      strength: ripples.strength ?? 1,
    });

    this.water = new Water({
      environmentMap: this.environmentMap,
      rippleMap: this.ripples.texture,
      rippleTexel: this.ripples.texel,
      bodyUniforms: this._bodyUniforms,
      size,
      resolution: water.resolution ?? this.quality.waterResolution,
      params: { wavesIterations: this.quality.wavesIterations, ...water },
    });
    this.scene.add(this.water);

    this.ground = new Ground({
      texture: this.groundTexture,
      bodyUniforms: this._bodyUniforms,
      size,
      depth,
      params: caustics,
    });
    this.scene.add(this.ground);

    this.splashes = new Splashes({
      maxParticles: splashes.max ?? this.quality.maxSplashes,
      color: splashes.color,
      size: splashes.size,
    });
    this.scene.add(this.splashes);

    // Controls & input ---------------------------------------------------
    if (controls && this.renderer.domElement?.addEventListener) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.target.set(target[0], target[1], target[2]);
      this.controls.maxPolarAngle = Math.PI * 0.49;
      this.controls.minDistance = 0.2;
      this.controls.maxDistance = 4;
      if (typeof controls === 'object') Object.assign(this.controls, controls);
    }
    if (interaction && this.renderer.domElement?.addEventListener) {
      this.interaction = new PointerInteraction(this, typeof interaction === 'object' ? interaction : {});
    }

    // Size ---------------------------------------------------------------
    this._maxPixelRatio = pixelRatio ?? Math.min(globalThis.devicePixelRatio || 1, this.quality.maxPixelRatio);
    if (width && height) {
      this.setSize(width, height);
    } else if (container) {
      const fit = () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w && h) this.setSize(w, h);
      };
      fit();
      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(fit);
        this._resizeObserver.observe(container);
      } else if (typeof window !== 'undefined') {
        this._onWindowResize = fit;
        window.addEventListener('resize', fit);
      }
    } else if (typeof window !== 'undefined') {
      this._onWindowResize = () => this.setSize(window.innerWidth, window.innerHeight);
      this._onWindowResize();
      window.addEventListener('resize', this._onWindowResize);
    }

    this._clock = new THREE.Clock();
    this._tick = this._tick.bind(this);
    if (autoStart) this.start();
  }

  // --- public API -------------------------------------------------------

  get waterLevel() {
    return this.uniforms.waterLevel.value;
  }

  get floorY() {
    return this.waterLevel - this.depth;
  }

  /** Procedural wave height (without interactive ripples) at world (x, z). */
  getWaveHeight(x, z) {
    return waveElevation(x, z, this.time, this.water.params);
  }

  /** Absolute water surface Y at world (x, z). */
  getSurfaceHeight(x, z) {
    return this.waterLevel + this.getWaveHeight(x, z);
  }

  /** Make the water ripple. Negative strength pushes the surface down. */
  disturb(x, z, radius = 0.05, strength = -0.02) {
    this.ripples.addDrop(x, z, radius, strength);
  }

  /** Spray droplets from a point (usually on the surface). */
  splash(x, y, z, options) {
    this.splashes.emit(_v.set(x, y, z), options);
  }

  /**
   * Let any Object3D float in (and interact with) the water.
   * @returns {FloatingBody}
   */
  addBody(object, options = {}) {
    if (!object.parent) this.scene.add(object);
    const body = new FloatingBody(object, options);
    this.bodies.push(body);
    if (this.bodies.length > MAX_BODIES) {
      console.warn(`[water-wave] More than ${MAX_BODIES} bodies: extra ones float but get no foam/shadow.`);
    }
    return body;
  }

  removeBody(bodyOrObject, { dispose = false } = {}) {
    const index = this.bodies.findIndex((b) => b === bodyOrObject || b.object === bodyOrObject);
    if (index < 0) return;
    const [body] = this.bodies.splice(index, 1);
    body.object.removeFromParent();
    if (dispose) disposeObject(body.object);
  }

  /** Convenience: a floating cube with underwater caustics. */
  addCube({ size = 0.12, color = '#ff7a45', position = [0, 0.3, 0], rotation = 0, material, ...bodyOptions } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      material || new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 })
    );
    applyUnderwaterLighting(mesh.material, this);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.y = rotation;
    return this.addBody(mesh, { halfExtents: new THREE.Vector3(size / 2, size / 2, size / 2), ...bodyOptions });
  }

  /** Convenience: a floating ball. */
  addSphere({ radius = 0.06, color = '#ffd34d', position = [0, 0.3, 0], material, ...bodyOptions } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 32, 16),
      material || new THREE.MeshStandardMaterial({ color, roughness: 0.3 })
    );
    applyUnderwaterLighting(mesh.material, this);
    mesh.position.set(position[0], position[1], position[2]);
    return this.addBody(mesh, { shape: 'sphere', halfExtents: new THREE.Vector3(radius, radius, radius), ...bodyOptions });
  }

  /** Give any material the underwater caustics/tint used by the built-in shapes. */
  applyUnderwaterLighting(material, options) {
    return applyUnderwaterLighting(material, this, options);
  }

  setSize(width, height, pixelRatio = this._maxPixelRatio) {
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, !!this.renderer.domElement?.style);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.splashes.setViewportHeight(height * pixelRatio);
  }

  setWaterResolution(resolution) {
    this.water.setResolution(resolution);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._clock.start();
    this._clock.getDelta();
    this.renderer.setAnimationLoop(this._tick);
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  /** Advance the simulation manually (when autoStart is false). */
  step(dt) {
    dt = Math.min(Math.max(dt, 0), 1 / 20);
    this.time += dt;

    this.water.update(this.time);
    this.ground.update(this.time);

    for (const body of this.bodies) body.update(dt, this);
    this._syncBodyUniforms();

    this.ripples.update(dt);
    this.water.material.uniforms.uRippleMap.value = this.ripples.texture;

    this.splashes.update(
      dt,
      (x, z) => this.getSurfaceHeight(x, z),
      (x, z, s) => {
        if (Math.random() < 0.25) this.disturb(x, z, 0.012 + s, -0.002);
      }
    );

    this.controls?.update();
    this._emit('frame', dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Subscribe to 'frame' | 'grab' | 'release' | 'tap'. Returns an unsubscribe fn. */
  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this._listeners.get(event)?.delete(handler);
  }

  dispose() {
    this.stop();
    this._resizeObserver?.disconnect();
    if (this._onWindowResize) window.removeEventListener('resize', this._onWindowResize);
    this.interaction?.dispose();
    this.controls?.dispose();
    for (const body of this.bodies) disposeObject(body.object);
    this.bodies.length = 0;
    this.water.dispose();
    this.ground.dispose();
    this.splashes.dispose();
    this.ripples.dispose();
    for (const d of this._disposables) d.dispose();
    this._listeners.clear();
    if (this._ownsRenderer) {
      this.renderer.dispose();
      const el = this.renderer.domElement;
      if (this.container && el?.parentNode === this.container) this.container.removeChild(el);
    }
  }

  // --- internals --------------------------------------------------------

  _tick() {
    this.step(this._clock.getDelta());
    this.render();
  }

  _emit(event, payload) {
    const handlers = this._listeners.get(event);
    if (handlers) for (const h of handlers) h(payload);
  }

  _syncBodyUniforms() {
    const { uBodyA, uBodyB, uBodyCount } = this._bodyUniforms;
    const count = Math.min(this.bodies.length, MAX_BODIES);
    for (let i = 0; i < count; i++) {
      const b = this.bodies[i];
      const fp = b.footprint;
      const p = b.object.position;
      uBodyA.value[i].set(p.x, p.z, b.yaw, b.contact);
      uBodyB.value[i].set(fp.halfX, fp.halfZ, fp.rounding, b.shadow);
    }
    uBodyCount.value = count;
  }
}

function disposeObject(object) {
  object.traverse((o) => {
    o.geometry?.dispose();
    const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of materials) m.dispose();
  });
}

export function createWaterWorld(options) {
  return new WaterWorld(options);
}
