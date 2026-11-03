// One step of the 2D wave equation on a height field (r = height, g = velocity).
uniform sampler2D uState;
uniform vec2 uDelta;
uniform float uDamping;

varying vec2 vUv;

void main() {
  vec4 info = texture2D(uState, vUv);
  vec2 dx = vec2(uDelta.x, 0.0);
  vec2 dy = vec2(0.0, uDelta.y);

  float average = (
    texture2D(uState, vUv - dx).r +
    texture2D(uState, vUv + dx).r +
    texture2D(uState, vUv - dy).r +
    texture2D(uState, vUv + dy).r
  ) * 0.25;

  info.g += (average - info.r) * 2.0;
  info.g *= uDamping;
  info.r += info.g;
  info.r *= uDamping;

  gl_FragColor = info;
}
