import * as THREE from '/vendor/three.module.js';
import {
  CELL,
  WALL_H,
  COVER_H,
  LOW_H,
  HIGH_H,
  DECK_H,
  TILE_WALL,
  TILE_COVER,
  TILE_LOW,
  TILE_HIGH,
  TILE_DECK,
  SLOT_COLORS,
} from '/shared/constants.js';
import { cellCenter } from '/shared/arena.js';
import { AVATAR_GUN_BUILDERS, AVATAR_HOLDS } from './viewmodel.js';
import { mountBlockPlayer, mountArenaProp } from './model-assets.js';

const SKY_TOP = new THREE.Color('#1b2f4d');
const SKY_BOTTOM = new THREE.Color('#41618a');

const MAP_THEMES = {
  random: {
    skyTop: '#1b2f4d',
    skyBottom: '#41618a',
    fog: 0x0d1421,
    fogNear: 48,
    fogFar: 175,
    hemiSky: 0xc7ddf7,
    hemiGround: 0x4a5568,
    sun: 0xfff4e2,
    sunIntensity: 2.4,
    floorBase: '#2b3444',
    floorGrid: 'rgba(140, 190, 245, 0.38)',
    wall: 0x5b6980,
    wallCap: 0x0b1118,
    wallEmissive: 0x2f7fb5,
    wallGlow: 1.5,
    cover: 0x76839c,
    coverCap: 0x11161e,
    coverEmissive: 0xd98b3a,
    coverGlow: 1.2,
  },
  // Overcast winter light. The glow strips that make the default arena readable
  // look like neon on snow, so the wall caps are near-white and barely lit —
  // they read as a snow ledge instead.
  fy_snow: {
    skyTop: '#7f97b4',
    skyBottom: '#e6eef7',
    fog: 0xccdae8,
    fogNear: 70,
    fogFar: 240,
    hemiSky: 0xf2f8ff,
    hemiGround: 0xb9c8d8,
    sun: 0xfff6ea,
    sunIntensity: 1.9,
    floorBase: '#f1f6fb',
    floorGrid: 'rgba(126, 152, 178, 0.2)',
    // Snow settles on top of the walls, so their caps are near-white. Crates
    // only get a dusting: a snow-tinted tan keeps them reading as wood from
    // above instead of vanishing into the floor.
    wall: 0xa6bacd,
    wallCap: 0xeaf3fa,
    wallEmissive: 0xffffff,
    wallGlow: 0.3,
    cover: 0x7d5836,
    coverCap: 0xcbb595,
    coverEmissive: 0xfff4e2,
    coverGlow: 0.22,
  },
  // Sun-baked desert pit: sandstone block walls, wooden crates, hazy warm air.
  dust_bowl: {
    skyTop: '#4a7ab5',
    skyBottom: '#f0d9a8',
    fog: 0xe8d3a0,
    fogNear: 70,
    fogFar: 210,
    hemiSky: 0xfff2dd,
    hemiGround: 0xc9a670,
    sun: 0xffe8c0,
    sunIntensity: 2.6,
    floorBase: '#c9a465',
    floorGrid: 'rgba(160, 120, 60, 0.25)',
    floorPattern: 'sand',
    wall: 0xd9b87c,
    wallPattern: 'sandstone',
    wallCap: 0xc9a86a,
    wallEmissive: 0xffe8c0,
    wallGlow: 0.15,
    cover: 0xa87848,
    coverPattern: 'crate',
    coverCap: 0xc9a06a,
    coverEmissive: 0xffe8c0,
    coverGlow: 0.1,
  },
  // Rainy cyberpunk backstreet at night: dark panels, hot magenta and cyan
  // neon strips doing all the talking.
  neon_alley: {
    skyTop: '#05070f',
    skyBottom: '#1a1033',
    fog: 0x0a0714,
    fogNear: 40,
    fogFar: 155,
    hemiSky: 0xa8b6e8,
    hemiGround: 0x20202f,
    sun: 0x9fb4ff,
    sunIntensity: 1.5,
    floorBase: '#1d222b',
    floorGrid: 'rgba(64, 220, 255, 0.5)',
    floorPattern: 'asphalt',
    wall: 0x2a2f3d,
    wallPattern: 'panel',
    wallCap: 0x07090d,
    wallEmissive: 0xff2fd6,
    wallGlow: 2.2,
    cover: 0x1f2735,
    coverPattern: 'neon',
    coverCap: 0x0a0d13,
    coverEmissive: 0x2fe9ff,
    coverGlow: 1.1,
    // The catwalk has to read as climbable at street level, so its body is a
    // clearly lighter steel than the near-black walls around it.
    highColor: 0x4a5878,
  },
  // Overgrown ruin: mossy stone, humid green haze, pillars instead of walls.
  temple: {
    skyTop: '#2e4d38',
    skyBottom: '#a8c9a0',
    fog: 0x76936b,
    fogNear: 55,
    fogFar: 190,
    hemiSky: 0xd8e8c8,
    hemiGround: 0x3a4a34,
    sun: 0xfff0c8,
    sunIntensity: 2.0,
    floorBase: '#5a6b4c',
    floorGrid: 'rgba(40, 60, 35, 0.3)',
    floorPattern: 'grass',
    wall: 0x8a8f7a,
    wallPattern: 'stoneMoss',
    wallCap: 0x5c6b4f,
    wallEmissive: 0x9fdc7a,
    wallGlow: 0.4,
    cover: 0x7a8468,
    coverPattern: 'stoneMoss',
    coverCap: 0x66755a,
    coverEmissive: 0x9fdc7a,
    coverGlow: 0.3,
  },
  // Volcanic forge hall: black iron and basalt, molten light leaking out of
  // every wall lip and floor crack.
  foundry: {
    skyTop: '#1a0d0a',
    skyBottom: '#5c2415',
    fog: 0x2b120c,
    fogNear: 34,
    fogFar: 140,
    hemiSky: 0xd97a50,
    hemiGround: 0x1f0d08,
    sun: 0xffb066,
    sunIntensity: 1.1,
    floorBase: '#1f1b1a',
    floorGrid: 'rgba(255, 120, 40, 0.28)',
    floorPattern: 'basalt',
    wall: 0x3a3532,
    wallPattern: 'iron',
    wallCap: 0x141110,
    wallEmissive: 0xff3c00,
    wallGlow: 1.3,
    cover: 0x4a423c,
    coverPattern: 'iron',
    coverCap: 0x201a16,
    coverEmissive: 0xffa040,
    coverGlow: 0.8,
  },
  // Container port at dusk: warehouse steel, sodium lamps, and container
  // stacks tinted per-instance from a shipping palette.
  harbor: {
    skyTop: '#28436b',
    skyBottom: '#e8a86b',
    fog: 0x9fb4cc,
    fogNear: 80,
    fogFar: 300,
    hemiSky: 0xffd9b0,
    hemiGround: 0x51606f,
    sun: 0xffc890,
    sunIntensity: 2.0,
    floorBase: '#8c9298',
    floorGrid: 'rgba(60, 70, 80, 0.35)',
    floorPattern: 'concrete',
    wall: 0x7c8894,
    wallPattern: 'panel',
    wallCap: 0x2c3238,
    wallEmissive: 0xffd080,
    wallGlow: 0.3,
    cover: 0xffffff,
    coverPattern: 'container',
    coverPalette: [0xc84b32, 0x2f6fa8, 0x3f8f5a, 0xd98b3a, 0x8a4f9e],
    // White so the per-instance palette tint owns the container tops too.
    coverCap: 0xffffff,
    coverEmissive: 0xffd080,
    coverGlow: 0.12,
    // Raised mid plaza is bare concrete, double stacks are more containers,
    // and the crane-side sniper decks are painted crane steel.
    lowPattern: null,
    lowColor: 0x9aa0a8,
    highPattern: 'container',
    deckPattern: null,
    deckColor: 0xc2622a,
  },
};

