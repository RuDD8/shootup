import * as THREE from '/vendor/three.module.js';
import {
  CELL,
  GRID_SIZE,
  WORLD_SIZE,
  WALL_H,
  COVER_H,
  TILE_WALL,
  TILE_COVER,
  PLAYER_HEIGHT,
  SLOT_COLORS,
} from '/shared/constants.js';
import { cellCenter } from '/shared/arena.js';

const SKY_TOP = new THREE.Color('#1b2f4d');
const SKY_BOTTOM = new THREE.Color('#41618a');

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

function makeFloorTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2b3444';
  ctx.fillRect(0, 0, size, size);

  // Faint speckle keeps large floors from looking like flat colour.
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }

  ctx.strokeStyle = 'rgba(140, 190, 245, 0.38)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(GRID_SIZE, GRID_SIZE);
  texture.anisotropy = 4;
  return texture;
}

export function createScene() {
  const scene = new THREE.Scene();
  // Starts past the far wall of the arena so fog reads as atmosphere rather
  // than something that hides an opponent.
  scene.fog = new THREE.Fog(0x0d1421, 48, 175);
  scene.add(makeSky());

  const hemi = new THREE.HemisphereLight(0xc7ddf7, 0x4a5568, 2.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff4e2, 2.4);
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

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
    new THREE.MeshStandardMaterial({
      map: makeFloorTexture(),
      roughness: 0.94,
      metalness: 0.04,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  return scene;
}

/**
 * Builds meshes for one arena. Returns a group plus a dispose() so the next
 * round can swap geometry without leaking GPU memory.
 */
export function buildArena(scene, arena) {
  const group = new THREE.Group();

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
    new THREE.MeshStandardMaterial({ color: 0x5b6980, roughness: 0.82, metalness: 0.12 }),
  );

  // Glowing lip along the top of every wall: cheap, and it makes the layout
  // readable at a glance.
  addInstances(
    wallCells,
    0.14,
    new THREE.MeshStandardMaterial({
      color: 0x0b1118,
      emissive: 0x2f7fb5,
      emissiveIntensity: 1.5,
      roughness: 0.5,
    }),
    WALL_H - 0.07,
    0.1,
  );

  addInstances(
    coverCells,
    COVER_H,
    new THREE.MeshStandardMaterial({ color: 0x76839c, roughness: 0.7, metalness: 0.18 }),
  );

  addInstances(
    coverCells,
    0.12,
    new THREE.MeshStandardMaterial({
      color: 0x11161e,
      emissive: 0xd98b3a,
      emissiveIntensity: 1.2,
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

/** Third-person avatar used to draw the opponent. */
export function createAvatar(scene, slot) {
  const colorHex = SLOT_COLORS[slot % SLOT_COLORS.length];
  const color = new THREE.Color(colorHex);
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.5),
    roughness: 0.55,
    metalness: 0.25,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x0d131c,
    emissive: color,
    emissiveIntensity: 1.4,
    roughness: 0.4,
  });

  // Capsule arg is the cylinder section, so total height is length + 2 * radius.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.72, 6, 12), bodyMat);
  torso.position.y = 0.36 + 0.36 + 0.28;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 12), bodyMat);
  head.position.y = 1.58;
  head.castShadow = true;
  group.add(head);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.06), trimMat);
  visor.position.set(0, 1.6, -0.21);
  group.add(visor);

  const band = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.045, 8, 20), trimMat);
  band.rotation.x = Math.PI / 2;
  band.position.y = 1.06;
  group.add(band);

  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), bodyMat);
  legs.position.y = 0.41;
  legs.castShadow = true;
  group.add(legs);

  // Stand-in weapon so you can see roughly what they are holding.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.72), bodyMat);
  gun.position.set(0.26, 1.24, -0.42);
  gun.castShadow = true;
  group.add(gun);

  scene.add(group);

  return {
    group,
    gun,
    setWeaponLength(length) {
      gun.scale.z = length;
      gun.position.z = -0.2 - 0.36 * length;
    },
    setCrouching(crouching) {
      this.setPose(crouching, false);
    },
    setPose(crouching, sliding) {
      group.scale.y = crouching ? 0.68 : 1;
      group.rotation.x = sliding ? 0.42 : 0;
    },
    dispose() {
      scene.remove(group);
      group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    },
  };
}
