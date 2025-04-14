import * as THREE from 'three';
import waterVertexShader from './shaders/water.vert?raw';
import waterFragmentShader from './shaders/water.frag?raw';

export class Water extends THREE.Mesh {
  constructor(options = {}) {
    super();

    this.material = new THREE.ShaderMaterial({
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.8 },
        uEnvironmentMap: { value: options.environmentMap },
        uWavesAmplitude: { value: 0.025 },
        uWavesFrequency: { value: 1.07 },
        uWavesPersistence: { value: 0.3 },
        uWavesLacunarity: { value: 2.18 },
        uWavesIterations: { value: 8 },
        uWavesSpeed: { value: 0.4 },
        uTroughColor: { value: new THREE.Color('#186691') },
        uSurfaceColor: { value: new THREE.Color('#9bd8c0') },
        uPeakColor: { value: new THREE.Color('#bbd8e0') },
        uPeakThreshold: { value: 0.08 },
        uPeakTransition: { value: 0.05 },
        uTroughThreshold: { value: -0.01 },
        uTroughTransition: { value: 0.15 },
        uFresnelScale: { value: 0.8 },
        uFresnelPower: { value: 0.5 }
      },
      transparent: true,
      depthTest: true,
      side: THREE.DoubleSide
    });

    this.geometry = new THREE.PlaneGeometry(2, 2, options.resolution || 512, options.resolution || 512);
    this.rotation.x = Math.PI * 0.5;
    this.position.y = 0;
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
  }
}
