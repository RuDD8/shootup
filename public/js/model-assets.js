import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/vendor/addons/loaders/GLTFLoader.js';
import { assetUrl } from './runtime-config.js';

const loader = new GLTFLoader();
const templates = new Map();
const loading = new Map();

function loadTemplate(url) {
  const resolved = assetUrl(url);
  if (templates.has(resolved)) return Promise.resolve(templates.get(resolved));
  if (loading.has(resolved)) return loading.get(resolved);

  const promise = loader
    .loadAsync(resolved)
    .then((gltf) => {
      const scene = gltf.scene;
      scene.updateMatrixWorld(true);
      templates.set(resolved, scene);
      loading.delete(resolved);
      return scene;
    })
    .catch((error) => {
      loading.delete(resolved);
      throw error;
    });
  loading.set(resolved, promise);
  return promise;
}

function cloneTemplate(template, castShadow) {
  const clone = template.clone(true);
  clone.traverse((child) => {
    if (!child.isMesh) return;
    // Keep the cached template's geometry buffers — cloning them on every
    // weapon swap was hitching the main thread (Gun Game upgrades especially).
    child.userData.sharedGeometry = true;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone();
    child.castShadow = castShadow;
    child.receiveShadow = false;
  });
  return clone;
}

function templateBaseLength(template) {
  if (template.userData.baseLength) return template.userData.baseLength;
  template.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(template);
  const size = new THREE.Vector3();
  box.getSize(size);
  const length = Math.max(size.x, size.y, size.z, 0.001);
  template.userData.baseLength = length;
  return length;
}

/**
 * Mount a Blender-authored weapon GLB into a weapon group.
 * glTF flips Blender's -Y forward to +Z, so we rotate 180° around Y for the
 * game's -Z convention, then normalize length so FPS and avatar sizes stay stable.
 *
 * Pass `fallback` to hide the procedural stand-in as soon as the GLB attaches
 * (synchronously when the template is already cached), so swaps don't flash
 * the old blocky mesh for a frame.
 */
async function mountWeaponModel(
  parent,
  {
    url,
    name,
    targetLength = 0.78,
    castShadow = false,
    offset = { x: 0, y: 0, z: 0 },
    // Default: most Blender guns face +Z; flip so the muzzle points -Z (into the world).
    yaw = Math.PI,
    pitch = 0,
    roll = 0,
    fallback = null,
  },
) {
  try {
    const template = await loadTemplate(url);
    if (parent.userData.disposed) return false;

    const model = cloneTemplate(template, castShadow);
    model.name = name;
    model.rotation.set(pitch, yaw, roll);

    const length = templateBaseLength(template);
    model.scale.setScalar(targetLength / length);
    model.position.set(offset.x, offset.y, offset.z);
    model.userData.mountTune = {
      baseLength: length,
      targetLength,
      offset: { ...offset },
      pitch,
      yaw,
      roll,
    };
    parent.add(model);
    if (fallback) fallback.visible = false;
    return true;
  } catch (error) {
    console.error(`Could not load weapon model ${url}:`, error);
    if (fallback) fallback.visible = true;
    return false;
  }
}

/** Every first-person / world gun GLB we expect to swap in during a match. */
export const WEAPON_MODEL_URLS = [
  '/models/assault_rifle.glb',
  '/models/bayonet.glb',
  '/models/poop.glb',
  '/models/fahh_gun.glb',
  '/models/fahh_text.glb',
  '/models/banana.glb',
  '/models/banana_peel.glb',
  '/models/chancla.glb',
  '/models/airhorn.glb',
  '/models/pistol.glb',
  '/models/shotgun.glb',
  '/models/sniper.glb',
  '/models/revolver.glb',
  '/models/machinepistol.glb',
  '/models/deagle.glb',
  '/models/smg.glb',
  '/models/p90.glb',
  '/models/vector.glb',
  '/models/battlerifle.glb',
  '/models/burstrifle.glb',
  '/models/dmr.glb',
  '/models/carbine.glb',
  '/models/autoshotgun.glb',
  '/models/doublebarrel.glb',
  '/models/sawedoff.glb',
  '/models/scout.glb',
  '/models/awp.glb',
  '/models/lmg.glb',
  '/models/minigun.glb',
  '/models/crossbow.glb',
  '/models/leveraction.glb',
  '/models/laser.glb',
  '/models/bow.glb',
  '/models/arrow.glb',
  '/models/water_bottle.glb',
  '/models/napkin.glb',
  '/models/knife_viewmodel.glb',
  '/models/player_block.glb',
];

