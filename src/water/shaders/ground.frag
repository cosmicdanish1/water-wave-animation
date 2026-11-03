// Requires: caustics.glsl, bodies.glsl (prepended by Ground.js)
uniform float uTime;
uniform sampler2D uTexture;
uniform float uGroundSize;
uniform vec3 uCausticsColor;
uniform float uCausticsIntensity;
uniform float uCausticsOffset;
uniform float uCausticsScale;
uniform float uCausticsSpeed;
uniform float uCausticsThickness;
uniform float uShadowStrength;
uniform float uShadowSoftness;

varying vec3 vWorldPosition;

void main() {
  vec2 uv = vWorldPosition.xz / uGroundSize + 0.5;
  vec4 texColor = texture2D(uTexture, uv);

  float caustics = wwCaustics(uv, uTime, uCausticsScale, uCausticsSpeed, uCausticsIntensity, uCausticsOffset, uCausticsThickness);

  // Soft blob shadows under floating bodies (they also block the caustics).
  float shadow = 0.0;
  for (int i = 0; i < MAX_BODIES; i++) {
    if (i >= uBodyCount) break;
    float d = wwBoxSdf(vWorldPosition.xz, uBodyA[i].xy, uBodyA[i].z, uBodyB[i].xy, uBodyB[i].z);
    float s = 1.0 - smoothstep(-uShadowSoftness * 0.5, uShadowSoftness, d);
    shadow = max(shadow, s * uBodyB[i].w);
  }
  shadow *= uShadowStrength;

  vec3 color = texColor.rgb * (1.0 - shadow) + caustics * uCausticsColor * (1.0 - shadow);
  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
