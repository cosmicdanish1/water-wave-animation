// Named looks. Pass `preset: 'ocean'` to createWaterWorld, or call
// world.applyPreset('ocean') at any time. Each preset is just the same
// options you could set by hand - nothing magic - so copy one and tweak it.

export const PRESETS = {
  // The default stylised swimming-pool look.
  pool: {
    water: {
      wavesAmplitude: 0.025, wavesFrequency: 1.07, wavesSpeed: 0.4,
      troughColor: '#186691', surfaceColor: '#9bd8c0', peakColor: '#bbd8e0',
      fresnelScale: 0.8, fresnelPower: 0.5, opacity: 0.8,
    },
    caustics: { causticsIntensity: 0.2, causticsScale: 20, shadowStrength: 0.45 },
  },

  // Bigger, slower, deep-blue open water.
  ocean: {
    water: {
      wavesAmplitude: 0.05, wavesFrequency: 0.8, wavesSpeed: 0.3, wavesPersistence: 0.4,
      troughColor: '#0a2a43', surfaceColor: '#1f6f8b', peakColor: '#a8d8e8',
      fresnelScale: 0.9, fresnelPower: 0.8, opacity: 0.92,
      foamIntensity: 1.1,
    },
    caustics: { causticsIntensity: 0.12, causticsScale: 14, shadowStrength: 0.5 },
  },

  // Almost mirror-still - great behind UI.
  calm: {
    water: {
      wavesAmplitude: 0.01, wavesFrequency: 0.9, wavesSpeed: 0.18, wavesPersistence: 0.25,
      troughColor: '#1b5e73', surfaceColor: '#8fd0d8', peakColor: '#dff3f0',
      fresnelScale: 0.85, fresnelPower: 0.6, opacity: 0.85, foamIntensity: 0.4,
    },
    caustics: { causticsIntensity: 0.18, causticsScale: 22 },
  },

  // Bright turquoise lagoon.
  tropical: {
    water: {
      wavesAmplitude: 0.022, wavesFrequency: 1.2, wavesSpeed: 0.45,
      troughColor: '#0f8a8a', surfaceColor: '#36d6c3', peakColor: '#e9fff8',
      fresnelScale: 0.75, fresnelPower: 0.5, opacity: 0.82,
    },
    caustics: { causticsIntensity: 0.3, causticsScale: 26, causticsColor: '#fff6d8' },
  },

  // Moody dusk - deep teal with warm highlights.
  twilight: {
    water: {
      wavesAmplitude: 0.03, wavesFrequency: 1.0, wavesSpeed: 0.28,
      troughColor: '#10243a', surfaceColor: '#2a4e6e', peakColor: '#d98c6a',
      fresnelScale: 1.0, fresnelPower: 1.0, opacity: 0.9,
    },
    caustics: { causticsIntensity: 0.1, causticsScale: 16, causticsColor: '#ffd9a0' },
  },

  // High-contrast black "ink" - very good behind light text.
  ink: {
    water: {
      wavesAmplitude: 0.028, wavesFrequency: 1.1, wavesSpeed: 0.35,
      troughColor: '#05080c', surfaceColor: '#14202c', peakColor: '#6f8ea0',
      fresnelScale: 1.0, fresnelPower: 1.3, opacity: 0.95, foamIntensity: 0.6,
    },
    caustics: { causticsIntensity: 0.06, causticsScale: 18, shadowStrength: 0.6 },
  },

  // Tuned for sitting behind a form/hero: gentle, slow, no heavy foam.
  ambient: {
    water: {
      wavesAmplitude: 0.014, wavesFrequency: 0.85, wavesSpeed: 0.16, wavesPersistence: 0.3,
      troughColor: '#13415c', surfaceColor: '#4a93a8', peakColor: '#cfeef0',
      fresnelScale: 0.9, fresnelPower: 0.7, opacity: 0.88, foamIntensity: 0.25,
    },
    caustics: { causticsIntensity: 0.14, causticsScale: 20, shadowStrength: 0.35 },
  },
};

export function getPreset(name) {
  const preset = PRESETS[name];
  if (!preset) {
    console.warn(`[water-wave] Unknown preset "${name}". Available: ${Object.keys(PRESETS).join(', ')}`);
    return {};
  }
  // Deep-ish clone so callers can't mutate the shared preset objects.
  return { water: { ...preset.water }, caustics: { ...preset.caustics } };
}
