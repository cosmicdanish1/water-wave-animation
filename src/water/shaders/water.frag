// Requires: noise2d.glsl, bodies.glsl (prepended by Water.js)
uniform float uTime;
uniform float uOpacity;

uniform vec3 uTroughColor;
uniform vec3 uSurfaceColor;
uniform vec3 uPeakColor;

uniform float uPeakThreshold;
uniform float uPeakTransition;
uniform float uTroughThreshold;
uniform float uTroughTransition;

uniform float uFresnelScale;
uniform float uFresnelPower;

uniform samplerCube uEnvironmentMap;

uniform sampler2D uRippleMap;
uniform float uRippleStrength;
uniform vec2 uRippleTexel;
uniform float uWaterSize;

uniform vec3 uFoamColor;
uniform float uFoamIntensity;
uniform float uFoamWidth;
uniform float uRippleFoam;

varying vec3 vWorldPosition;
varying vec2 vSlope;
varying float vWaveHeight;

void main() {
  // Per-pixel ripple normal for crisp interactive waves.
  vec2 uv = vWorldPosition.xz / uWaterSize + 0.5;
  float rL = texture2D(uRippleMap, uv - vec2(uRippleTexel.x, 0.0)).r;
  float rR = texture2D(uRippleMap, uv + vec2(uRippleTexel.x, 0.0)).r;
  float rD = texture2D(uRippleMap, uv - vec2(0.0, uRippleTexel.y)).r;
  float rU = texture2D(uRippleMap, uv + vec2(0.0, uRippleTexel.y)).r;
  float ripple = texture2D(uRippleMap, uv).r * uRippleStrength;
  vec2 texelWorld = 2.0 * uRippleTexel * uWaterSize;
  vec2 rippleSlope = vec2(rR - rL, rU - rD) * uRippleStrength / texelWorld;

  vec2 slope = vSlope + rippleSlope;
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
  if (!gl_FrontFacing) normal = -normal;

  vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
  vec3 reflectedDirection = reflect(viewDirection, normal);
  // three.js cube maps are mirrored on X (see envmap_fragment: flipEnvMap).
  reflectedDirection.x = -reflectedDirection.x;
  vec4 reflectionColor = textureCube(uEnvironmentMap, reflectedDirection);

  float fresnel = uFresnelScale * pow(1.0 - clamp(dot(-viewDirection, normal), 0.0, 1.0), uFresnelPower);

  float elevation = vWaveHeight;
  float peakFactor = smoothstep(uPeakThreshold - uPeakTransition, uPeakThreshold + uPeakTransition, elevation);
  float troughFactor = smoothstep(uTroughThreshold - uTroughTransition, uTroughThreshold + uTroughTransition, elevation);

  vec3 color = mix(uTroughColor, uSurfaceColor, troughFactor);
  color = mix(color, uPeakColor, peakFactor);
  color = mix(color, reflectionColor.rgb, fresnel);

  // Foam: a broken ring where objects pierce the surface + whitecaps on strong ripples.
  float foam = 0.0;
  for (int i = 0; i < MAX_BODIES; i++) {
    if (i >= uBodyCount) break;
    float d = wwBoxSdf(vWorldPosition.xz, uBodyA[i].xy, uBodyA[i].z, uBodyB[i].xy, uBodyB[i].z);
    float ring = 1.0 - smoothstep(0.0, uFoamWidth, max(d, 0.0));
    foam = max(foam, ring * uBodyA[i].w);
  }
  foam = max(foam, smoothstep(uRippleFoam, uRippleFoam * 3.0, abs(ripple)));
  float breakup = wwSnoise2(vWorldPosition.xz * 60.0 + uTime * 0.7) * 0.5 + 0.5;
  foam *= smoothstep(0.25, 0.75, breakup + foam * 0.35);
  foam *= uFoamIntensity;

  color = mix(color, uFoamColor, foam);

  gl_FragColor = vec4(color, max(uOpacity, foam));

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
