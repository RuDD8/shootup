import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/vendor/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
let assaultTemplate = null;

const assaultReady = loader.loadAsync('/models/assault_rifle.glb').then((gltf) => {
  assaultTemplate = gltf.scene;
  assaultTemplate.updateMatrixWorld(true);
  return assaultTemplate;
});

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
 * Mount the Blender rifle into a weapon group.
 * glTF flips Blender's -Y forward to +Z, so we rotate 180° around Y for the
 * game's -Z convention, then normalize length so FPS and avatar sizes stay stable.
 */
export async function mountAssaultRifle(
  parent,
  {
    targetLength = 0.78,
    castShadow = false,
    offset = { x: 0, y: -0.02, z: 0.04 },
  } = {},
) {
  try {
    const template = assaultTemplate || (await assaultReady);
    if (parent.userData.disposed) return false;

    const model = cloneTemplate(template, castShadow);
    model.name = 'Blender_Assault_Rifle';
    model.rotation.y = Math.PI;

    // Measure after the forward-axis flip so length matches in-game Z.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const length = Math.max(size.z, 0.001);
    const scale = targetLength / length;
    model.scale.setScalar(scale);

    // Keep the grip near the weapon-group origin used by hands / holds.
    model.position.set(offset.x, offset.y, offset.z);
    parent.add(model);
    return true;
  } catch (error) {
    console.error('Could not load assault rifle model:', error);
    return false;
  }
}
