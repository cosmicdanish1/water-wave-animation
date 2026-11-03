# Reuse guide — how to use this water anywhere

You asked two things: *"how do I reuse this in any future project?"* and
*"how do I make everything a variable?"* This file answers both, and teaches
the background concepts so you can do it for your next library too.

---

## Part 1 — How reusable code actually works (the field)

When you want to use the same code in many projects, you have four options.
From least to most "proper":

| Way | How | When to use |
| --- | --- | --- |
| **1. Copy-paste** | Copy `src/water/` into each project | Quick hacks, one-offs. Gets out of sync fast. |
| **2. Git dependency** | `npm install github:you/repo` | **Best for personal reuse.** No publishing. Always your latest code. |
| **3. npm publish** | `npm publish` → `npm install your-package` | When *other people* should install it with a short name. |
| **4. Monorepo / workspace** | One repo, many apps share a local package | Big projects with several apps in one repo. |

The key idea behind 2–4 is the same: a **package**. A package is just a folder
with a `package.json` that declares:

- a **name** and **version**,
- an **entry point** (`"exports"` / `"main"` / `"module"`) — the file you get
  when someone writes `import ... from 'the-package'`,
- its **dependencies** (what it needs) and **peerDependencies** (what the host
  app must already have — here, `three`),
- which **files** are shipped (`"files"`).

This repo is now a proper package. You don't have to understand every field —
it's already wired up. Below is how to *use* it.

---

## Part 2 — Installing it in a new project

### Option A — straight from GitHub (recommended for your own use)

No publishing, no npm account. In any new project:

```bash
npm install three
npm install github:cosmicdanish1/water-wave-animation
```

That's it. npm clones the repo and runs the `prepare` script, which builds the
library automatically. Import it:

```js
import { createWaterWorld } from '@cosmicdanish1/water-wave';
```

To pin a version, add `#branch` or `#tag`: `...water-wave-animation#v0.1.0`.

### Option B — publish to npm (for a short name others can install)

The plain name `water-wave` is already taken on npm, so this package uses a
**scoped** name: `@cosmicdanish1/water-wave`. Scopes are free and never clash.
Change `cosmicdanish1` in `package.json` to **your npm username**, then:

```bash
npm login
npm publish            # publishConfig already sets public access for the scope
```

Now anyone can `npm install @yourname/water-wave`.

> A **scoped** package is just `@owner/name`. It behaves like any package; the
> scope guarantees the name is yours.

### Option C — copy the folder

Everything lives in `src/water/`. Copy that one folder into any three.js
project and `import { createWaterWorld } from './water/index.js'`. The only
requirement is a bundler that understands `?raw` imports for the `.glsl` files
(Vite and webpack both do out of the box) — or just use the built `dist/`.

---

## Part 3 — Using it

### Plain / vanilla (works in any framework)

```js
import { createWaterWorld } from '@cosmicdanish1/water-wave';

const world = createWaterWorld({
  container: document.getElementById('app'),
  preset: 'ocean',
});
world.addCube({ color: '#ff7a45' });
```

### As a UI background (login forms, hero sections, dashboards)

This is your main use case. One call pins an animated, interactive water canvas
behind your whole page:

```js
import { createWaterBackground } from '@cosmicdanish1/water-wave';

const bg = createWaterBackground({
  preset: 'twilight',
  background: false,   // transparent → your CSS gradient/color shows through
});
```

- The canvas is `position: fixed` at `z-index: -1`, so it sits behind your DOM.
- Your form/buttons stay fully clickable; clicking empty water ripples it.
- The camera drifts slowly on its own (no orbit controls).
- Want it non-interactive? `createWaterBackground({ pointerEvents: 'none' })`.

See `examples/login-background.html` for a complete login screen.

### React

```jsx
import { useWaterWorld } from '@cosmicdanish1/water-wave/react';

function Background() {
  const { containerRef } = useWaterWorld({ preset: 'ambient' });
  return <div ref={containerRef} style={{ position: 'fixed', inset: 0, zIndex: -1 }} />;
}
```

### Mobile (React Native / Expo) and TV

The core is plain three.js, so it runs wherever three.js runs:

- **Expo / React Native:** create a `THREE.WebGLRenderer({ context })` from an
  `expo-gl` GL context, pass it as `renderer`, set `autoStart: false`, and call
  `world.step(dt)` + `world.render()` from the GL frame callback.
- **TV (Tizen, webOS, Android TV):** `quality: 'auto'` detects TV user-agents
  and drops to the lightweight preset. Drive ripples from remote-key handlers
  with `world.disturb()` / `body.push()`.

---

## Part 4 — Everything is a variable

Two ways to control the look: **presets** (whole moods) and **`configure()`**
(any individual value, live).

### Presets

```js
createWaterWorld({ preset: 'tropical' });   // at creation
world.applyPreset('ink');                    // or any time later
```

Built in: `pool`, `ocean`, `calm`, `tropical`, `twilight`, `ink`, `ambient`.
A preset is just a bundle of the options below — copy one from `presets.js` and
make your own.

### Live configuration — change anything, any time

```js
world.configure({
  water: {
    wavesAmplitude: 0.05,     // wave height
    wavesFrequency: 0.8,      // wave density
    wavesSpeed: 0.3,
    wavesPersistence: 0.4,    // how much each noise octave adds
    wavesLacunarity: 2.1,     // frequency step per octave
    wavesIterations: 8,       // detail (cost); lower on weak devices
    surfaceColor: '#36d6c3',  // the three colour bands:
    troughColor: '#0a2a43',
    peakColor: '#e9fff8',
    opacity: 0.9,
    fresnelScale: 0.9,        // how reflective at grazing angles
    fresnelPower: 0.8,
    foamColor: '#ffffff',
    foamIntensity: 1.0,       // foam around objects + whitecaps
    foamWidth: 0.025,
  },
  caustics: {
    causticsIntensity: 0.3,   // brightness of the light patterns on the floor
    causticsScale: 20,
    causticsSpeed: 1.0,
    shadowStrength: 0.5,      // object shadows on the floor
  },
  ripples: {
    damping: 0.99,            // how long interactive ripples last (→1 = longer)
    strength: 1.5,            // how hard objects/taps push the water
  },
  resolution: 320,            // water mesh detail
  autoRotate: true,           // ambient camera drift
});
```

### Swap the environment (reflection) and floor at runtime

The reflection comes from an **environment map** (a cube map — the "sky" the
water mirrors). Change it live:

```js
// 6 images: +x, -x, +y, -y, +z, -z
world.setEnvironment({ path: '/sky/', files: ['px.png','nx.png','py.png','ny.png','pz.png','nz.png'] });
world.setEnvironment(myThreeCubeTexture);   // or an existing THREE.CubeTexture
world.setGroundTexture('/sand.png');        // pool floor
```

No assets? Leave them out — the package generates a procedural sky and sandy
floor so it looks right with zero files.

### Move the camera

```js
world.setCamera({ position: [0.9, 0.3, 0.9], target: [0, 0, 0], fov: 55 });
world.setAutoRotate(true, 0.1);   // slow orbit, 0.1 rad/s
```

### Individual quick access

Every water parameter is also a live property:

```js
world.water.params.wavesAmplitude = 0.04;
world.ground.material.uniforms.uCausticsIntensity.value = 0.25;
```

---

## Part 5 — Cleaning up

Whenever the component/page goes away, release the GPU memory:

```js
world.dispose();   // or bg.dispose()
```

The React hook does this for you automatically.

---

## Where things live

```
src/water/
  index.js            # the public API (what you import)
  WaterWorld.js       # the orchestrator: createWaterWorld / createWaterBackground
  presets.js          # the named looks
  Water.js Ground.js  # the surface + floor materials (all the uniforms)
  RippleSimulation.js # GPU interactive ripples
  FloatingBody.js     # buoyancy + object↔water interaction
  Splashes.js         # droplet particles
  PointerInteraction.js  # drag / tap
  environment.js      # asset loading + procedural fallbacks
  quality.js          # device presets
  react.js            # the React hook
  shaders/            # GLSL (with a JS noise mirror in noise.js)
```

Start in `WaterWorld.js` — it ties everything together, and every option in
Part 4 maps to something there.