/** Warm the GLB template cache so the first equip doesn't flash a fallback. */
export async function preloadWeaponModels({
  onProgress = null,
  concurrency = 3,
} = {}) {
  const urls = WEAPON_MODEL_URLS.slice();
  const total = urls.length;
  let done = 0;
  let failed = 0;
  let cursor = 0;

  const notify = (url, ok) => {
    done += 1;
    if (!ok) failed += 1;
    onProgress?.({
      loaded: done,
      total,
      failed,
      url,
      fraction: total ? done / total : 1,
    });
  };

  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      try {
        await loadTemplate(url);
        notify(url, true);
      } catch {
        try {
          await loadTemplate(url);
          notify(url, true);
        } catch {
          console.error(`Weapon preload failed: ${url}`);
          notify(url, false);
        }
      }
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, total || 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return { total, failed };
}

/**
 * Mount a Blender-authored skyline prop into an arena group. Props are
 * decorative set dressing placed outside the playable border, so they carry
 * no collision. Scaled by height (glTF is Y-up) and grounded at y = 0.
 */
export async function mountArenaProp(parent, { url, height = 10, x = 0, z = 0, yaw = 0 }) {
  try {
    const template = await loadTemplate(url);
    if (parent.userData.disposed) return false;

    const model = cloneTemplate(template, false);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = height / Math.max(size.y, 0.001);
    model.scale.setScalar(scale);
    model.rotation.y = yaw;
    model.position.set(x, -box.min.y * scale, z);
    parent.add(model);
    return true;
  } catch (error) {
    console.error(`Could not load arena prop ${url}:`, error);
    return false;
  }
}

export function mountAssaultRifle(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/assault_rifle.glb',
    name: 'Blender_Assault_Rifle',
    targetLength: 0.78,
    offset: { x: 0, y: -0.02, z: 0.04 },
    ...options,
  });
}

export function mountBayonet(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/bayonet.glb',
    name: 'Blender_Bayonet',
    targetLength: 0.34,
    // Blender root is at the guard; shift back so the hand grips the handle.
    offset: { x: 0, y: 0.01, z: -0.05 },
    ...options,
  });
}

/** Mount the Blender-authored throwable used by viewmodels and avatars. */
export function mountPoopModel(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/poop.glb',
    name: 'Blender_Throwable_Poop',
    targetLength: 0.18,
    yaw: 0,
    ...options,
  });
}

export function mountFahhGun(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/fahh_gun.glb',
    name: 'Blender_FAHH_Gun',
    targetLength: 0.9,
    offset: { x: 0, y: 0, z: 0 },
    ...options,
  });
}

/** The banana gun's banana — also the flying projectile. */
export function mountBanana(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/banana.glb',
    name: 'Blender_Banana',
    targetLength: 0.4,
    ...options,
  });
}

/** A splayed banana peel lying on the floor; targetLength = footprint width. */
export function mountBananaPeel(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/banana_peel.glb',
    name: 'Blender_Banana_Peel',
    targetLength: 0.85,
    yaw: 0,
    ...options,
  });
}

/** La Chancla: the flying slipper of maternal justice. */
export function mountChancla(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/chancla.glb',
    name: 'Blender_Chancla',
    targetLength: 0.42,
    ...options,
  });
}

