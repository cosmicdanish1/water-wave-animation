import * as THREE from 'three';
import causticsChunk from './shaders/caustics.glsl?raw';

/**
 * Patches any built-in three.js material (MeshStandardMaterial, MeshPhongMaterial, ...)
 * so the parts below the water line pick up the same caustics as the pool floor
 * and a slight blue-green tint.
 */
export function applyUnderwaterLighting(material, world, { tint = '#4fa3b8', tintStrength = 0.35 } = {}) {
  const ground = world.ground.material.uniforms;
  const extra = {
    uWwTime: ground.uTime,
    uWwGroundSize: ground.uGroundSize,
    uWwCausticsColor: ground.uCausticsColor,
    uWwCausticsIntensity: ground.uCausticsIntensity,
    uWwCausticsOffset: ground.uCausticsOffset,
    uWwCausticsScale: ground.uCausticsScale,
    uWwCausticsSpeed: ground.uCausticsSpeed,
    uWwCausticsThickness: ground.uCausticsThickness,
    uWwWaterLevel: world.uniforms.waterLevel,
    uWwTint: { value: new THREE.Color(tint) },
    uWwTintStrength: { value: tintStrength },
  };

  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, extra);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWwWorldPosition;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvWwWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWwWorldPosition;
uniform float uWwTime;
uniform float uWwGroundSize;
uniform vec3 uWwCausticsColor;
uniform float uWwCausticsIntensity;
uniform float uWwCausticsOffset;
uniform float uWwCausticsScale;
uniform float uWwCausticsSpeed;
uniform float uWwCausticsThickness;
uniform float uWwWaterLevel;
uniform vec3 uWwTint;
uniform float uWwTintStrength;
${causticsChunk}`
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  float wwUnder = smoothstep(0.0, 0.015, uWwWaterLevel - vWwWorldPosition.y);
  vec2 wwUv = vWwWorldPosition.xz / uWwGroundSize + 0.5;
  float wwC = wwCaustics(wwUv, uWwTime, uWwCausticsScale, uWwCausticsSpeed, uWwCausticsIntensity, uWwCausticsOffset, uWwCausticsThickness);
  outgoingLight = mix(outgoingLight, outgoingLight * uWwTint * 1.6, wwUnder * uWwTintStrength);
  outgoingLight += wwC * uWwCausticsColor * wwUnder * 0.6;
}
#include <opaque_fragment>`
      );
  };
  material.customProgramCacheKey = () => 'ww-underwater';
  material.needsUpdate = true;
  return material;
}
