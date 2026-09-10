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
