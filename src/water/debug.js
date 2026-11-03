import { DEFAULT_WATER_PARAMS } from './Water.js';
import { DEFAULT_CAUSTICS_PARAMS } from './Ground.js';

/**
 * Optional tweakpane panel for a WaterWorld. Lazily imports tweakpane so it
 * never ends up in production bundles that don't use it.
 *
 *   const pane = await createDebugUI(world);
 *   // ... pane.dispose() on teardown
 */
export async function createDebugUI(world, { title = 'Water', expanded = false } = {}) {
  const { Pane } = await import('tweakpane');
  const pane = new Pane({ title });
  pane.expanded = expanded;

  const water = world.water.material.uniforms;
  const ground = world.ground.material.uniforms;
  const bind = (folder, uniform, key, opts) => folder.addBinding(uniform, 'value', { label: key, ...opts });

  const colorOpts = { view: 'color', color: { type: 'float' } };

  const geom = pane.addFolder({ title: 'Geometry', expanded: false });
  const state = { resolution: world.water.resolution };
  geom.addBinding(state, 'resolution', { min: 2, max: 512, step: 2 }).on('change', ({ value, last }) => {
    if (last) world.setWaterResolution(value);
  });

  const waves = pane.addFolder({ title: 'Waves', expanded: false });
  bind(waves, water.uWavesAmplitude, 'amplitude', { min: 0, max: 0.1 });
  bind(waves, water.uWavesFrequency, 'frequency', { min: 0.1, max: 10 });
  bind(waves, water.uWavesPersistence, 'persistence', { min: 0, max: 1 });
  bind(waves, water.uWavesLacunarity, 'lacunarity', { min: 0, max: 3 });
  bind(waves, water.uWavesIterations, 'iterations', { min: 1, max: 12, step: 1 });
  bind(waves, water.uWavesSpeed, 'speed', { min: 0, max: 1 });

  const color = pane.addFolder({ title: 'Color', expanded: false });
  bind(color, water.uOpacity, 'opacity', { min: 0, max: 1, step: 0.01 });
  bind(color, water.uTroughColor, 'trough', colorOpts);
  bind(color, water.uSurfaceColor, 'surface', colorOpts);
  bind(color, water.uPeakColor, 'peak', colorOpts);
  bind(color, water.uPeakThreshold, 'peakThreshold', { min: 0, max: 0.5 });
  bind(color, water.uTroughThreshold, 'troughThreshold', { min: -0.5, max: 0 });

  const foam = pane.addFolder({ title: 'Foam', expanded: false });
  bind(foam, water.uFoamColor, 'color', colorOpts);
  bind(foam, water.uFoamIntensity, 'intensity', { min: 0, max: 2 });
  bind(foam, water.uFoamWidth, 'width', { min: 0, max: 0.1 });

  const fresnel = pane.addFolder({ title: 'Fresnel', expanded: false });
  bind(fresnel, water.uFresnelScale, 'scale', { min: 0, max: 1 });
  bind(fresnel, water.uFresnelPower, 'power', { min: 0, max: 3 });

  const caustics = pane.addFolder({ title: 'Caustics', expanded: false });
  bind(caustics, ground.uCausticsColor, 'color', colorOpts);
  bind(caustics, ground.uCausticsIntensity, 'intensity', { min: 0, max: 2 });
  bind(caustics, ground.uCausticsScale, 'scale', { min: 0, max: 200 });
  bind(caustics, ground.uCausticsSpeed, 'speed', { min: 0, max: 1 });
  bind(caustics, ground.uShadowStrength, 'shadow', { min: 0, max: 1 });

  const ripples = pane.addFolder({ title: 'Ripples', expanded: false });
  bind(ripples, water.uRippleStrength, 'strength', { min: 0, max: 3 });
  const rippleState = { damping: world.ripples.damping };
  ripples.addBinding(rippleState, 'damping', { min: 0.9, max: 0.999, step: 0.001 }).on('change', ({ value }) => {
    world.ripples.damping = value;
  });
  ripples.addButton({ title: 'Calm water' }).on('click', () => world.ripples.reset());

  return pane;
}

export { DEFAULT_WATER_PARAMS, DEFAULT_CAUSTICS_PARAMS };