function getMapTheme(mapId) {
  return MAP_THEMES[mapId] || MAP_THEMES.random;
}

// Blender-authored skyline props per map, placed outside the sealed border so
// they dress the horizon without touching collision or sightlines in play.
const MAP_DECOR = {
  dust_bowl: [
    { url: '/models/prop_pyramid.glb', height: 24, x: 44, z: -40, yaw: 0.4 },
    { url: '/models/prop_pyramid.glb', height: 14, x: -40, z: 38, yaw: 2.6 },
  ],
  neon_alley: [
    { url: '/models/prop_neon_tower.glb', height: 38, x: -34, z: -30, yaw: 0.3 },
    { url: '/models/prop_neon_tower.glb', height: 46, x: 32, z: -34, yaw: 1.8 },
    { url: '/models/prop_neon_tower.glb', height: 42, x: 34, z: 30, yaw: 3.4 },
    { url: '/models/prop_neon_tower.glb', height: 36, x: -32, z: 34, yaw: 5.0 },
  ],
  temple: [
    { url: '/models/prop_temple_gate.glb', height: 14, x: 0, z: -42, yaw: 0 },
    { url: '/models/prop_temple_gate.glb', height: 14, x: 0, z: 42, yaw: Math.PI },
    { url: '/models/prop_temple_gate.glb', height: 11, x: -44, z: 0, yaw: Math.PI / 2 },
    { url: '/models/prop_temple_gate.glb', height: 11, x: 44, z: 0, yaw: -Math.PI / 2 },
  ],
  foundry: [
    { url: '/models/prop_volcano.glb', height: 32, x: 54, z: -50, yaw: 0 },
    { url: '/models/prop_volcano.glb', height: 18, x: -60, z: 44, yaw: 2.2 },
  ],
  harbor: [
    { url: '/models/prop_crane.glb', height: 28, x: -18, z: -60, yaw: 0 },
    { url: '/models/prop_crane.glb', height: 28, x: 22, z: -60, yaw: 0 },
    { url: '/models/prop_crane.glb', height: 28, x: 0, z: 60, yaw: Math.PI },
  ],
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  return renderer;
}

// The gradient is baked into vertex colours rather than a custom shader, so
// Three.js handles the linear-to-sRGB conversion and the sky renders at the
// brightness these hex values actually describe.
function makeSky() {
  const geometry = new THREE.SphereGeometry(320, 32, 20);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const colour = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i) / 320;
    const t = Math.pow(THREE.MathUtils.clamp(y * 0.5 + 0.5, 0, 1), 0.8);
    colour.copy(SKY_BOTTOM).lerp(SKY_TOP, t);
    colors[i * 3] = colour.r;
    colors[i * 3 + 1] = colour.g;
    colors[i * 3 + 2] = colour.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  return new THREE.Mesh(geometry, material);
}

// The floor plane is shared across maps and oversized so even the 24-cell
// harbor sits on solid ground; the texture repeats once per grid cell.
const FLOOR_EXTENT = 128;

