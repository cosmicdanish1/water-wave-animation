// Displaces water by the change in submerged volume of a body between two frames.
// Moving into a cell pushes the water there down; leaving a cell lets it rise,
// which naturally produces bow waves, wakes and rings when objects drop in.
uniform sampler2D uState;
uniform vec4 uOld;      // (u, v, yaw, submerged depth)
uniform vec4 uNew;
uniform vec3 uShape;    // (halfX, halfZ, rounding) in uv units
uniform float uSoftness;
uniform float uStrength;

varying vec2 vUv;

float footprint(vec2 p, vec4 body) {
  vec2 d = p - body.xy;
  float cs = cos(body.z);
  float sn = sin(body.z);
  d = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
  vec2 q = abs(d) - uShape.xy;
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uShape.z;
  return (1.0 - smoothstep(-uSoftness, uSoftness, dist)) * body.w;
}

void main() {
  vec4 info = texture2D(uState, vUv);
  info.r += (footprint(vUv, uOld) - footprint(vUv, uNew)) * uStrength;
  gl_FragColor = info;
}
