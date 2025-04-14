import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Water } from './Water';
import { Ground } from './Ground';
import { setupUI } from './ui';

const MainScene = () => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const paneRef = useRef(null);

  useEffect(() => {
    // Initialize scene only once
    if (sceneRef.current) return;

    // Animation
    const clock = new THREE.Clock();

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.001, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // Environment map
    const cubeTextureLoader = new THREE.CubeTextureLoader();
    cubeTextureLoader.setPath('/threejs-water-shader/');
    const environmentMap = cubeTextureLoader.load([
      'px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png'
    ]);

    const poolTexture = new THREE.TextureLoader().load('/threejs-water-shader/ocean_floor.png');

    scene.background = environmentMap;
    scene.environment = environmentMap;

    // Camera position
    camera.position.set(0.8, 0.03, 0);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Add some light to see the ground material
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const waterResolution = { size: 512 };
    const water = new Water({ environmentMap, resolution: waterResolution.size });
    scene.add(water);

    const ground = new Ground({ texture: poolTexture });
    scene.add(ground);

    // Initialize UI after all elements are created
    paneRef.current = setupUI({ waterResolution, water, ground });

    // Animation loop
    const animate = () => {
      const elapsedTime = clock.getElapsedTime();
      water.update(elapsedTime);
      ground.update(elapsedTime);
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && mountRef.current.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
      if (paneRef.current) {
        paneRef.current.dispose();
      }
      // Dispose Three.js resources
      renderer.dispose();
      controls.dispose();
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100vh' }} />;
};

export default MainScene;