function makeFloorTexture(theme) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = theme.floorBase;
  ctx.fillRect(0, 0, size, size);

  // Faint speckle keeps large floors from looking like flat colour.
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }

  // Per-theme ground detail, drawn under the cell grid line.
  if (theme.floorPattern === 'sand') {
    // Wind ripples: shallow darker arcs.
    ctx.strokeStyle = 'rgba(140, 100, 50, 0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const y = Math.random() * size;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y + 12, size * 0.7, y - 12, size, y);
      ctx.stroke();
    }
  } else if (theme.floorPattern === 'asphalt') {
    // Patched tarmac: darker rectangles and a faint wet sheen streak.
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(0, 0, 0, ${0.12 + Math.random() * 0.12})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 30 + Math.random() * 60, 20 + Math.random() * 40);
    }
    ctx.fillStyle = 'rgba(120, 200, 255, 0.05)';
    ctx.fillRect(0, size * 0.4, size, size * 0.2);
  } else if (theme.floorPattern === 'grass') {
    // Tufts poking through the flagstones.
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.strokeStyle = `rgba(${60 + Math.random() * 40}, ${110 + Math.random() * 60}, 50, 0.5)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 4);
      ctx.stroke();
    }
  } else if (theme.floorPattern === 'basalt') {
    // Molten cracks: jagged glowing polylines across the black rock.
    for (let i = 0; i < 4; i++) {
      let x = Math.random() * size;
      let y = Math.random() * size;
      ctx.strokeStyle = `rgba(255, ${90 + Math.random() * 60}, 30, ${0.35 + Math.random() * 0.3})`;
      ctx.lineWidth = 1.5 + Math.random();
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (Math.random() - 0.5) * 70;
        y += (Math.random() - 0.5) * 70;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (theme.floorPattern === 'concrete') {
    // Expansion joints quartering each slab, plus oil stains.
    ctx.strokeStyle = 'rgba(40, 45, 52, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(20, 22, 26, ${0.08 + Math.random() * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * size, Math.random() * size, 12 + Math.random() * 24, 8 + Math.random() * 16, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.strokeStyle = theme.floorGrid;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(FLOOR_EXTENT / CELL, FLOOR_EXTENT / CELL);
  texture.anisotropy = 4;
  return texture;
}

// One texture per block face. Colour is baked into the canvas (material tint
// stays white) except 'container', which is drawn in grayscale so each
// instance can be tinted from the shipping palette.
function makeBoxTexture(kind, theme) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (kind === 'sandstone') {
    ctx.fillStyle = '#d9bd85';
    ctx.fillRect(0, 0, size, size);
    const course = size / 4;
    for (let row = 0; row < 4; row++) {
      const offset = row % 2 === 0 ? 0 : course;
      ctx.strokeStyle = 'rgba(150, 118, 66, 0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-1, row * course, size + 2, course);
      for (let x = offset; x < size; x += course * 2) {
        ctx.beginPath();
        ctx.moveTo(x, row * course);
        ctx.lineTo(x, (row + 1) * course);
        ctx.stroke();
      }
      // Weathering: lighter top edge of each course.
      ctx.fillStyle = 'rgba(255, 240, 200, 0.12)';
      ctx.fillRect(0, row * course + 2, size, 3);
    }
  } else if (kind === 'panel') {
    ctx.fillStyle = '#3d4552';
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 32) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(x, 0, 3, size);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillRect(x + 3, 0, 2, size);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, size * 0.72, size, 4);
    // Rivets along the seams.
    ctx.fillStyle = 'rgba(200, 220, 240, 0.35)';
    for (let x = 16; x < size; x += 32) {
      for (let y = 12; y < size; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === 'stoneMoss') {
    ctx.fillStyle = '#96968a';
    ctx.fillRect(0, 0, size, size);
    const course = size / 4;
    for (let row = 0; row < 4; row++) {
      const offset = row % 2 === 0 ? course / 2 : 0;
      ctx.strokeStyle = 'rgba(52, 58, 44, 0.6)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-2, row * course, size + 4, course);
      for (let x = offset; x < size; x += course) {
        ctx.beginPath();
        ctx.moveTo(x, row * course);
        ctx.lineTo(x, (row + 1) * course);
        ctx.stroke();
      }
    }
    // Moss creeping over the block edges.
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(${70 + Math.random() * 40}, ${120 + Math.random() * 50}, 60, ${0.25 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * size, Math.random() * size, 4 + Math.random() * 10, 3 + Math.random() * 6, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'iron') {
    ctx.fillStyle = '#37322e';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 32) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, y, size, 3);
      ctx.fillStyle = 'rgba(255, 160, 90, 0.08)';
      ctx.fillRect(0, y + 3, size, 2);
    }
    // Bolts and scorch marks.
    ctx.fillStyle = 'rgba(20, 16, 14, 0.8)';
    for (let x = 12; x < size; x += 28) {
      for (let y = 16; y < size; y += 32) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + Math.random() * 0.2})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 8 + Math.random() * 20, 30 + Math.random() * 50);
    }
  } else if (kind === 'container') {
    // Grayscale corrugation, tinted per instance by the shipping palette.
    for (let x = 0; x < size; x += 16) {
      ctx.fillStyle = '#cfcfcf';
      ctx.fillRect(x, 0, 10, size);
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(x + 10, 0, 6, size);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 0, size, 6);
    ctx.fillRect(0, size - 6, size, 6);
  } else if (kind === 'crate') {
    ctx.fillStyle = '#a87848';
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 26) {
      ctx.fillStyle = 'rgba(70, 42, 20, 0.5)';
      ctx.fillRect(x, 0, 3, size);
    }
    ctx.strokeStyle = 'rgba(70, 42, 20, 0.65)';
    ctx.lineWidth = 7;
    ctx.strokeRect(4, 4, size - 8, size - 8);
    ctx.beginPath();
    ctx.moveTo(6, 6);
    ctx.lineTo(size - 6, size - 6);
    ctx.stroke();
  } else if (kind === 'neon') {
    ctx.fillStyle = '#10151f';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(47, 233, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, size - 16, size - 16);
    ctx.fillStyle = 'rgba(255, 47, 214, 0.5)';
    ctx.fillRect(20, size / 2 - 3, size - 40, 6);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

function updateSkyColors(sky, theme) {
  const top = new THREE.Color(theme.skyTop);
  const bottom = new THREE.Color(theme.skyBottom);
  const position = sky.geometry.attributes.position;
  const colors = sky.geometry.attributes.color;
  const colour = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i) / 320;
    const t = Math.pow(THREE.MathUtils.clamp(y * 0.5 + 0.5, 0, 1), 0.8);
    colour.copy(bottom).lerp(top, t);
    colors.setXYZ(i, colour.r, colour.g, colour.b);
  }
  colors.needsUpdate = true;
}

export function createScene() {
  const scene = new THREE.Scene();
  const theme = getMapTheme('random');
  // Starts past the far wall of the arena so fog reads as atmosphere rather
  // than something that hides an opponent.
  scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
  const sky = makeSky();
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, 2.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(theme.sun, theme.sunIntensity);
  sun.position.set(26, 42, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // Sized for the largest map (24-cell harbor, 96 units across).
  const half = 60;
  sun.shadow.camera.left = -half;
  sun.shadow.camera.right = half;
  sun.shadow.camera.top = half;
  sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 170;
  sun.shadow.bias = -0.0012;
  scene.add(sun);

  const floorMat = new THREE.MeshStandardMaterial({
    map: makeFloorTexture(theme),
    roughness: 0.94,
    metalness: 0.04,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_EXTENT, FLOOR_EXTENT), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  scene.userData.env = { sky, hemi, sun, floor, floorMat, mapId: 'random' };
  return scene;
}

/** Swap sky, fog, and floor to match the active map. */
export function applyMapTheme(scene, mapId) {
  const env = scene.userData.env;
  if (!env || env.mapId === mapId) return;

  const theme = getMapTheme(mapId);
  env.mapId = mapId;

  scene.fog.color.setHex(theme.fog);
  scene.fog.near = theme.fogNear;
  scene.fog.far = theme.fogFar;

  updateSkyColors(env.sky, theme);

  env.hemi.color.setHex(theme.hemiSky);
  env.hemi.groundColor.setHex(theme.hemiGround);
  env.sun.color.setHex(theme.sun);
  env.sun.intensity = theme.sunIntensity;

  if (env.floorMat.map) env.floorMat.map.dispose();
  env.floorMat.map = makeFloorTexture(theme);
  env.floorMat.needsUpdate = true;
}

/**
 * Builds meshes for one arena. Returns a group plus a dispose() so the next
 * round can swap geometry without leaking GPU memory.
 */
export function buildArena(scene, arena, mapId = 'random') {
  const group = new THREE.Group();
  const theme = getMapTheme(mapId);
  const size = arena.size || Math.round(Math.sqrt(arena.grid.length));

  const wallCells = [];
  const coverCells = [];
  const lowCells = [];
  const highCells = [];
  const deckCells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const tile = arena.grid[r * size + c];
      if (tile === TILE_WALL) wallCells.push({ c, r });
      else if (tile === TILE_COVER) coverCells.push({ c, r });
      else if (tile === TILE_LOW) lowCells.push({ c, r });
      else if (tile === TILE_HIGH) highCells.push({ c, r });
      else if (tile === TILE_DECK) deckCells.push({ c, r });
    }
  }

  const disposables = [];
  const matrix = new THREE.Matrix4();

  const addInstances = (cells, height, material, yOffset = 0, inset = 0) => {
    if (!cells.length) return null;
    const geometry = new THREE.BoxGeometry(CELL - inset, height, CELL - inset);
    const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    cells.forEach((cell, i) => {
      const { x, z } = cellCenter(cell.c, cell.r, size);
      matrix.makeTranslation(x, height / 2 + yOffset, z);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    disposables.push(geometry, material);
    if (material.map) disposables.push(material.map);
    return mesh;
  };

  // Themed maps bake their colour into a canvas texture; the plain colour
  // path keeps the random arena and FY Snow exactly as they were.
  const wallMat = theme.wallPattern
    ? new THREE.MeshStandardMaterial({
        map: makeBoxTexture(theme.wallPattern, theme),
        roughness: 0.82,
        metalness: 0.12,
      })
    : new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.82, metalness: 0.12 });

  addInstances(wallCells, WALL_H, wallMat);

  // Glowing lip along the top of every wall: cheap, and it makes the layout
  // readable at a glance.
  addInstances(
    wallCells,
    0.14,
    new THREE.MeshStandardMaterial({
      color: theme.wallCap,
      emissive: theme.wallEmissive,
      emissiveIntensity: theme.wallGlow,
      roughness: 0.5,
    }),
    WALL_H - 0.07,
    0.1,
  );

  // Blocks below wall height: crates (1.5), low steps (0.8), platforms (2.6)
  // and sniper decks (3.4). Each gets a body and a thin rim cap so heights
  // read at a glance. Patterns and colours fall back sensibly so themes only
  // override what makes them distinct.
  const boxMat = (pattern, color) =>
    pattern
      ? new THREE.MeshStandardMaterial({
          map: makeBoxTexture(pattern, theme),
          color: theme.coverPalette && pattern === 'container' ? 0xffffff : color,
          roughness: 0.7,
          metalness: 0.18,
        })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.18 });

  const capMat = (color, emissive, glow) =>
    new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: glow,
      roughness: 0.5,
    });

  // Shipping-container maps tint container boxes (and their caps) from a
  // palette, derived from cell coordinates so every client colours the yard
  // the same way.
  const paint = (mesh, cells, pattern) => {
    if (!mesh || !theme.coverPalette || pattern !== 'container') return;
    const colour = new THREE.Color();
    cells.forEach((cell, i) => {
      colour.setHex(theme.coverPalette[(cell.c * 7 + cell.r * 13) % theme.coverPalette.length]);
      mesh.setColorAt(i, colour);
    });
    mesh.instanceColor.needsUpdate = true;
  };

  const coverPattern = theme.coverPattern;
  paint(addInstances(coverCells, COVER_H, boxMat(coverPattern, theme.cover)), coverCells, coverPattern);
  paint(
    addInstances(
      coverCells,
      0.12,
      capMat(theme.coverCap, theme.coverEmissive, theme.coverGlow),
      COVER_H - 0.06,
      0.16,
    ),
    coverCells,
    coverPattern,
  );

  const lowPattern = 'lowPattern' in theme ? theme.lowPattern : coverPattern;
  paint(
    addInstances(lowCells, LOW_H, boxMat(lowPattern, theme.lowColor ?? theme.cover)),
    lowCells,
    lowPattern,
  );
  // Low steps get a dimmer rim so stair routes read as standable at a glance.
  paint(
    addInstances(
      lowCells,
      0.1,
      capMat(theme.coverCap, theme.coverEmissive, theme.coverGlow * 0.7),
      LOW_H - 0.05,
      0.2,
    ),
    lowCells,
    lowPattern,
  );

  const highPattern = 'highPattern' in theme ? theme.highPattern : theme.wallPattern;
  paint(
    addInstances(highCells, HIGH_H, boxMat(highPattern, theme.highColor ?? theme.wall)),
    highCells,
    highPattern,
  );
  paint(
    addInstances(
      highCells,
      0.12,
      capMat(theme.coverCap, theme.coverEmissive, theme.coverGlow),
      HIGH_H - 0.06,
      0.16,
    ),
    highCells,
    highPattern,
  );

  const deckPattern = 'deckPattern' in theme ? theme.deckPattern : theme.wallPattern;
  addInstances(deckCells, DECK_H, boxMat(deckPattern, theme.deckColor ?? theme.wall));
  addInstances(
    deckCells,
    0.14,
    capMat(theme.wallCap, theme.wallEmissive, theme.wallGlow),
    DECK_H - 0.07,
    0.12,
  );

  // Skyline props load asynchronously and check the disposed flag on arrival,
  // so a quick map switch never leaves a stray pyramid in the next arena.
  for (const prop of MAP_DECOR[mapId] || []) {
    mountArenaProp(group, prop);
  }

  scene.add(group);

  return {
    group,
    dispose() {
      group.userData.disposed = true;
      scene.remove(group);
      for (const item of disposables) item.dispose();
      group.traverse((child) => {
        if (child.isInstancedMesh) {
          child.dispose();
        } else if (child.isMesh) {
          child.geometry.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) material.dispose();
        }
      });
    },
  };
}

function makeMat(hex, { roughness = 0.85, metalness = 0.05, emissive = 0, emissiveIntensity = 0 } = {}) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
}

function boxPart(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Simple Minecraft-style face painted on a canvas texture. */
function makeFaceTexture(skinHex, accentHex) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = skinHex;
  ctx.fillRect(0, 0, size, size);

  // Eyes
  ctx.fillStyle = '#1a1f2a';
  ctx.fillRect(14, 24, 10, 10);
  ctx.fillRect(40, 24, 10, 10);
  ctx.fillStyle = '#f5f7fa';
  ctx.fillRect(16, 26, 4, 4);
  ctx.fillRect(42, 26, 4, 4);

  // Brows + mouth
  ctx.fillStyle = accentHex;
  ctx.fillRect(12, 18, 14, 3);
  ctx.fillRect(38, 18, 14, 3);
  ctx.fillStyle = '#5a3a2a';
  ctx.fillRect(24, 42, 16, 3);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Blocky third-person avatar (Minecraft / early Roblox style).
 * Parts hang from pivots so crouch, slide, and walk anims bend limbs.
 */
export function createAvatar(scene, slot) {
  const colorHex = SLOT_COLORS[slot % SLOT_COLORS.length];
  const accent = new THREE.Color(colorHex);
  const accentDark = accent.clone().multiplyScalar(0.55);
  const skinHex = '#e0b089';
  const pantHex = accentDark.getStyle();
  const shirtHex = accent.getStyle();

  const skinMat = makeMat(skinHex);
  const shirtMat = makeMat(shirtHex, { emissive: accent.getHex(), emissiveIntensity: 0.18 });
  const pantMat = makeMat(pantHex);
  const shoeMat = makeMat('#1c222c', { roughness: 0.7 });
  const faceMat = makeMat(skinHex);
  faceMat.map = makeFaceTexture(skinHex, colorHex);

  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);
  let blenderRig = null;

  // --- Legs (pivot at hip) ---
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.125, 0.72, 0);
  leftLeg.add(boxPart(0.22, 0.58, 0.24, pantMat, 0, -0.29, 0));
  leftLeg.add(boxPart(0.24, 0.12, 0.28, shoeMat, 0, -0.64, 0.02));
  root.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.125, 0.72, 0);
  rightLeg.add(boxPart(0.22, 0.58, 0.24, pantMat, 0, -0.29, 0));
  rightLeg.add(boxPart(0.24, 0.12, 0.28, shoeMat, 0, -0.64, 0.02));
  root.add(rightLeg);

  // --- Torso + head ---
  const torso = boxPart(0.5, 0.62, 0.28, shirtMat, 0, 1.03, 0);
  root.add(torso);

  // Neck stub
  root.add(boxPart(0.16, 0.1, 0.16, skinMat, 0, 1.39, 0));

  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  // Body of head (5 sides) + face on front (-Z, camera-facing when yaw=0)
  const headCube = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), [
    skinMat, // +X
    skinMat, // -X
    skinMat, // +Y
    skinMat, // -Y
    skinMat, // +Z back
    faceMat, // -Z front
  ]);
  headCube.castShadow = true;
  head.add(headCube);
  // Hair / helmet slab tinted with team colour
  head.add(boxPart(0.42, 0.1, 0.42, shirtMat, 0, 0.22, 0));
  root.add(head);

  // --- Arms (pivot at shoulder) ---
  // Gloved hands, matching the first-person viewmodel. Bare skin here reads as
  // part of the sand-coloured furniture on several of the guns.
  // Mid-slate gloves: bare skin reads as part of the sand-coloured furniture on
  // several guns, and a near-black glove disappears into their receivers.
  const gloveMat = makeMat('#5a6270', { roughness: 0.8 });

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.36, 1.28, 0);
  leftArm.add(boxPart(0.2, 0.58, 0.22, shirtMat, 0, -0.25, 0));
  leftArm.add(boxPart(0.16, 0.14, 0.15, gloveMat, 0, -0.56, 0));
  root.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.36, 1.28, 0);
  rightArm.add(boxPart(0.2, 0.58, 0.22, shirtMat, 0, -0.25, 0));
  rightArm.add(boxPart(0.16, 0.14, 0.15, gloveMat, 0, -0.56, 0));
  root.add(rightArm);

  // The weapon hangs off the right hand, so it stays attached no matter how the
  // arm is posed. gunHold cancels the arm's rotation to keep the barrel level.
  const gunHold = new THREE.Group();
  gunHold.position.set(0, -0.58, 0);
  rightArm.add(gunHold);

  let gun = null;
  let gunId = null;
  let hold = AVATAR_HOLDS.pistol;
  let meleeSwing = 0;
  let throwAnim = 0;
  let sneezeAnim = 0;
  const combinedArmRotation = new THREE.Quaternion();

  function applyHold() {
    hold = AVATAR_HOLDS[gunId] || AVATAR_HOLDS.pistol;
    rightArm.position.fromArray(hold.rightShoulder);
    leftArm.position.fromArray(hold.leftShoulder);
    if (gun) {
      if (blenderRig) {
        if (gunId === 'knife') gun.position.set(0, 0, -0.045);
        else if (gunId === 'poopgun') gun.position.set(0, 0.025, 0.02);
        else gun.position.set(0, 0.015, -0.015);
      } else {
        gun.position.fromArray(hold.gunOffset);
      }
    }
  }

  /** Pose both arms onto the weapon and keep the gun aimed down the body's -Z. */
  function holdArms(swing = 0, drop = 0) {
    if (blenderRig) {
      const right = blenderRig.rightArm;
      const left = blenderRig.leftArm;
      const rightForearm = blenderRig.rightForearm;
      const leftForearm = blenderRig.leftForearm;

      if (throwAnim > 0 && gunId === 'poopgun') {
        const t = 1 - throwAnim;
        const follow = Math.sin(Math.min(1, t) * Math.PI);
        // Cocked beside the shoulder, then extend rapidly toward the target.
        right.rotation.set(-0.58 - follow * 0.85, follow * 0.12, -0.32 - follow * 0.22);
        rightForearm.rotation.set(-1.05 + follow * 0.82, 0, follow * -0.18);
        left.rotation.set(-hold.leftArm[0] * 0.45, hold.leftArm[1], hold.leftArm[2] * 0.45);
        leftForearm.rotation.set(-0.5, 0, 0);
      } else if (sneezeAnim > 0 && gunId === 'sneeze') {
        // Raise the right hand to the face — always a beat late vs the spray.
        const t = 1 - sneezeAnim;
        let cover = 0;
        if (t < 0.3) cover = t / 0.3 * 0.55;
        else if (t < 0.55) cover = 0.55 + ((t - 0.3) / 0.25) * 0.45;
        else if (t < 0.75) cover = 1;
        else cover = 1 - (t - 0.75) / 0.25;
        right.rotation.set(-0.4 - cover * 1.15, cover * 0.35, -0.25 - cover * 0.4);
        rightForearm.rotation.set(-0.7 - cover * 0.9, 0, cover * 0.25);
        left.rotation.set(-hold.leftArm[0], hold.leftArm[1], hold.leftArm[2]);
        leftForearm.rotation.set(-0.55, 0, 0);
      } else if (gunId === 'poopgun') {
        right.rotation.set(-0.58, 0, -0.32);
        rightForearm.rotation.set(-1.05, 0, 0);
        left.rotation.set(-hold.leftArm[0] * 0.45, hold.leftArm[1], hold.leftArm[2] * 0.45);
        leftForearm.rotation.set(-0.5, 0, 0);
      } else if (meleeSwing > 0 && gunId === 'knife') {
        const t = 1 - meleeSwing;
        const slash = Math.sin(Math.min(1, t * 1.05) * Math.PI);
        const wind = Math.sin(Math.min(1, t * 2) * Math.PI) * (t < 0.35 ? 1 : 0);
        right.rotation.set(
          -0.55 - slash * 1.0 + wind * 0.35,
          slash * 0.45 - wind * 0.3,
          -0.3 - slash * 0.7 + wind * 0.35,
        );
        rightForearm.rotation.set(-0.5 - slash * 0.35, 0, slash * -0.2);
        // Keep the taunt arm raised and steady through the attack. The half
        // twist around the forearm axis turns the gesture outward so it aims
        // at the opponent instead of back at the player.
        left.rotation.set(-1.05, 0, 0.25);
        leftForearm.rotation.set(-1.95, Math.PI, 0);
      } else if (gunId === 'knife') {
        right.rotation.set(
          -hold.rightArm[0] * 0.72 + drop - swing * 0.04,
          hold.rightArm[1],
          hold.rightArm[2] * 0.72,
        );
        rightForearm.rotation.set(-0.35, 0, 0);
        // Taunt: raise the left fist so the extended middle finger points up,
        // with the hand twisted outward to face the opponent.
        left.rotation.set(-1.05 + drop * 0.4, 0, 0.25);
        leftForearm.rotation.set(-1.95, Math.PI, 0);
      } else {
        right.rotation.set(
          -hold.rightArm[0] * 0.72 + drop - swing * 0.04,
          hold.rightArm[1],
          hold.rightArm[2] * 0.72,
        );
        left.rotation.set(
          -hold.leftArm[0] * 0.72 + drop * 0.8 - swing * 0.035,
          hold.leftArm[1],
          hold.leftArm[2] * 0.72,
        );
        rightForearm.rotation.set(-0.62, 0, 0);
        leftForearm.rotation.set(-0.68, 0, 0);
      }

      // Knife taunt: curl every left finger except the extended middle one.
      const fingers = blenderRig.leftFingers;
      if (fingers) {
        const fold = gunId === 'knife' ? 1.5 : 0;
        fingers.index.rotation.x = fold;
        fingers.ring.rotation.x = fold;
        fingers.little.rotation.x = fold;
        fingers.thumb.rotation.x = gunId === 'knife' ? 1.1 : 0;
        fingers.middle.rotation.x = 0;
      }

      combinedArmRotation.copy(right.quaternion).multiply(rightForearm.quaternion);
      if (gunId === 'poopgun') {
        // A throwable follows the hand instead of being counter-rotated like a gun.
        gunHold.quaternion.identity();
      } else {
        gunHold.quaternion.copy(combinedArmRotation).invert();
        // Counter the imported player's 180-degree facing correction.
        gunHold.rotateY(Math.PI);
      }
      if (gun) {
        if (gunId === 'poopgun') {
          const throwT = 1 - throwAnim;
          gun.rotation.set(0, 0, 0);
          gun.visible = throwAnim === 0 || throwT < 0.08 || throwT > 0.84;
        } else if (meleeSwing > 0 && gunId === 'knife') {
          const t = 1 - meleeSwing;
          const slash = Math.sin(Math.min(1, t * 1.05) * Math.PI);
          gun.rotation.set(slash * 0.28, slash * 0.2, slash * -0.75);
        } else {
          gun.rotation.set(0, 0, 0);
        }
      }
      return;
    }

    if (throwAnim > 0 && gunId === 'poopgun') {
      const t = 1 - throwAnim;
      const follow = Math.sin(Math.min(1, t) * Math.PI);
      rightArm.rotation.set(
        hold.rightArm[0] - follow * 1.0,
        hold.rightArm[1] + follow * 0.18,
        hold.rightArm[2] - follow * 0.3,
      );
      leftArm.rotation.set(hold.leftArm[0] * 0.5, hold.leftArm[1], hold.leftArm[2] * 0.5);
      gunHold.quaternion.identity();
      if (gun) gun.visible = t < 0.08 || t > 0.84;
      return;
    }

    if (sneezeAnim > 0 && gunId === 'sneeze') {
      const t = 1 - sneezeAnim;
      let cover = 0;
      if (t < 0.3) cover = (t / 0.3) * 0.55;
      else if (t < 0.55) cover = 0.55 + ((t - 0.3) / 0.25) * 0.45;
      else if (t < 0.75) cover = 1;
      else cover = 1 - (t - 0.75) / 0.25;
      rightArm.rotation.set(
        hold.rightArm[0] - cover * 1.2,
        hold.rightArm[1] + cover * 0.4,
        hold.rightArm[2] - cover * 0.35,
      );
      leftArm.rotation.set(hold.leftArm[0], hold.leftArm[1], hold.leftArm[2]);
      gunHold.quaternion.identity();
      return;
    }

    if (meleeSwing > 0 && gunId === 'knife') {
      const t = 1 - meleeSwing;
      const slash = Math.sin(Math.min(1, t * 1.05) * Math.PI);
      const wind = Math.sin(Math.min(1, t * 2) * Math.PI) * (t < 0.35 ? 1 : 0);
      rightArm.rotation.set(
        hold.rightArm[0] - 0.55 + slash * 1.35 + wind * -0.4,
        hold.rightArm[1] + slash * 0.55 + wind * -0.35,
        hold.rightArm[2] - slash * 0.85 + wind * 0.4,
      );
      leftArm.rotation.set(
        hold.leftArm[0] + slash * 0.25,
        hold.leftArm[1],
        hold.leftArm[2] + slash * 0.2,
      );
      gunHold.quaternion.copy(rightArm.quaternion).invert();
      if (gun) {
        gun.rotation.set(slash * 0.35, slash * 0.25, slash * -0.9);
      }
      return;
    }

    rightArm.rotation.set(hold.rightArm[0] - drop + swing * 0.05, hold.rightArm[1], hold.rightArm[2]);
    leftArm.rotation.set(hold.leftArm[0] - drop * 0.8 + swing * 0.04, hold.leftArm[1], hold.leftArm[2]);
    gunHold.quaternion.copy(rightArm.quaternion).invert();
    if (gun) {
      gun.visible = true;
      gun.rotation.set(0, 0, 0);
    }
  }

  function disposeGun() {
    if (!gun) return;
    gunHold.remove(gun);
    gun.traverse((child) => {
      child.userData.disposed = true;
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) m.dispose();
      }
    });
    gun = null;
    gunId = null;
  }

  function setWeapon(id) {
    const next = AVATAR_GUN_BUILDERS[id] ? id : 'pistol';
    if (next === gunId) return;
    disposeGun();
    throwAnim = 0;
    sneezeAnim = 0;
    const build = AVATAR_GUN_BUILDERS[next] || AVATAR_GUN_BUILDERS.pistol;
    gun = build();
    gunId = next;
    gunHold.add(gun);
    applyHold();
    holdArms();
  }

  setWeapon('pistol');

  scene.add(group);
  mountBlockPlayer(group, { color: colorHex }).then((rig) => {
    if (!rig || group.userData.disposed) return;
    blenderRig = rig;
    root.visible = false;
    rig.rightHandSocket.add(gunHold);
    gunHold.position.set(0, 0, 0);
    applyHold();
    holdArms();
  });

  let walkPhase = 0;

  return {
    group,
    gun,
    setWeapon,
    playSwing() {
      meleeSwing = 1;
    },
    playThrow() {
      throwAnim = 1;
    },
    playSneeze() {
      sneezeAnim = 1;
    },
    setWeaponLength(length) {
      // Kept for older call sites; prefer setWeapon(id).
      if (gun) gun.scale.z = Math.max(0.6, length);
    },
    setCrouching(crouching) {
      this.setPose(crouching, false, 0);
    },
    setPose(crouching, sliding, moveSpeed = 0) {
      const speed = Math.max(0, moveSpeed);
      if (speed > 0.4 && !sliding) walkPhase += 0.18 * Math.min(speed / 5, 1.6);
      else walkPhase *= 0.85;

      if (meleeSwing > 0) meleeSwing = Math.max(0, meleeSwing - 0.085);
      if (throwAnim > 0) throwAnim = Math.max(0, throwAnim - 0.075);
      if (sneezeAnim > 0) sneezeAnim = Math.max(0, sneezeAnim - 0.055);

      const swing = Math.sin(walkPhase) * Math.min(1, speed / 4) * 0.55;

      if (sliding) {
        root.position.y = -0.15;
        root.rotation.x = 0.95;
        leftLeg.rotation.x = -1.1;
        rightLeg.rotation.x = -0.35;
        holdArms(0, 0.45);
        head.rotation.x = -0.25;
        if (blenderRig) {
          blenderRig.root.position.y = -0.15;
          blenderRig.root.rotation.x = 0.95;
          blenderRig.leftLeg.rotation.x = -1.1;
          blenderRig.rightLeg.rotation.x = -0.35;
          blenderRig.head.rotation.x = -0.25;
        }
      } else if (crouching) {
        root.position.y = -0.35;
        root.rotation.x = 0.18;
        leftLeg.rotation.x = -1.15 + swing * 0.2;
        rightLeg.rotation.x = -1.15 - swing * 0.2;
        holdArms(swing * 0.5, 0.12);
        head.rotation.x = 0.1;
        if (blenderRig) {
          blenderRig.root.position.y = -0.35;
          blenderRig.root.rotation.x = 0.18;
          blenderRig.leftLeg.rotation.x = -1.15 + swing * 0.2;
          blenderRig.rightLeg.rotation.x = -1.15 - swing * 0.2;
          blenderRig.head.rotation.x = 0.1;
        }
      } else {
        root.position.y = 0;
        root.rotation.x = 0;
        leftLeg.rotation.x = swing;
        rightLeg.rotation.x = -swing;
        holdArms(swing);
        head.rotation.x = 0;
        if (blenderRig) {
          blenderRig.root.position.y = 0;
          blenderRig.root.rotation.x = 0;
          blenderRig.leftLeg.rotation.x = swing;
          blenderRig.rightLeg.rotation.x = -swing;
          blenderRig.head.rotation.x = 0;
        }
      }
    },
    dispose() {
      disposeGun();
      group.userData.disposed = true;
      scene.remove(group);
      group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) {
            if (mat.map) mat.map.dispose();
            mat.dispose();
          }
        }
      });
    },
  };
}
