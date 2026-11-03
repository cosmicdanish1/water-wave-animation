uniform vec3 uColor;

varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5 || vAlpha <= 0.0) discard;

  float alpha = smoothstep(0.5, 0.2, d) * vAlpha;
  float highlight = smoothstep(0.22, 0.0, length(c - vec2(-0.13, -0.13)));

  gl_FragColor = vec4(uColor + highlight * 0.6, alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