/** Blender-authored airhorn: red can + chrome bell; targetLength = height. */
export function mountAirhorn(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/airhorn.glb',
    name: 'Blender_Airhorn',
    targetLength: 0.2,
    ...options,
  });
}

export function mountPistol(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/pistol.glb',
    name: 'Blender_Pistol',
    targetLength: 0.5,
    ...options,
  });
}

export function mountShotgun(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/shotgun.glb',
    name: 'Blender_Shotgun',
    targetLength: 1.05,
    ...options,
  });
}

export function mountSniper(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/sniper.glb',
    name: 'Blender_Sniper',
    targetLength: 1.35,
    ...options,
  });
}

export function mountRevolver(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/revolver.glb',
    name: 'Blender_Revolver',
    targetLength: 0.55,
    ...options,
  });
}

export function mountMachinePistol(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/machinepistol.glb',
    name: 'Blender_Machine_Pistol',
    targetLength: 0.45,
    ...options,
  });
}

export function mountDeagle(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/deagle.glb',
    name: 'Blender_Deagle',
    targetLength: 0.42,
    // Asset is authored with the barrel on +X; rotate so muzzle faces -Z.
    yaw: -Math.PI / 2,
    ...options,
  });
}

export function mountSmg(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/smg.glb',
    name: 'Blender_Smg',
    targetLength: 0.5,
    ...options,
  });
}

export function mountP90(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/p90.glb',
    name: 'Blender_P90',
    targetLength: 0.5,
    ...options,
  });
}

export function mountVector(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/vector.glb',
    name: 'Blender_Vector',
    targetLength: 0.48,
    ...options,
  });
}

export function mountBattlerifle(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/battlerifle.glb',
    name: 'Blender_Battlerifle',
    targetLength: 0.65,
    ...options,
  });
}

export function mountBurstrifle(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/burstrifle.glb',
    name: 'Blender_Burstrifle',
    targetLength: 0.6,
    ...options,
  });
}

export function mountDmr(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/dmr.glb',
    name: 'Blender_Dmr',
    targetLength: 0.85,
    ...options,
  });
}

export function mountCarbine(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/carbine.glb',
    name: 'Blender_Carbine',
    targetLength: 0.5,
    ...options,
  });
}

export function mountAutoshotgun(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/autoshotgun.glb',
    name: 'Blender_Autoshotgun',
    targetLength: 0.95,
    ...options,
  });
}


export function mountDoublebarrel(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/doublebarrel.glb',
    name: 'Blender_Doublebarrel',
    targetLength: 1.0,
    ...options,
  });
}

export function mountSawedoff(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/sawedoff.glb',
    name: 'Blender_Sawedoff',
    targetLength: 0.45,
    ...options,
  });
}

export function mountScout(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/scout.glb',
    name: 'Blender_Scout',
    targetLength: 1.1,
    ...options,
  });
}

export function mountAwp(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/awp.glb',
    name: 'Blender_Awp',
    targetLength: 1.5,
    ...options,
  });
}

export function mountLmg(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/lmg.glb',
    name: 'Blender_Lmg',
    targetLength: 0.8,
    ...options,
  });
}

export function mountMinigun(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/minigun.glb',
    name: 'Blender_Minigun',
    targetLength: 0.7,
    ...options,
  });
}

export function mountCrossbow(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/crossbow.glb',
    name: 'Blender_Crossbow',
    targetLength: 0.6,
    ...options,
  });
}

export function mountLeveraction(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/leveraction.glb',
    name: 'Blender_Leveraction',
    targetLength: 0.9,
    ...options,
  });
}

export function mountLaser(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/laser.glb',
    name: 'Blender_Laser',
    targetLength: 0.5,
    ...options,
  });
}

/** Recurve bow body (no string or arrow — those animate in three.js). */
export function mountBow(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/bow.glb',
    name: 'Blender_Bow',
    targetLength: 0.72,
    ...options,
  });
}

