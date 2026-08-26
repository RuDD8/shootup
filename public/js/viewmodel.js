import * as THREE from '/vendor/three.module.js';

// The viewmodel lives in its own scene rendered after the world with the depth
// buffer cleared, which is the standard way to stop the gun clipping into walls.

// Metalness stays low: without an environment map to reflect, a high value
// renders as near-black no matter how bright the lights are.
const METAL = () =>
  new THREE.MeshStandardMaterial({ color: 0x69737f, roughness: 0.45, metalness: 0.3 });
const DARK = () =>
  new THREE.MeshStandardMaterial({ color: 0x373f4c, roughness: 0.66, metalness: 0.18 });
const ACCENT = () =>
  new THREE.MeshStandardMaterial({
    color: 0x0e141c,
    emissive: 0x37a2d8,
    emissiveIntensity: 1.3,
    roughness: 0.5,
  });

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function cylinder(r, h, material, x = 0, y = 0, z = 0, axis = 'z') {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), material);
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

// Each builder returns a group whose local -Z points down the barrel, with a
// `muzzle` marker at the tip for flash placement.
const BUILDERS = {
  pistol() {
    const g = new THREE.Group();
    const metal = METAL();
    const dark = DARK();
    g.add(box(0.075, 0.085, 0.24, metal, 0, 0, -0.06));
    g.add(box(0.065, 0.075, 0.2, dark, 0, -0.03, -0.02));
    g.add(box(0.06, 0.15, 0.075, dark, 0, -0.13, 0.05));
    g.add(box(0.03, 0.03, 0.05, ACCENT(), 0, 0.055, -0.12));
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0, -0.2);
    g.add(muzzle);
    g.userData.muzzle = muzzle;
    g.userData.length = 0.55;
    return g;
  },

  assault() {
    const g = new THREE.Group();
    const metal = METAL();
    const dark = DARK();
    g.add(box(0.07, 0.09, 0.52, metal, 0, 0, -0.14));
    g.add(cylinder(0.018, 0.3, dark, 0, 0.012, -0.5));
    g.add(box(0.055, 0.17, 0.1, dark, 0, -0.11, -0.06));
    g.add(box(0.05, 0.2, 0.08, metal, 0, -0.12, 0.02));
    g.add(box(0.06, 0.08, 0.2, dark, 0, -0.01, 0.16));
    g.add(box(0.024, 0.024, 0.1, ACCENT(), 0, 0.06, -0.06));
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.012, -0.66);
    g.add(muzzle);
    g.userData.muzzle = muzzle;
    g.userData.length = 1.1;
    return g;
  },

  shotgun() {
    const g = new THREE.Group();
    const metal = METAL();
    const dark = DARK();
    g.add(box(0.085, 0.1, 0.56, metal, 0, 0, -0.16));
    g.add(cylinder(0.032, 0.44, metal, 0, 0.02, -0.5));
    g.add(cylinder(0.026, 0.36, dark, 0, -0.04, -0.44));
    g.add(box(0.07, 0.07, 0.16, dark, 0, -0.045, -0.3));
    g.add(box(0.055, 0.19, 0.09, dark, 0, -0.12, 0.02));
    g.add(box(0.065, 0.09, 0.22, dark, 0, -0.02, 0.18));
    g.add(box(0.03, 0.03, 0.06, ACCENT(), 0, 0.07, -0.16));
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -0.72);
    g.add(muzzle);
    g.userData.muzzle = muzzle;
    g.userData.length = 1.15;
    return g;
  },

  sniper() {
    const g = new THREE.Group();
    const metal = METAL();
    const dark = DARK();
    g.add(box(0.07, 0.09, 0.7, metal, 0, 0, -0.2));
    g.add(cylinder(0.019, 0.62, dark, 0, 0.01, -0.78));
    g.add(cylinder(0.038, 0.26, dark, 0, 0.115, -0.2));
    g.add(cylinder(0.05, 0.05, ACCENT(), 0, 0.115, -0.33));
    g.add(box(0.055, 0.17, 0.1, dark, 0, -0.11, -0.02));
    g.add(box(0.065, 0.12, 0.3, dark, 0, -0.02, 0.24));
    g.add(box(0.028, 0.028, 0.12, ACCENT(), 0, 0.055, 0.1));
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.01, -1.08);
    g.add(muzzle);
    g.userData.muzzle = muzzle;
    g.userData.length = 1.5;
    return g;
  },
};

