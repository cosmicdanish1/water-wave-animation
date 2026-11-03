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
import { getPreset } from './presets.js';

const _v = new THREE.Vector3();
const _spherical = new THREE.Spherical();
const _target = new THREE.Vector3();

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
      clearColor = null,
      clearAlpha = 1,
      camera = {},
      controls = true,
      interaction = true,
      autoStart = true,
      autoRotate = false,
      placement = 'inline',
      pointerEvents,
      zIndex = -1,
      preset = null,
      splashes = {},
      lights = true,
      loadingManager,
    } = options;

    // A preset is a bundle of water/caustics defaults; explicit `water` /
    // `caustics` options still win over it.
    const base = preset ? getPreset(preset) : {};
    const water = { ...base.water, ...options.water };
    const caustics = { ...base.caustics, ...options.caustics };
    const ripples = options.ripples ?? {};

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
    const transparent = !background && clearColor === null;
    this.renderer = renderer || new THREE.WebGLRenderer({
      canvas: canvas || undefined,
      antialias: this.quality.antialias,
      alpha: transparent,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (clearColor !== null) this.renderer.setClearColor(new THREE.Color(clearColor), clearAlpha);
    // Where to put the canvas: an explicit container, else the body for a
    // full-screen background, else left detached for the caller to place.
    this._mount = container || (this._ownsRenderer && !canvas && placement === 'background' && typeof document !== 'undefined' ? document.body : null);
    if (this._ownsRenderer && !canvas && this._mount) {
      this._mount.appendChild(this.renderer.domElement);
    }
    this._applyPlacement(placement, { zIndex, pointerEvents });

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

    // Camera drift (ambient backgrounds) ---------------------------------
    this._autoRotate = { enabled: false, speed: 0.15, angle: 0 };
    this.setAutoRotate(autoRotate);

    // Size ---------------------------------------------------------------
    this._maxPixelRatio = pixelRatio ?? Math.min(globalThis.devicePixelRatio || 1, this.quality.maxPixelRatio);
    // 'background' is pinned to the viewport; everything else measures its box.
    const measureWindow = placement === 'background' && !(width && height);
    if (width && height) {
      this.setSize(width, height);
    } else if (container && !measureWindow) {
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

  // --- live configuration ----------------------------------------------

  /**
   * Change any parameter at runtime. Everything is a variable:
   *
   *   world.configure({
   *     water:    { wavesAmplitude: 0.05, surfaceColor: '#36d6c3', fresnelScale: 1 },
   *     caustics: { causticsIntensity: 0.3, shadowStrength: 0.5 },
   *     ripples:  { damping: 0.99, strength: 1.5 },
   *     autoRotate: true,
   *   });
   *
   * `water` / `caustics` keys are the friendly names (no `u` prefix) listed in
   * DEFAULT_WATER_PARAMS / DEFAULT_CAUSTICS_PARAMS.
   */
  configure(config = {}) {
    if (config.preset) this.applyPreset(config.preset);
    if (config.water) Object.assign(this.water.params, config.water);
    if (config.caustics) {
      for (const [key, value] of Object.entries(config.caustics)) {
        const uniform = this.ground.material.uniforms['u' + key[0].toUpperCase() + key.slice(1)];
        if (!uniform) continue;
        if (uniform.value?.isColor) uniform.value.set(value);
        else uniform.value = value;
      }
    }
    if (config.ripples) {
      if (config.ripples.damping !== undefined) this.ripples.damping = config.ripples.damping;
      if (config.ripples.strength !== undefined) {
        this.ripples.strength = config.ripples.strength;
        this.water.material.uniforms.uRippleStrength.value = config.ripples.strength;
      }
    }
    if (config.resolution !== undefined) this.setWaterResolution(config.resolution);
    if (config.environmentMap !== undefined) this.setEnvironment(config.environmentMap);
    if (config.groundTexture !== undefined) this.setGroundTexture(config.groundTexture);
    if (config.autoRotate !== undefined) this.setAutoRotate(config.autoRotate);
    if (config.camera) this.setCamera(config.camera);
    return this;
  }

  /** Apply a named look (see PRESETS). Only touches water + caustics. */
  applyPreset(name) {
    const preset = getPreset(name);
    if (preset.water) Object.assign(this.water.params, preset.water);
    if (preset.caustics) this.configure({ caustics: preset.caustics });
    this.preset = name;
    return this;
  }

  /** Swap the reflection / background environment map at runtime. */
  setEnvironment(source, { background } = {}) {
    const map = resolveEnvironmentMap(source, this.options.loadingManager);
    this.environmentMap = map;
    this.water.material.uniforms.uEnvironmentMap.value = map;
    this.scene.environment = map;
    const showBackground = background ?? (this.scene.background !== null);
    if (showBackground) this.scene.background = map;
    if (!source?.isCubeTexture) this._disposables.push(map);
    return this;
  }

  /** Swap the pool-floor texture at runtime. */
  setGroundTexture(source) {
    const tex = resolveTexture(source, this.options.loadingManager);
    this.groundTexture = tex;
    this.ground.material.uniforms.uTexture.value = tex;
    if (!source?.isTexture) this._disposables.push(tex);
    return this;
  }

  /** Move/aim the camera. { position:[x,y,z], target:[x,y,z], fov }. */
  setCamera({ position, target, fov } = {}) {
    if (position) this.camera.position.set(position[0], position[1], position[2]);
    if (fov !== undefined) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    if (target) {
      this.camera.lookAt(target[0], target[1], target[2]);
      this.controls?.target.set(target[0], target[1], target[2]);
    }
    return this;
  }

  /** Slow ambient orbit, ideal behind UI. speed is radians/second. */
  setAutoRotate(enabled, speed) {
    const on = !!enabled;
    this._autoRotate.enabled = on;
    if (typeof enabled === 'number') this._autoRotate.speed = enabled;
    if (speed !== undefined) this._autoRotate.speed = speed;
    if (this.controls) {
      // Reuse OrbitControls' own damped auto-rotate when controls exist.
      this.controls.autoRotate = on;
      this.controls.autoRotateSpeed = this._autoRotate.speed * 9.55; // ~ rad/s -> OrbitControls units
    }
    return this;
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

    // Ambient camera drift when there are no OrbitControls to do it for us.
    if (this._autoRotate.enabled && !this.controls) {
      const t = this.controls ? _target.copy(this.controls.target) : _target.set(0, this.waterLevel - 0.02, 0);
      _spherical.setFromVector3(_v.copy(this.camera.position).sub(t));
      _spherical.theta += this._autoRotate.speed * dt;
      this.camera.position.copy(t).add(_v.setFromSpherical(_spherical));
      this.camera.lookAt(t);
    }

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
      if (el?.parentNode) el.parentNode.removeChild(el);
    }
  }

  // --- internals --------------------------------------------------------

  _tick() {
    this.step(this._clock.getDelta());
    this.render();
  }

  /** Style the canvas for inline / fill / background use. */
  _applyPlacement(placement, { zIndex, pointerEvents }) {
    const el = this.renderer.domElement;
    if (!el?.style) return;
    el.style.display = 'block';
    if (placement === 'background') {
      Object.assign(el.style, {
        position: 'fixed', inset: '0', top: '0', left: '0',
        width: '100%', height: '100%', zIndex: String(zIndex),
        pointerEvents: pointerEvents ?? 'auto',
      });
    } else if (placement === 'fill') {
      Object.assign(el.style, {
        position: 'absolute', inset: '0', top: '0', left: '0',
        width: '100%', height: '100%',
        pointerEvents: pointerEvents ?? 'auto',
      });
    } else if (pointerEvents) {
      el.style.pointerEvents = pointerEvents;
    }
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

/**
 * A full-screen animated water background to sit behind your UI (login forms,
 * hero sections, dashboards). Pins the canvas to the viewport, drifts the
 * camera slowly, and uses the calm "ambient" preset by default. Clicks still
 * reach your DOM; empty areas ripple.
 *
 * @example
 * const bg = createWaterBackground({ preset: 'twilight' });
 * // ... later: bg.applyPreset('ocean'); bg.dispose();
 */
export function createWaterBackground(options = {}) {
  return new WaterWorld({
    placement: 'background',
    preset: options.preset ?? 'ambient',
    controls: false,
    autoRotate: true,
    camera: { position: [0.9, 0.28, 0.9], target: [0, -0.02, 0], ...options.camera },
    ...options,
  });
}