/** Arrow for the bow: nocked in the viewmodel and carried during the rearm. */
export function mountArrow(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/arrow.glb',
    name: 'Blender_Arrow',
    targetLength: 0.6,
    ...options,
  });
}

/** The pee weapon's reload prop: a water bottle; targetLength = bottle height. */
export function mountWaterBottle(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/water_bottle.glb',
    name: 'Blender_Water_Bottle',
    targetLength: 0.24,
    yaw: 0,
    ...options,
  });
}

/** The sneeze weapon's reload prop: a crumpled napkin; targetLength = width. */
export function mountNapkin(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/napkin.glb',
    name: 'Blender_Napkin',
    targetLength: 0.16,
    yaw: 0,
    ...options,
  });
}

/** The flying "FAHH" projectile text; targetLength normalizes glyph width. */
export function mountFahhText(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/fahh_text.glb',
    name: 'Blender_FAHH_Text',
    targetLength: 1.35,
    yaw: 0,
    ...options,
  });
}

/** Mount the complete Blender-authored first-person knife and arm composition. */
export async function mountKnifeViewModel(parent, { scale = 0.72, fallback = null } = {}) {
  const url = '/models/knife_viewmodel.glb';
  try {
    const template = await loadTemplate(url);
    if (parent.userData.disposed) return false;

    const model = cloneTemplate(template, false);
    model.name = 'Blender_Knife_Viewmodel';
    model.scale.setScalar(scale);
    const knifePose = model.getObjectByName('Knife_Pose');
    if (knifePose) {
      // Present the broad blade face while preserving its authored vertical pose.
      knifePose.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0.55);
    }
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.frustumCulled = false;
      child.renderOrder = 3;
    });
    parent.add(model);
    if (fallback) fallback.visible = false;
    return model;
  } catch (error) {
    console.error('Could not load Blender knife viewmodel:', error);
    if (fallback) fallback.visible = true;
    return false;
  }
}

function recolorPlayer(model, color) {
  const accent = new THREE.Color(color);
  const dark = accent.clone().multiplyScalar(0.42);
  model.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material.name === 'PL_Shirt') {
        material.color.copy(accent);
      } else if (material.name === 'PL_ShirtDark' || material.name === 'PL_Pants') {
        material.color.copy(dark);
      } else if (material.name === 'PL_Accent') {
        material.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.25);
      }
    }
  });
}

/** Mount the articulated block-player and return its named animation pivots. */
export async function mountBlockPlayer(
  parent,
  { color = '#38bdf8', targetHeight = 1.84 } = {},
) {
  try {
    const template = await loadTemplate('/models/player_block.glb');
    if (parent.userData.disposed) return null;

    const model = cloneTemplate(template, true);
    model.name = 'Blender_Block_Player';
    model.rotation.y = Math.PI;
    model.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    model.scale.setScalar(targetHeight / Math.max(size.y, 0.001));
    recolorPlayer(model, color);
    parent.add(model);

    const required = (name) => {
      const node = model.getObjectByName(name);
      if (!node) throw new Error(`Player model is missing node: ${name}`);
      return node;
    };

    return {
      model,
      root: required('Player_Root'),
      head: required('Head_Pivot'),
      leftArm: required('LeftArm_Pivot'),
      rightArm: required('RightArm_Pivot'),
      leftForearm: required('LeftForearm_Pivot'),
      rightForearm: required('RightForearm_Pivot'),
      leftLeg: required('LeftLeg_Pivot'),
      rightLeg: required('RightLeg_Pivot'),
      rightHandSocket: required('RightHand_Socket'),
      leftFingers: {
        index: required('LeftFinger_Index_Pivot'),
        middle: required('LeftFinger_Middle_Pivot'),
        ring: required('LeftFinger_Ring_Pivot'),
        little: required('LeftFinger_Little_Pivot'),
        thumb: required('LeftThumb_Pivot'),
      },
    };
  } catch (error) {
    console.error('Could not load Blender player model:', error);
    return null;
  }
}
