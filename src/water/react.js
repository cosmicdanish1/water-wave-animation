import { useEffect, useRef, useState } from 'react';
import { createWaterWorld } from './index.js';

/**
 * React hook around WaterWorld. `react` is an optional peer dependency.
 *
 *   const { containerRef, world } = useWaterWorld({ quality: 'auto' }, (w) => {
 *     w.addCube({ color: '#4dd0e1' });
 *   });
 *   return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />;
 *
 * Safe under React 18+ StrictMode: the world is created and disposed on each
 * mount, with nothing shared left dangling.
 */
export function useWaterWorld(options = {}, onReady) {
  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const [world, setWorld] = useState(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const instance = createWaterWorld({ container: containerRef.current, ...optionsRef.current });
    worldRef.current = instance;
    setWorld(instance);
    const cleanup = onReadyRef.current?.(instance);

    return () => {
      if (typeof cleanup === 'function') cleanup();
      instance.dispose();
      worldRef.current = null;
      setWorld(null);
    };
  }, []);

  return { containerRef, world, worldRef };
}
