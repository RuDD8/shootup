import * as THREE from '/vendor/three.module.js';
import {
  CELL,
  GRID_SIZE,
  WORLD_SIZE,
  WALL_H,
  COVER_H,
  TILE_WALL,
  TILE_COVER,
  SLOT_COLORS,
} from '/shared/constants.js';
import { cellCenter } from '/shared/arena.js';
import { AVATAR_GUN_BUILDERS, AVATAR_HOLDS } from './viewmodel.js';

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
};

function getMapTheme(mapId) {
  return MAP_THEMES[mapId] || MAP_THEMES.random;
}

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

  ctx.strokeStyle = theme.floorGrid;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(GRID_SIZE, GRID_SIZE);
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
  sun.shadow.mapSize.set(1024, 1024);
  const half = WORLD_SIZE * 0.62;
  sun.shadow.camera.left = -half;
  sun.shadow.camera.right = half;
  sun.shadow.camera.top = half;
  sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0012;
  scene.add(sun);

  const floorMat = new THREE.MeshStandardMaterial({
    map: makeFloorTexture(theme),
    roughness: 0.94,
    metalness: 0.04,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE), floorMat);
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

  const wallCells = [];
  const coverCells = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const tile = arena.grid[r * GRID_SIZE + c];
      if (tile === TILE_WALL) wallCells.push({ c, r });
      else if (tile === TILE_COVER) coverCells.push({ c, r });
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
      const { x, z } = cellCenter(cell.c, cell.r);
      matrix.makeTranslation(x, height / 2 + yOffset, z);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    disposables.push(geometry, material);
    return mesh;
  };

  addInstances(
    wallCells,
    WALL_H,
    new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.82, metalness: 0.12 }),
  );

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

  addInstances(
    coverCells,
    COVER_H,
    new THREE.MeshStandardMaterial({ color: theme.cover, roughness: 0.7, metalness: 0.18 }),
  );

  addInstances(
    coverCells,
    0.12,
    new THREE.MeshStandardMaterial({
      color: theme.coverCap,
      emissive: theme.coverEmissive,
      emissiveIntensity: theme.coverGlow,
      roughness: 0.5,
    }),
    COVER_H - 0.06,
    0.16,
  );

  scene.add(group);

  return {
    group,
    dispose() {
      scene.remove(group);
      for (const item of disposables) item.dispose();
      group.traverse((child) => {
        if (child.isInstancedMesh) child.dispose();
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

  function applyHold() {
    hold = AVATAR_HOLDS[gunId] || AVATAR_HOLDS.pistol;
    rightArm.position.fromArray(hold.rightShoulder);
    leftArm.position.fromArray(hold.leftShoulder);
    if (gun) gun.position.fromArray(hold.gunOffset);
  }

  /** Pose both arms onto the weapon and keep the gun aimed down the body's -Z. */
  function holdArms(swing = 0, drop = 0) {
    rightArm.rotation.set(hold.rightArm[0] - drop + swing * 0.05, hold.rightArm[1], hold.rightArm[2]);
    leftArm.rotation.set(hold.leftArm[0] - drop * 0.8 + swing * 0.04, hold.leftArm[1], hold.leftArm[2]);
    gunHold.quaternion.copy(rightArm.quaternion).invert();
  }

  function disposeGun() {
    if (!gun) return;
    gunHold.remove(gun);
    gun.traverse((child) => {
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
    const build = AVATAR_GUN_BUILDERS[next] || AVATAR_GUN_BUILDERS.pistol;
    gun = build();
    gunId = next;
    gunHold.add(gun);
    applyHold();
    holdArms();
  }

  setWeapon('pistol');

  scene.add(group);

  let walkPhase = 0;

  return {
    group,
    gun,
    setWeapon,
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

      const swing = Math.sin(walkPhase) * Math.min(1, speed / 4) * 0.55;

      if (sliding) {
        root.position.y = -0.15;
        root.rotation.x = 0.95;
        leftLeg.rotation.x = -1.1;
        rightLeg.rotation.x = -0.35;
        holdArms(0, 0.45);
        head.rotation.x = -0.25;
      } else if (crouching) {
        root.position.y = -0.35;
        root.rotation.x = 0.18;
        leftLeg.rotation.x = -1.15 + swing * 0.2;
        rightLeg.rotation.x = -1.15 - swing * 0.2;
        holdArms(swing * 0.5, 0.12);
        head.rotation.x = 0.1;
      } else {
        root.position.y = 0;
        root.rotation.x = 0;
        leftLeg.rotation.x = swing;
        rightLeg.rotation.x = -swing;
        holdArms(swing);
        head.rotation.x = 0;
      }
    },
    dispose() {
      disposeGun();
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
