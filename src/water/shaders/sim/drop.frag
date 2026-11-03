// Adds a smooth bump (positive) or dip (negative) to the height field.
#define PI 3.141592653589793

uniform sampler2D uState;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uStrength;

varying vec2 vUv;

void main() {
  vec4 info = texture2D(uState, vUv);
  float drop = max(0.0, 1.0 - length(uCenter - vUv) / uRadius);
  drop = 0.5 - cos(drop * PI) * 0.5;
  info.r += drop * uStrength;
  gl_FragColor = info;
}
