import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/vendor/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const templates = new Map();
const loading = new Map();

function loadTemplate(url) {
  if (templates.has(url)) return Promise.resolve(templates.get(url));
  if (loading.has(url)) return loading.get(url);

  const promise = loader.loadAsync(url).then((gltf) => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    templates.set(url, scene);
    loading.delete(url);
    return scene;
  });
  loading.set(url, promise);
  return promise;
}

function cloneTemplate(template, castShadow) {
  const clone = template.clone(true);
  clone.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry = child.geometry.clone();
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone();
    child.castShadow = castShadow;
    child.receiveShadow = false;
  });
  return clone;
}

/**
 * Mount a Blender-authored weapon GLB into a weapon group.
 * glTF flips Blender's -Y forward to +Z, so we rotate 180° around Y for the
 * game's -Z convention, then normalize length so FPS and avatar sizes stay stable.
 */
async function mountWeaponModel(
  parent,
  {
    url,
    name,
    targetLength = 0.78,
    castShadow = false,
    offset = { x: 0, y: 0, z: 0 },
    yaw = Math.PI,
  },
) {
  try {
    const template = await loadTemplate(url);
    if (parent.userData.disposed) return false;

    const model = cloneTemplate(template, castShadow);
    model.name = name;
    model.rotation.y = yaw;

    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const length = Math.max(size.z, size.y, 0.001);
    model.scale.setScalar(targetLength / length);
    model.position.set(offset.x, offset.y, offset.z);
    parent.add(model);
    return true;
  } catch (error) {
    console.error(`Could not load weapon model ${url}:`, error);
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
    targetLength: 0.6,
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

export function mountSlugshotgun(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/slugshotgun.glb',
    name: 'Blender_Slugshotgun',
    targetLength: 1.1,
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

/** The flying "FAHH" projectile text; targetLength normalizes glyph height. */
export function mountFahhText(parent, options = {}) {
  return mountWeaponModel(parent, {
    url: '/models/fahh_text.glb',
    name: 'Blender_FAHH_Text',
    targetLength: 0.4,
    yaw: 0,
    ...options,
  });
}

/** Mount the complete Blender-authored first-person knife and arm composition. */
export async function mountKnifeViewModel(parent, { scale = 0.72 } = {}) {
  try {
    const template = await loadTemplate('/models/knife_viewmodel.glb');
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
    return model;
  } catch (error) {
    console.error('Could not load Blender knife viewmodel:', error);
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