const HOME = new THREE.Vector3(0.2, -0.16, -0.52);
const SCOPED = new THREE.Vector3(0, -0.05, -0.34);
const VIEWMODEL_SCALE = 0.66;

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.01, 12);

    this.scene.add(new THREE.HemisphereLight(0xd6e7fa, 0x394559, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(0.6, 1.2, 0.9);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fc4ff, 0.9);
    rim.position.set(-0.8, 0.3, -0.6);
    this.scene.add(rim);

    this.holder = new THREE.Group();
    this.holder.scale.setScalar(VIEWMODEL_SCALE);
    this.scene.add(this.holder);

    this.weapon = null;
    this.weaponId = null;

    this.recoil = 0;
    this.bobTime = 0;
    this.sway = new THREE.Vector2();
    this.swayTarget = new THREE.Vector2();
    this.reloadPhase = 0;
    this.hidden = false;
  }

  setWeapon(id) {
    if (this.weaponId === id) return;
    this.clear();
    const build = BUILDERS[id] || BUILDERS.pistol;
    this.weapon = build();
    // Slight turn so the silhouette reads as a weapon rather than a slab.
    this.weapon.rotation.y = 0.09;
    this.weaponId = id;
    this.holder.add(this.weapon);
  }

  clear() {
    if (!this.weapon) return;
    this.holder.remove(this.weapon);
    this.weapon.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    this.weapon = null;
    this.weaponId = null;
  }

  get barrelLength() {
    return this.weapon ? this.weapon.userData.length : 1;
  }

  /** World position of the muzzle inside the viewmodel scene. */
  muzzlePosition(out) {
    if (!this.weapon) return out.set(0, 0, -0.5);
    return this.weapon.userData.muzzle.getWorldPosition(out);
  }

  addRecoil(amount) {
    this.recoil = Math.min(1.4, this.recoil + amount);
  }

  look(dYaw, dPitch) {
    // Gun trails the camera slightly when you swing the mouse.
    this.swayTarget.set(
      THREE.MathUtils.clamp(dYaw * 6, -0.09, 0.09),
      THREE.MathUtils.clamp(dPitch * 6, -0.07, 0.07),
    );
  }

  update(dt, { moving, onGround, zooming, reloading, reloadProgress }) {
    if (!this.weapon) return;

    this.hidden = Boolean(zooming);
    this.weapon.visible = !this.hidden;

    this.recoil *= Math.exp(-dt * 11);
    this.sway.lerp(this.swayTarget, Math.min(1, dt * 12));
    this.swayTarget.multiplyScalar(Math.exp(-dt * 7));

    if (moving && onGround) this.bobTime += dt * 9.5;
    else this.bobTime += dt * 1.6;

    const bobX = Math.cos(this.bobTime) * (moving && onGround ? 0.014 : 0.003);
    const bobY = Math.abs(Math.sin(this.bobTime)) * (moving && onGround ? 0.012 : 0.002);

    const home = zooming ? SCOPED : HOME;

    this.reloadPhase = reloading ? Math.min(1, this.reloadPhase + dt * 4) : Math.max(0, this.reloadPhase - dt * 5);
    const reloadDip = Math.sin(Math.PI * Math.min(1, reloadProgress || 0)) * this.reloadPhase;

    this.holder.position.set(
      home.x + this.sway.x + bobX,
      home.y + this.sway.y + bobY - reloadDip * 0.14,
      home.z + this.recoil * 0.075,
    );

    this.holder.rotation.set(
      this.recoil * 0.24 + reloadDip * 0.5,
      -this.sway.x * 1.6,
      this.sway.y * 0.9 + reloadDip * 0.3,
    );
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
