// Floating bodies are described to the shaders as oriented, rounded boxes seen from above.
// uBodyA[i] = (x, z, yaw, contact 0..1)   uBodyB[i] = (halfX, halfZ, rounding, shadow 0..1)
uniform vec4 uBodyA[MAX_BODIES];
uniform vec4 uBodyB[MAX_BODIES];
uniform int uBodyCount;

float wwBoxSdf(vec2 p, vec2 center, float yaw, vec2 halfSize, float rounding) {
  vec2 d = p - center;
  float cs = cos(yaw);
  float sn = sin(yaw);
  d = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
  vec2 q = abs(d) - halfSize;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rounding;
}
