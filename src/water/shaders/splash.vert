attribute float aSize;
attribute float aAlpha;

uniform float uScale;

varying float vAlpha;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uScale / max(-mvPosition.z, 0.0001);
  vAlpha = aAlpha;
}
