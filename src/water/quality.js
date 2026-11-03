/** Rendering presets, so one package scales from TVs and phones to desktops. */
export const QUALITY_PRESETS = {
  low: { waterResolution: 96, rippleResolution: 128, wavesIterations: 4, maxPixelRatio: 1, maxSplashes: 250, antialias: false },
  medium: { waterResolution: 192, rippleResolution: 192, wavesIterations: 6, maxPixelRatio: 1.5, maxSplashes: 500, antialias: true },
  high: { waterResolution: 320, rippleResolution: 256, wavesIterations: 8, maxPixelRatio: 2, maxSplashes: 1000, antialias: true },
};

/** Best-effort guess at what the current device can handle. */
export function detectQuality() {
  if (typeof navigator === 'undefined') return 'medium';
  const ua = navigator.userAgent || '';
  if (/SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|HbbTV|BRAVIA|CrKey|AFT[A-Z]|Android TV|GoogleTV|Roku/i.test(ua)) {
    return 'low';
  }
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || coarse;
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile) return cores >= 8 ? 'medium' : 'low';
  return cores >= 4 ? 'high' : 'medium';
}

export function resolveQuality(quality) {
  if (quality && typeof quality === 'object') return { ...QUALITY_PRESETS.medium, ...quality };
  const name = !quality || quality === 'auto' ? detectQuality() : quality;
  return { name, ...(QUALITY_PRESETS[name] || QUALITY_PRESETS.medium) };
}
