import { useEffect, useRef } from 'react';
import { useWaterWorld } from './useWaterWorld.js';
import { createDebugUI } from './water/index.js';
import './index.css';

const COLORS = ['#ff7a45', '#ffd34d', '#4dd0e1', '#ba68c8', '#81c784', '#f06292'];

export default function App() {
  const paneRef = useRef(null);

  const base = import.meta.env.BASE_URL;
  const { containerRef, world } = useWaterWorld({
    quality: 'auto',
    environmentMap: {
      path: `${base}threejs-water-shader/`,
      files: ['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png'],
    },
    groundTexture: `${base}threejs-water-shader/ocean_floor.png`,
  }, (w) => {
    // Seed the pool with a few floating toys.
    w.addCube({ size: 0.13, color: '#ff7a45', position: [-0.2, 0.4, 0.1], rotation: 0.6 });
    w.addSphere({ radius: 0.07, color: '#ffd34d', position: [0.15, 0.5, -0.15] });
    w.addCube({ size: 0.09, color: '#4dd0e1', position: [0.05, 0.6, 0.25], density: 0.4 });

    createDebugUI(w).then((pane) => { paneRef.current = pane; });
    return () => { paneRef.current?.dispose(); paneRef.current = null; };
  });

  // Keyboard / button helpers (also nice on TV remotes).
  useEffect(() => {
    if (!world) return undefined;
    const onKey = (e) => {
      if (e.key === ' ') {
        const c = COLORS[Math.floor(Math.random() * COLORS.length)];
        const x = (Math.random() - 0.5) * 1.2;
        const z = (Math.random() - 0.5) * 1.2;
        if (Math.random() < 0.5) world.addCube({ size: 0.08 + Math.random() * 0.08, color: c, position: [x, 0.7, z], rotation: Math.random() * 6 });
        else world.addSphere({ radius: 0.04 + Math.random() * 0.05, color: c, position: [x, 0.7, z] });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [world]);

  const drop = () => {
    const c = COLORS[Math.floor(Math.random() * COLORS.length)];
    const x = (Math.random() - 0.5) * 1.2;
    const z = (Math.random() - 0.5) * 1.2;
    world?.addCube({ size: 0.08 + Math.random() * 0.08, color: c, position: [x, 0.8, z], rotation: Math.random() * 6 });
  };

  return (
    <div className="app">
      <div ref={containerRef} className="stage" />
      <div className="hud">
        <h1>water-wave</h1>
        <p>Drag the toys · tap the water · press <kbd>Space</kbd> to drop more</p>
        <button onClick={drop}>Drop an object</button>
      </div>
    </div>
  );
}
