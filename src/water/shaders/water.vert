// Requires: noise2d.glsl (prepended by Water.js)
uniform float uTime;

uniform float uWavesAmplitude;
uniform float uWavesSpeed;
uniform float uWavesFrequency;
uniform float uWavesPersistence;
uniform float uWavesLacunarity;
uniform int uWavesIterations;

uniform sampler2D uRippleMap;
uniform float uRippleStrength;
uniform float uWaterSize;

varying vec3 vWorldPosition;
varying vec2 vSlope;
varying float vWaveHeight;

// Fractal (fBm) simplex waves. Mirrored by waveElevation() in noise.js.
float getElevation(vec2 p) {
  float elevation = 0.0;
  float amplitude = 1.0;
  float frequency = uWavesFrequency;

  for (int i = 0; i < 16; i++) {
    if (i >= uWavesIterations) break;
    elevation += amplitude * wwSnoise2(p * frequency + uTime * uWavesSpeed);
    amplitude *= uWavesPersistence;
    frequency *= uWavesLacunarity;
  }

  return elevation * uWavesAmplitude;
}

void main() {
  vec4 modelPosition = modelMatrix * vec4(position, 1.0);
  vec2 p = modelPosition.xz;

  float wave = getElevation(p);

  // Slope of the procedural waves via forward differences.
  float eps = 0.001;
  float slopeX = (getElevation(p + vec2(eps, 0.0)) - wave) / eps;
  float slopeZ = (getElevation(p + vec2(0.0, eps)) - wave) / eps;

  // Interactive ripples from the GPU height-field simulation.
  vec2 rippleUv = p / uWaterSize + 0.5;
  float ripple = texture2D(uRippleMap, rippleUv).r * uRippleStrength;

  float height = wave + ripple;
  modelPosition.y += height;

  vSlope = vec2(slopeX, slopeZ);
  vWaveHeight = height;
  vWorldPosition = modelPosition.xyz;

  gl_Position = projectionMatrix * viewMatrix * modelPosition;
}
