import * as THREE from '/vendor/three.module.js';
import {
  mountAssaultRifle,
  mountBayonet,
  mountFahhGun,
  mountKnifeViewModel,
  mountPoopModel,
} from './model-assets.js';

// The viewmodel lives in its own scene rendered after the world with the depth
// buffer cleared, which is the standard way to stop the gun clipping into walls.

function smoothstep01(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function mat(hex, { roughness = 0.55, metalness = 0.2, emissive = 0, emissiveIntensity = 0 } = {}) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function cyl(r, h, material, x = 0, y = 0, z = 0, axis = 'z') {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), material);
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  else if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

function addMuzzle(g, x, y, z, length) {
  const muzzle = new THREE.Object3D();
  muzzle.position.set(x, y, z);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.userData.length = length;
}

/** Angled pistol-style grip hanging below a pivot. */
function grip(material, tipMaterial, x, y, z, angle = 0.35) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.x = angle;
  group.add(box(0.055, 0.15, 0.075, material, 0, -0.075, 0));
  if (tipMaterial) group.add(box(0.058, 0.03, 0.078, tipMaterial, 0, -0.16, 0));
  return group;
}

// Distinct looks per gun so they are easy to tell apart at a glance.
const THEMES = {
  pistol: () => ({
    body: mat(0xc5ced8, { roughness: 0.32, metalness: 0.55 }),
    slide: mat(0x3d4654, { roughness: 0.4, metalness: 0.35 }),
    grip: mat(0x1a222c, { roughness: 0.85, metalness: 0.05 }),
    trim: mat(0xff6b4a, { roughness: 0.45, metalness: 0.2 }),
    glow: mat(0x0b1220, { emissive: 0x4ade80, emissiveIntensity: 1.4, roughness: 0.4 }),
    barrel: mat(0x12171f, { roughness: 0.5, metalness: 0.4 }),
  }),
  assault: () => ({
    body: mat(0x4f5d3a, { roughness: 0.7, metalness: 0.12 }),
    rail: mat(0x2f3640, { roughness: 0.55, metalness: 0.25 }),
    tan: mat(0xc4a574, { roughness: 0.75, metalness: 0.08 }),
    mag: mat(0x1e2620, { roughness: 0.8, metalness: 0.1 }),
    glow: mat(0x0b1220, { emissive: 0xfbbf24, emissiveIntensity: 1.3, roughness: 0.4 }),
    barrel: mat(0x1a1f24, { roughness: 0.45, metalness: 0.45 }),
    steel: mat(0x7d8794, { roughness: 0.35, metalness: 0.5 }),
  }),
  shotgun: () => ({
    wood: mat(0x8b5a2b, { roughness: 0.8, metalness: 0.05 }),
    woodDark: mat(0x5c3a1e, { roughness: 0.85, metalness: 0.04 }),
    blue: mat(0x3a4a63, { roughness: 0.35, metalness: 0.55 }),
    steel: mat(0x9aa3b0, { roughness: 0.3, metalness: 0.55 }),
    brass: mat(0xd4a24c, { roughness: 0.4, metalness: 0.55 }),
    glow: mat(0x0b1220, { emissive: 0xfb923c, emissiveIntensity: 1.35, roughness: 0.4 }),
  }),
  sniper: () => ({
    tan: mat(0xd2b48c, { roughness: 0.72, metalness: 0.08 }),
    olive: mat(0x3f4a32, { roughness: 0.7, metalness: 0.1 }),
    black: mat(0x1a1f26, { roughness: 0.55, metalness: 0.3 }),
    optic: mat(0x2a3340, { roughness: 0.4, metalness: 0.35 }),
    glass: mat(0x0b1220, { emissive: 0x38bdf8, emissiveIntensity: 1.5, roughness: 0.35 }),
    steel: mat(0x8b949e, { roughness: 0.35, metalness: 0.5 }),
  }),
  // --- Sidearms ---
  revolver: () => ({
    frame: mat(0x4a4e54, { roughness: 0.35, metalness: 0.55 }),
    cylinder: mat(0x5c6068, { roughness: 0.3, metalness: 0.5 }),
    barrel: mat(0x3a3e44, { roughness: 0.32, metalness: 0.5 }),
    wood: mat(0x6b3a1f, { roughness: 0.78, metalness: 0.05 }),
    brass: mat(0xd4a24c, { roughness: 0.4, metalness: 0.55 }),
    glow: mat(0x0b1220, { emissive: 0xfbbf24, emissiveIntensity: 1.3, roughness: 0.4 }),
  }),
  machinepistol: () => ({
    body: mat(0x2a2e34, { roughness: 0.5, metalness: 0.3 }),
    slide: mat(0x1a1e24, { roughness: 0.45, metalness: 0.35 }),
    grip: mat(0x111418, { roughness: 0.85, metalness: 0.05 }),
    mag: mat(0x1e2228, { roughness: 0.6, metalness: 0.2 }),
    trim: mat(0xff8c42, { roughness: 0.45, metalness: 0.2 }),
    barrel: mat(0x16191e, { roughness: 0.5, metalness: 0.4 }),
    glow: mat(0x0b1220, { emissive: 0xff8c42, emissiveIntensity: 1.3, roughness: 0.4 }),
  }),
  deagle: () => ({
    body: mat(0xd8dce2, { roughness: 0.2, metalness: 0.7 }),
    slide: mat(0xb8bcc2, { roughness: 0.22, metalness: 0.65 }),
    grip: mat(0x1a1e22, { roughness: 0.85, metalness: 0.05 }),
    gold: mat(0xc9a84c, { roughness: 0.3, metalness: 0.65 }),
    barrel: mat(0xa0a4aa, { roughness: 0.25, metalness: 0.6 }),
    glow: mat(0x0b1220, { emissive: 0xfbbf24, emissiveIntensity: 1.5, roughness: 0.35 }),
  }),
  // --- SMGs ---
  smg: () => ({
    body: mat(0x2e3238, { roughness: 0.5, metalness: 0.3 }),
    rail: mat(0x22262c, { roughness: 0.55, metalness: 0.25 }),
    grip: mat(0x14181c, { roughness: 0.85, metalness: 0.05 }),
    mag: mat(0x1a1e22, { roughness: 0.65, metalness: 0.15 }),
    barrel: mat(0x1a1e24, { roughness: 0.45, metalness: 0.4 }),
    steel: mat(0x6e7680, { roughness: 0.35, metalness: 0.45 }),
    glow: mat(0x0b1220, { emissive: 0x60a5fa, emissiveIntensity: 1.3, roughness: 0.4 }),
  }),
  p90: () => ({
    body: mat(0x262a30, { roughness: 0.55, metalness: 0.25 }),
    shell: mat(0x1e2228, { roughness: 0.6, metalness: 0.2 }),
    mag: mat(0x32363c, { roughness: 0.5, metalness: 0.2 }),
    barrel: mat(0x181c20, { roughness: 0.45, metalness: 0.4 }),
    sight: mat(0x2a2e34, { roughness: 0.4, metalness: 0.3 }),
    glow: mat(0x0b1220, { emissive: 0x4ade80, emissiveIntensity: 1.3, roughness: 0.4 }),
  }),
  vector: () => ({
    body: mat(0x1e2228, { roughness: 0.5, metalness: 0.3 }),
    rail: mat(0x282c32, { roughness: 0.5, metalness: 0.25 }),
    grip: mat(0x111418, { roughness: 0.85, metalness: 0.05 }),
    mag: mat(0x1a1e22, { roughness: 0.65, metalness: 0.15 }),
    stock: mat(0x222630, { roughness: 0.55, metalness: 0.2 }),
    barrel: mat(0x16191e, { roughness: 0.45, metalness: 0.4 }),
    glow: mat(0x0b1220, { emissive: 0xfbbf24, emissiveIntensity: 1.3, roughness: 0.4 }),
  }),
  // --- Rifles ---
  battlerifle: () => ({
    body: mat(0x4f5d3a, { roughness: 0.65, metalness: 0.15 }),
    rail: mat(0x2f3640, { roughness: 0.55, metalness: 0.25 }),
    tan: mat(0xc4a574, { roughness: 0.75, metalness: 0.08 }),
    mag: mat(0x2a3228, { roughness: 0.7, metalness: 0.1 }),
    barrel: mat(0x1a1f24, { roughness: 0.45, metalness: 0.45 }),
    steel: mat(0x7d8794, { roughness: 0.35, metalness: 0.5 }),
    glow: mat(0x0b1220, { emissive: 0xff8c42, emissiveIntensity: 1.3, roughness: 0.4 }),
  }),
  burstrifle: () => ({
    body: mat(0x3a4a32, { roughness: 0.65, metalness: 0.12 }),
    rail: mat(0x2a3238, { roughness: 0.55, metalness: 0.25 }),
    handguard: mat(0x444e3a, { roughness: 0.7, metalness: 0.1 }),
    mag: mat(0x1e2620, { roughness: 0.75, metalness: 0.1 }),
    barrel: mat(0x1a1f24, { roughness: 0.45, metalness: 0.45 }),
    steel: mat(0x8a929c, { roughness: 0.35, metalness: 0.5 }),
    glow: mat(0x0b1220, { emissive: 0xf87171, emissiveIntensity: 1.3, roughness: 0.4 }),
  }),
  dmr: () => ({
    body: mat(0x3f4a32, { roughness: 0.68, metalness: 0.12 }),
    rail: mat(0x2f3640, { roughness: 0.55, metalness: 0.25 }),
    tan: mat(0xc4a574, { roughness: 0.72, metalness: 0.08 }),
    optic: mat(0x2a3340, { roughness: 0.4, metalness: 0.35 }),
    glass: mat(0x0b1220, { emissive: 0x38bdf8, emissiveIntensity: 1.4, roughness: 0.35 }),
    barrel: mat(0x1a1f24, { roughness: 0.42, metalness: 0.45 }),
    steel: mat(0x7d8794, { roughness: 0.35, metalness: 0.5 }),
    glow: mat(0x0b1220, { emissive: 0x60a5fa, emissiveIntensity: 1.3, roughness: 0.4 }),
  }),
  carbine: () => ({
    body: mat(0xb8a07a, { roughness: 0.7, metalness: 0.1 }),
    rail: mat(0x3a3e42, { roughness: 0.55, metalness: 0.25 }),
    green: mat(0x4a5a3a, { roughness: 0.65, metalness: 0.1 }),
    mag: mat(0x2a3228, { roughness: 0.7, metalness: 0.1 }),
    barrel: mat(0x1a1f24, { roughness: 0.45, metalness: 0.45 }),
    steel: mat(0x7d8794, { roughness: 0.35, metalness: 0.5 }),
    glow: mat(0x0b1220, { emissive: 0xfbbf24, emissiveIntensity: 1.3, roughness: 0.4 }),
  }),
  // --- Shotguns ---
  autoshotgun: () => ({
    body: mat(0x3a4a63, { roughness: 0.38, metalness: 0.5 }),
    wood: mat(0x5c3a1e, { roughness: 0.82, metalness: 0.05 }),
    steel: mat(0x8a929c, { roughness: 0.32, metalness: 0.5 }),
    mag: mat(0x2a3038, { roughness: 0.5, metalness: 0.3 }),
    barrel: mat(0x3a4050, { roughness: 0.35, metalness: 0.5 }),
    glow: mat(0x0b1220, { emissive: 0xff6b4a, emissiveIntensity: 1.35, roughness: 0.4 }),
  }),
  slugshotgun: () => ({
    body: mat(0x3e4e68, { roughness: 0.34, metalness: 0.52 }),
    wood: mat(0x7a4a22, { roughness: 0.78, metalness: 0.05 }),
    woodDark: mat(0x4e2e12, { roughness: 0.82, metalness: 0.04 }),
    steel: mat(0x9aa3b0, { roughness: 0.3, metalness: 0.55 }),
    brass: mat(0xd4a24c, { roughness: 0.4, metalness: 0.55 }),
    glow: mat(0x0b1220, { emissive: 0xfbbf24, emissiveIntensity: 1.3, roughness: 0.4 }),
  }),
  doublebarrel: () => ({
    body: mat(0x3a4858, { roughness: 0.36, metalness: 0.5 }),
    wood: mat(0x8b5a2b, { roughness: 0.8, metalness: 0.05 }),
    woodDark: mat(0x5c3a1e, { roughness: 0.85, metalness: 0.04 }),
    steel: mat(0x9aa3b0, { roughness: 0.3, metalness: 0.55 }),
    brass: mat(0xd4a24c, { roughness: 0.4, metalness: 0.55 }),
    glow: mat(0x0b1220, { emissive: 0xfb923c, emissiveIntensity: 1.35, roughness: 0.4 }),
  }),
  // --- Snipers ---
  scout: () => ({
    body: mat(0x4a5a3a, { roughness: 0.68, metalness: 0.1 }),
    tan: mat(0xc8b48a, { roughness: 0.72, metalness: 0.08 }),
    black: mat(0x1a1f26, { roughness: 0.55, metalness: 0.3 }),
    optic: mat(0x2a3340, { roughness: 0.4, metalness: 0.35 }),
    glass: mat(0x0b1220, { emissive: 0x38bdf8, emissiveIntensity: 1.5, roughness: 0.35 }),
    steel: mat(0x8b949e, { roughness: 0.35, metalness: 0.5 }),
  }),
  awp: () => ({
    body: mat(0x2a3428, { roughness: 0.65, metalness: 0.12 }),
    stock: mat(0x222c1e, { roughness: 0.7, metalness: 0.1 }),
    black: mat(0x14181c, { roughness: 0.55, metalness: 0.3 }),
    optic: mat(0x222c34, { roughness: 0.38, metalness: 0.35 }),
    glass: mat(0x0b1220, { emissive: 0x4ade80, emissiveIntensity: 1.5, roughness: 0.35 }),
    steel: mat(0x6e7880, { roughness: 0.35, metalness: 0.5 }),
  }),
  // --- Heavy ---
  lmg: () => ({
    body: mat(0x3a3e44, { roughness: 0.5, metalness: 0.35 }),
    rail: mat(0x2a2e34, { roughness: 0.55, metalness: 0.3 }),
    barrel: mat(0x22262c, { roughness: 0.42, metalness: 0.45 }),
    mag: mat(0x2a2e34, { roughness: 0.55, metalness: 0.25 }),
    brass: mat(0xd4a24c, { roughness: 0.4, metalness: 0.55 }),
    steel: mat(0x6e7880, { roughness: 0.35, metalness: 0.5 }),
    glow: mat(0x0b1220, { emissive: 0xfbbf24, emissiveIntensity: 1.3, roughness: 0.4 }),
  }),
  minigun: () => ({
    body: mat(0x2e3238, { roughness: 0.45, metalness: 0.4 }),
    barrels: mat(0x3a3e44, { roughness: 0.35, metalness: 0.5 }),
    housing: mat(0x22262c, { roughness: 0.5, metalness: 0.35 }),
    brass: mat(0xd4a24c, { roughness: 0.4, metalness: 0.55 }),
    grip: mat(0x1a1e22, { roughness: 0.8, metalness: 0.05 }),
    glow: mat(0x0b1220, { emissive: 0xf87171, emissiveIntensity: 1.4, roughness: 0.4 }),
  }),
  // --- Exotic ---
  crossbow: () => ({
    body: mat(0x6b4420, { roughness: 0.75, metalness: 0.08 }),
    rail: mat(0x4a3218, { roughness: 0.7, metalness: 0.1 }),
    limb: mat(0x2a2e34, { roughness: 0.5, metalness: 0.3 }),
    brass: mat(0xd4a24c, { roughness: 0.4, metalness: 0.55 }),
    string: mat(0xc8c0b0, { roughness: 0.9, metalness: 0.02 }),
    steel: mat(0x7d8794, { roughness: 0.35, metalness: 0.5 }),
  }),
  sawedoff: () => ({
    wood: mat(0x7a4a22, { roughness: 0.8, metalness: 0.05 }),
    woodDark: mat(0x4e2e12, { roughness: 0.85, metalness: 0.04 }),
    steel: mat(0x3a4a63, { roughness: 0.35, metalness: 0.55 }),
    barrel: mat(0x4a5a70, { roughness: 0.32, metalness: 0.5 }),
    brass: mat(0xd4a24c, { roughness: 0.4, metalness: 0.55 }),
    glow: mat(0x0b1220, { emissive: 0xfb923c, emissiveIntensity: 1.35, roughness: 0.4 }),
  }),
  leveraction: () => ({
    wood: mat(0x8b5a2b, { roughness: 0.78, metalness: 0.05 }),
    woodDark: mat(0x5c3a1e, { roughness: 0.85, metalness: 0.04 }),
    brass: mat(0xd4a24c, { roughness: 0.4, metalness: 0.55 }),
    blue: mat(0x3a4a63, { roughness: 0.35, metalness: 0.55 }),
    steel: mat(0x8a929c, { roughness: 0.32, metalness: 0.5 }),
    glow: mat(0x0b1220, { emissive: 0xfbbf24, emissiveIntensity: 1.3, roughness: 0.4 }),
  }),
  // --- Special ---
  bow: () => ({
    wood: mat(0x8b6530, { roughness: 0.78, metalness: 0.05 }),
    leather: mat(0x5c4028, { roughness: 0.82, metalness: 0.04 }),
    string: mat(0xd0c8b8, { roughness: 0.9, metalness: 0.02 }),
    dark: mat(0x3a2e20, { roughness: 0.8, metalness: 0.06 }),
    tip: mat(0x6e7880, { roughness: 0.35, metalness: 0.45 }),
  }),
  laser: () => ({
    body: mat(0xe8eef4, { roughness: 0.2, metalness: 0.6 }),
    dark: mat(0x2a3040, { roughness: 0.4, metalness: 0.35 }),
    cyan: mat(0x0b1220, { emissive: 0x22d3ee, emissiveIntensity: 2.0, roughness: 0.3 }),
    glass: mat(0x0b1220, { emissive: 0x38bdf8, emissiveIntensity: 1.8, roughness: 0.3 }),
    grip: mat(0x1a2030, { roughness: 0.7, metalness: 0.15 }),
    chrome: mat(0xc0c8d0, { roughness: 0.15, metalness: 0.7 }),
  }),
  poopgun: () => ({
    body: mat(0x7a5c2a, { roughness: 0.75, metalness: 0.08 }),
    tank: mat(0x4a8a3a, { roughness: 0.7, metalness: 0.1 }),
    nozzle: mat(0x5a4220, { roughness: 0.6, metalness: 0.15 }),
    grip: mat(0x3a6a2a, { roughness: 0.8, metalness: 0.05 }),
    trim: mat(0x8a6a22, { roughness: 0.65, metalness: 0.1 }),
    glow: mat(0x0b1220, { emissive: 0xa3e635, emissiveIntensity: 1.4, roughness: 0.4 }),
  }),
  fahgun: () => ({
    body: mat(0x556644, { roughness: 0.68, metalness: 0.14 }),
    dark: mat(0x232a30, { roughness: 0.55, metalness: 0.3 }),
    accent: mat(0xd8352a, { roughness: 0.5, metalness: 0.15 }),
    steel: mat(0x848d99, { roughness: 0.35, metalness: 0.5 }),
    glow: mat(0x0b1220, { emissive: 0xff7a1f, emissiveIntensity: 1.6, roughness: 0.4 }),
  }),
  knife: () => ({
    blade: mat(0x4a5060, { roughness: 0.2, metalness: 0.7 }),
    edge: mat(0xc0c8d0, { roughness: 0.15, metalness: 0.75 }),
    guard: mat(0x2a2e34, { roughness: 0.4, metalness: 0.5 }),
    handle: mat(0x1a1e22, { roughness: 0.8, metalness: 0.08 }),
    trim: mat(0xc0282a, { roughness: 0.45, metalness: 0.3 }),
  }),
};

/** Classic pistol iron sights: rear notch + front post. */
function pistolIronSights(g, bodyMat, glowMat, slideTopY = 0.079) {
  // Rear sight block with notch (two posts + base)
  g.add(box(0.05, 0.012, 0.03, bodyMat, 0, slideTopY, 0.035));
  g.add(box(0.012, 0.028, 0.028, bodyMat, -0.018, slideTopY + 0.016, 0.035));
  g.add(box(0.012, 0.028, 0.028, bodyMat, 0.018, slideTopY + 0.016, 0.035));
  // Rear glow inserts
  g.add(box(0.008, 0.01, 0.008, glowMat, -0.018, slideTopY + 0.022, 0.022));
  g.add(box(0.008, 0.01, 0.008, glowMat, 0.018, slideTopY + 0.022, 0.022));
  // Front post
  g.add(box(0.012, 0.032, 0.014, bodyMat, 0, slideTopY + 0.016, -0.155));
  g.add(box(0.008, 0.01, 0.008, glowMat, 0, slideTopY + 0.03, -0.155));
}

/** Holo / red-dot optic for rifles — window frame + glowing reticle glass. */
function redDotOptic(g, housingMat, glassMat, accentMat, x = 0, y = 0.1, z = -0.02) {
  const optic = new THREE.Group();
  optic.position.set(x, y, z);

  // Rail mount
  optic.add(box(0.04, 0.02, 0.1, housingMat, 0, -0.02, 0));
  // Optic body
  optic.add(box(0.055, 0.045, 0.08, housingMat, 0, 0.015, 0));
  // Hood / window frame (open middle via four sides)
  optic.add(box(0.06, 0.01, 0.01, housingMat, 0, 0.055, -0.03)); // top
  optic.add(box(0.01, 0.05, 0.01, housingMat, -0.025, 0.03, -0.03)); // left
  optic.add(box(0.01, 0.05, 0.01, housingMat, 0.025, 0.03, -0.03)); // right
  optic.add(box(0.06, 0.01, 0.01, housingMat, 0, 0.005, -0.03)); // bottom of window
  // Glass pane with glowing reticle
  optic.add(box(0.04, 0.038, 0.008, glassMat, 0, 0.03, -0.028));
  // Bright center dot
  optic.add(box(0.008, 0.008, 0.01, accentMat, 0, 0.03, -0.034));
  // Side dial / brightness knob
  optic.add(cyl(0.012, 0.02, housingMat, 0.032, 0.02, 0.01, 'x'));
  optic.add(box(0.01, 0.01, 0.01, accentMat, 0.04, 0.02, 0.01));

  g.add(optic);
}

// Match the Blender avatar's deliberately simple block gloves. First-person
// fingers looked like a different character and obscured smaller weapons.
const GLOVE = () => mat(0x141a21, { roughness: 0.8, metalness: 0.08 });
const FINGER = () => mat(0xd0a07b, { roughness: 0.82, metalness: 0.01 });
const SLEEVE = () => mat(0x2b3a52, { roughness: 0.85, metalness: 0.04 });
const CUFF = () => mat(0x0d1117, { roughness: 0.85, metalness: 0.05 });

/**
 * Sleeved forearm receding toward the camera. `pitch` drops the far end,
 * `yaw` swings it outward, so the arm leaves the bottom of the frame.
 */
function forearm(pitch, yaw, length) {
  const sleeve = SLEEVE();
  const cuff = CUFF();
  const arm = new THREE.Group();
  arm.rotation.set(pitch, yaw, 0);
  arm.add(box(0.086, 0.086, 0.05, cuff, 0, 0, 0.045));
  arm.add(box(0.094, 0.094, length, sleeve, 0, 0, 0.07 + length / 2));
  return arm;
}

// Because the weapon is yawed and offset to the right of the camera, it is the
// weapon's LEFT flank that faces the player. Both hands therefore put their
// readable detail — knuckles, fingertips, thumb — on the -X side.

/**
 * Left block-glove supporting the weapon from underneath.
 */
function supportHand({ x, y, z, rise = 0.05, spread = 0, armPitch = 0.95, armYaw = -0.42, armLength = 0.5 }) {
  const glove = GLOVE();
  const fingerMat = FINGER();
  const cuff = CUFF();
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const handX = -0.008 - spread;
  const handY = -0.023;

  // Block palm with four separate cuboid fingers and a thumb.
  g.add(box(0.1, 0.065, 0.12, glove, handX, handY, 0.012));
  for (let i = 0; i < 4; i++) {
    g.add(box(
      0.032,
      0.04 + rise * 0.25,
      0.026,
      fingerMat,
      handX - 0.052,
      handY + 0.018,
      -0.03 + i * 0.031,
    ));
  }
  g.add(box(0.034, 0.045, 0.075, fingerMat, handX + 0.055, handY + 0.012, -0.018));
  g.add(box(0.105, 0.07, 0.055, cuff, handX, handY - 0.006, 0.096));
  const wrist = new THREE.Group();
  wrist.position.set(handX, handY - 0.008, 0.106);
  wrist.add(forearm(armPitch, armYaw, armLength));
  g.add(wrist);

  return g;
}

/**
 * Right block-glove centered around a weapon's pistol grip.
 */
function triggerHand({
  x,
  y,
  z,
  armPitch = 0.78,
  armYaw = 0.32,
  armLength = 0.36,
  verticalGrip = false,
}) {
  const glove = GLOVE();
  const fingerMat = FINGER();
  const cuff = CUFF();
  const g = new THREE.Group();
  g.position.set(x, y, z);

  // Block palm plus distinct fingers wrapping the grip.
  const hand = box(0.09, 0.12, 0.1, glove, 0.025, 0, 0.012);
  hand.rotation.z = -0.08;
  g.add(hand);
  for (let i = 0; i < 4; i++) {
    if (verticalGrip) {
      g.add(box(0.055, 0.022, 0.02, fingerMat, -0.012, 0.13, -0.055 + i * 0.026));
    } else {
      const fy = 0.045 - i * 0.03;
      g.add(box(0.055, 0.021, 0.03, fingerMat, -0.012, fy + 0.09, -0.05));
    }
  }
  g.add(box(0.028, 0.032, 0.058, fingerMat, -0.038, 0.12, 0.012));
  g.add(box(0.105, 0.09, 0.055, cuff, 0.035, 0.025, 0.076));
  const wrist = new THREE.Group();
  wrist.position.set(0.048, 0.028, 0.088);
  wrist.add(forearm(armPitch, armYaw, armLength));
  g.add(wrist);

  return g;
}

/** Relaxed off-hand used by the Counter-Strike-style knife stance. */
function readyHand({ x, y, z }) {
  const glove = GLOVE();
  const fingerMat = FINGER();
  const cuff = CUFF();
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(-0.08, -0.12, 0.16);

  g.add(box(0.11, 0.09, 0.065, glove, 0, 0, 0));
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Group();
    finger.position.set(0.047, -0.027 + i * 0.018, -0.008);
    finger.rotation.z = 0.08 - i * 0.025;
    const length = 0.044 - Math.abs(1.5 - i) * 0.004;
    finger.add(box(length, 0.021, 0.03, fingerMat, length / 2, 0, 0));
    const tip = new THREE.Group();
    tip.position.set(length, 0, 0);
    tip.rotation.z = -0.52;
    tip.add(box(0.03, 0.02, 0.029, fingerMat, 0.015, 0, 0));
    finger.add(tip);
    g.add(finger);
  }

  const thumb = box(0.054, 0.026, 0.034, fingerMat, 0.027, -0.052, -0.002);
  thumb.rotation.z = -0.42;
  g.add(thumb);
  g.add(box(0.105, 0.068, 0.05, cuff, 0, 0, 0.078));

  const wrist = new THREE.Group();
  wrist.position.set(0, 0, 0.096);
  wrist.add(forearm(0.62, -0.28, 0.3));
  g.add(wrist);
  return g;
}

const BUILDERS = {
  pistol() {
    const g = new THREE.Group();
    const t = THEMES.pistol();

    // Slide on top
    g.add(box(0.078, 0.048, 0.22, t.slide, 0, 0.055, -0.06));
    // Frame under slide
    g.add(box(0.072, 0.05, 0.2, t.body, 0, 0.01, -0.05));
    // Dust cover / barrel housing
    g.add(box(0.05, 0.035, 0.1, t.barrel, 0, 0.02, -0.2));
    g.add(cyl(0.012, 0.07, t.barrel, 0, 0.02, -0.255));
    // Grip
    g.add(grip(t.grip, t.trim, 0, -0.01, 0.04, 0.32));
    // Trigger guard ring (open look via U shape of boxes)
    g.add(box(0.045, 0.012, 0.06, t.body, 0, -0.035, -0.02));
    g.add(box(0.012, 0.05, 0.012, t.body, -0.016, -0.055, -0.02));
    g.add(box(0.012, 0.05, 0.012, t.body, 0.016, -0.055, -0.02));
    g.add(box(0.014, 0.035, 0.012, t.trim, 0, -0.04, -0.015));
    // Mag floorplate
    g.add(box(0.05, 0.02, 0.065, t.trim, 0, -0.175, 0.055));
    // Side serrations strip
    g.add(box(0.082, 0.02, 0.05, t.body, 0, 0.055, 0.02));
    // Real iron sights
    pistolIronSights(g, t.slide, t.glow);

    // Right hand on the grip; left hand cups it from below-left.
    g.add(triggerHand({ x: 0, y: -0.085, z: 0.015, armPitch: 0.82, armYaw: 0.28, armLength: 0.32 }));
    g.add(supportHand({ x: 0, y: -0.15, z: 0.045, rise: 0.05, armPitch: 0.9, armYaw: -0.24, armLength: 0.34 }));

    addMuzzle(g, 0, 0.02, -0.3, 0.5);
    return g;
  },

  assault() {
    const g = new THREE.Group();
    const t = THEMES.assault();
    const glass = mat(0x0b1220, { emissive: 0xf87171, emissiveIntensity: 1.1, roughness: 0.3 });
    const reticle = mat(0x0b1220, { emissive: 0xff2a2a, emissiveIntensity: 2.2, roughness: 0.25 });
    const fallback = new THREE.Group();
    const modelHost = new THREE.Group();
    g.add(fallback, modelHost);

    // Upper receiver
    fallback.add(box(0.07, 0.07, 0.3, t.rail, 0, 0.04, -0.05));
    // Lower receiver
    fallback.add(box(0.068, 0.06, 0.26, t.body, 0, -0.02, -0.03));
    // Handguard (tan)
    fallback.add(box(0.072, 0.075, 0.24, t.tan, 0, 0.015, -0.32));
    fallback.add(box(0.05, 0.018, 0.22, t.rail, 0, 0.06, -0.32));
    // Barrel
    fallback.add(cyl(0.013, 0.28, t.barrel, 0, 0.02, -0.56));
    fallback.add(cyl(0.02, 0.05, t.steel, 0, 0.02, -0.72));
    // Mag (curved look via two offset boxes)
    fallback.add(box(0.045, 0.14, 0.08, t.mag, 0, -0.12, -0.06));
    fallback.add(box(0.045, 0.1, 0.075, t.mag, 0, -0.2, -0.03));
    fallback.add(box(0.048, 0.02, 0.08, t.glow, 0, -0.26, -0.02));
    // Grip
    fallback.add(grip(t.body, t.rail, 0, -0.04, 0.1, 0.4));
    // Stock tube + pad
    fallback.add(cyl(0.018, 0.16, t.steel, 0, 0.01, 0.2));
    fallback.add(box(0.05, 0.06, 0.14, t.tan, 0, 0.0, 0.3));
    fallback.add(box(0.065, 0.12, 0.035, t.body, 0, -0.01, 0.38));
    // Holo / red-dot on top rail
    redDotOptic(fallback, t.rail, glass, reticle, 0, 0.095, -0.02);
    // Backup front sight (folded look)
    fallback.add(box(0.014, 0.028, 0.012, t.steel, 0, 0.08, -0.48));

    g.add(triggerHand({ x: 0, y: -0.085, z: 0.05 }));
    g.add(supportHand({ x: 0, y: -0.015, z: -0.2, rise: 0.045 }));

    addMuzzle(g, 0, 0.04, -0.42, 0.55);
    mountAssaultRifle(modelHost, {
      targetLength: 0.55,
      offset: { x: 0, y: -0.02, z: 0.02 },
    }).then((loaded) => {
      if (loaded) fallback.visible = false;
    });
    return g;
  },

  shotgun() {
    const g = new THREE.Group();
    const t = THEMES.shotgun();

    // Receiver
    g.add(box(0.08, 0.09, 0.26, t.blue, 0, 0.025, -0.04));
    // Single thick barrel (cleaner than dual tubes)
    g.add(cyl(0.026, 0.42, t.steel, 0, 0.035, -0.4));
    g.add(cyl(0.03, 0.04, t.brass, 0, 0.035, -0.62));
    // Magazine tube under barrel
    g.add(cyl(0.016, 0.28, t.blue, 0, -0.01, -0.32));
    // Pump (wood)
    g.add(box(0.085, 0.07, 0.15, t.wood, 0, -0.035, -0.28));
    g.add(box(0.09, 0.015, 0.13, t.woodDark, 0, 0.005, -0.28));
    // Ejection port accent
    g.add(box(0.02, 0.04, 0.08, t.glow, 0.035, 0.04, -0.08));
    // Trigger guard
    g.add(box(0.04, 0.01, 0.055, t.blue, 0, -0.03, 0.02));
    g.add(box(0.012, 0.04, 0.012, t.blue, -0.014, -0.05, 0.02));
    g.add(box(0.012, 0.04, 0.012, t.blue, 0.014, -0.05, 0.02));
    // Grip / stock continuous wood
    g.add(grip(t.wood, t.woodDark, 0, -0.01, 0.08, 0.28));
    g.add(box(0.065, 0.08, 0.22, t.wood, 0, 0.0, 0.24));
    g.add(box(0.075, 0.14, 0.04, t.woodDark, 0, -0.02, 0.36));
    // Front bead
    g.add(box(0.014, 0.018, 0.014, t.brass, 0, 0.07, -0.58));

    g.add(triggerHand({ x: 0, y: -0.085, z: 0.06 }));
    g.add(supportHand({ x: 0, y: -0.07, z: -0.28, rise: 0.05, spread: 0.008 }));

    addMuzzle(g, 0, 0.035, -0.66, 1.05);
    return g;
  },

  sniper() {
    const g = new THREE.Group();
    const t = THEMES.sniper();

    // Long chassis
    g.add(box(0.07, 0.07, 0.42, t.olive, 0, 0.015, -0.08));
    g.add(box(0.068, 0.05, 0.36, t.tan, 0, -0.035, -0.05));
    // Barrel
    g.add(cyl(0.012, 0.55, t.black, 0, 0.02, -0.58));
    g.add(cyl(0.02, 0.06, t.steel, 0, 0.02, -0.9));
    // Scope
    g.add(cyl(0.03, 0.28, t.optic, 0, 0.11, -0.14));
    g.add(cyl(0.036, 0.035, t.glass, 0, 0.11, -0.3));
    g.add(cyl(0.034, 0.03, t.steel, 0, 0.11, 0.02));
    // Mounts
    g.add(box(0.028, 0.035, 0.035, t.steel, 0, 0.07, -0.22));
    g.add(box(0.028, 0.035, 0.035, t.steel, 0, 0.07, -0.06));
    // Bolt
    g.add(box(0.07, 0.018, 0.018, t.steel, 0.04, 0.04, 0.08));
    g.add(cyl(0.012, 0.025, t.steel, 0.08, 0.04, 0.08, 'x'));
    // Mag
    g.add(box(0.045, 0.08, 0.07, t.black, 0, -0.08, -0.02));
    // Grip
    g.add(grip(t.olive, t.black, 0, -0.05, 0.12, 0.38));
    // Stock + cheek riser
    g.add(box(0.055, 0.06, 0.26, t.tan, 0, 0.0, 0.3));
    g.add(box(0.06, 0.04, 0.12, t.olive, 0, 0.05, 0.24));
    g.add(box(0.07, 0.13, 0.035, t.olive, 0, -0.015, 0.44));
    // Bipod folded under the barrel — clamp hugs the barrel, legs hang from it
    const bipodZ = -0.45;
    g.add(box(0.034, 0.022, 0.024, t.steel, 0, 0.009, bipodZ));
    g.add(box(0.056, 0.01, 0.014, t.steel, 0, -0.003, bipodZ));
    g.add(box(0.012, 0.072, 0.012, t.black, -0.024, -0.039, bipodZ));
    g.add(box(0.012, 0.072, 0.012, t.black, 0.024, -0.039, bipodZ));

    g.add(triggerHand({ x: 0, y: -0.115, z: 0.095 }));
    g.add(supportHand({ x: 0, y: -0.06, z: -0.17, rise: 0.046 }));

    addMuzzle(g, 0, 0.02, -0.95, 1.4);
    return g;
  },

  // === Sidearms ===

  revolver() {
    const g = new THREE.Group();
    const t = THEMES.revolver();
    // Frame
    g.add(box(0.07, 0.055, 0.16, t.frame, 0, 0.04, -0.02));
    // Cylinder
    g.add(cyl(0.04, 0.065, t.cylinder, 0, 0.03, -0.06, 'x'));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(cyl(0.008, 0.068, t.brass, Math.cos(a) * 0.025, 0.03 + Math.sin(a) * 0.025, -0.06, 'x'));
    }
    // Barrel shroud
    g.add(box(0.042, 0.038, 0.18, t.frame, 0, 0.055, -0.2));
    g.add(cyl(0.015, 0.22, t.barrel, 0, 0.04, -0.24));
    // Front sight
    g.add(box(0.012, 0.026, 0.014, t.brass, 0, 0.082, -0.28));
    // Hammer
    g.add(box(0.018, 0.04, 0.025, t.frame, 0, 0.085, 0.04));
    // Grip
    g.add(grip(t.wood, t.brass, 0, -0.01, 0.04, 0.35));
    // Trigger guard
    g.add(box(0.042, 0.012, 0.055, t.frame, 0, -0.02, -0.01));
    g.add(box(0.012, 0.042, 0.012, t.frame, -0.014, -0.042, -0.01));
    g.add(box(0.012, 0.042, 0.012, t.frame, 0.014, -0.042, -0.01));

    g.add(triggerHand({ x: 0, y: -0.085, z: 0.02, armPitch: 0.82, armYaw: 0.28, armLength: 0.32 }));
    g.add(supportHand({ x: 0, y: -0.14, z: 0.04, rise: 0.05, armPitch: 0.9, armYaw: -0.24, armLength: 0.34 }));
    addMuzzle(g, 0, 0.04, -0.35, 0.55);
    return g;
  },

  machinepistol() {
    const g = new THREE.Group();
    const t = THEMES.machinepistol();
    // Slide
    g.add(box(0.068, 0.045, 0.2, t.slide, 0, 0.055, -0.04));
    // Frame
    g.add(box(0.065, 0.045, 0.18, t.body, 0, 0.012, -0.03));
    // Barrel housing
    g.add(box(0.045, 0.032, 0.08, t.barrel, 0, 0.02, -0.18));
    g.add(cyl(0.011, 0.06, t.barrel, 0, 0.02, -0.23));
    // Extended mag
    g.add(box(0.04, 0.18, 0.065, t.mag, 0, -0.14, -0.04));
    g.add(box(0.042, 0.02, 0.067, t.trim, 0, -0.24, -0.04));
    // Wire stock (folded along side)
    g.add(box(0.01, 0.01, 0.22, t.body, 0.04, 0.065, 0.04));
    g.add(box(0.01, 0.06, 0.01, t.body, 0.04, 0.035, 0.15));
    // Grip
    g.add(grip(t.grip, t.trim, 0, -0.01, 0.04, 0.32));
    // Trigger guard
    g.add(box(0.04, 0.01, 0.05, t.body, 0, -0.03, -0.01));
    // Sights
    pistolIronSights(g, t.slide, t.glow);
    // Cocking handle
    g.add(box(0.09, 0.016, 0.02, t.body, 0, 0.06, 0.02));

    g.add(triggerHand({ x: 0, y: -0.085, z: 0.015, armPitch: 0.82, armYaw: 0.28, armLength: 0.32 }));
    g.add(supportHand({ x: 0, y: -0.12, z: -0.06, rise: 0.05, armPitch: 0.88, armYaw: -0.26, armLength: 0.34 }));
    addMuzzle(g, 0, 0.02, -0.27, 0.45);
    return g;
  },

  deagle() {
    const g = new THREE.Group();
    const t = THEMES.deagle();
    // Massive slide
    g.add(box(0.088, 0.058, 0.28, t.slide, 0, 0.06, -0.08));
    // Frame
    g.add(box(0.082, 0.055, 0.24, t.body, 0, 0.01, -0.06));
    // Heavy barrel
    g.add(box(0.065, 0.04, 0.12, t.barrel, 0, 0.025, -0.24));
    g.add(cyl(0.016, 0.08, t.barrel, 0, 0.025, -0.32));
    // Compensator slots
    g.add(box(0.09, 0.015, 0.04, t.gold, 0, 0.065, -0.2));
    g.add(box(0.09, 0.015, 0.04, t.gold, 0, 0.065, -0.16));
    // Grip
    g.add(grip(t.grip, t.gold, 0, -0.01, 0.04, 0.3));
    // Trigger guard
    g.add(box(0.05, 0.012, 0.065, t.body, 0, -0.035, -0.02));
    g.add(box(0.014, 0.05, 0.012, t.body, -0.018, -0.058, -0.02));
    g.add(box(0.014, 0.05, 0.012, t.body, 0.018, -0.058, -0.02));
    // Gold accents
    g.add(box(0.084, 0.02, 0.06, t.gold, 0, 0.06, 0.02));
    g.add(box(0.055, 0.02, 0.07, t.gold, 0, -0.18, 0.055));
    // Iron sights
    pistolIronSights(g, t.slide, t.glow, 0.094);

    g.add(triggerHand({ x: 0, y: -0.09, z: 0.02, armPitch: 0.82, armYaw: 0.28, armLength: 0.34 }));
    g.add(supportHand({ x: 0, y: -0.16, z: 0.04, rise: 0.055, armPitch: 0.9, armYaw: -0.24, armLength: 0.34 }));
    addMuzzle(g, 0, 0.025, -0.36, 0.6);
    return g;
  },

  // === SMGs ===

  smg() {
    const g = new THREE.Group();
    const t = THEMES.smg();
    // Upper receiver (tube shape via box)
    g.add(box(0.068, 0.068, 0.26, t.body, 0, 0.03, -0.04));
    // Handguard
    g.add(box(0.072, 0.065, 0.16, t.rail, 0, 0.02, -0.24));
    // Top rail
    g.add(box(0.04, 0.015, 0.3, t.rail, 0, 0.07, -0.1));
    // Barrel
    g.add(cyl(0.012, 0.18, t.barrel, 0, 0.02, -0.42));
    g.add(cyl(0.018, 0.04, t.steel, 0, 0.02, -0.52));
    // Mag (curved)
    g.add(box(0.04, 0.12, 0.065, t.mag, 0, -0.1, -0.05));
    g.add(box(0.04, 0.08, 0.06, t.mag, 0, -0.18, -0.025));
    g.add(box(0.042, 0.018, 0.065, t.glow, 0, -0.22, -0.02));
    // Grip
    g.add(grip(t.grip, t.rail, 0, -0.03, 0.1, 0.38));
    // Folding stock
    g.add(cyl(0.014, 0.12, t.steel, 0, 0.01, 0.18));
    g.add(box(0.045, 0.055, 0.1, t.body, 0, 0.0, 0.28));
    g.add(box(0.055, 0.09, 0.03, t.grip, 0, -0.01, 0.34));
    // Iron sights
    g.add(box(0.012, 0.028, 0.012, t.steel, -0.016, 0.088, 0.03));
    g.add(box(0.012, 0.028, 0.012, t.steel, 0.016, 0.088, 0.03));
    g.add(box(0.012, 0.03, 0.012, t.glow, 0, 0.09, -0.3));

    g.add(triggerHand({ x: 0, y: -0.085, z: 0.05 }));
    g.add(supportHand({ x: 0, y: -0.02, z: -0.18, rise: 0.045 }));
    addMuzzle(g, 0, 0.02, -0.54, 0.5);
    return g;
  },

  p90() {
    const g = new THREE.Group();
    const t = THEMES.p90();
    // Bullpup body (rounded via overlapping boxes)
    g.add(box(0.075, 0.08, 0.36, t.body, 0, 0.02, -0.02));
    g.add(box(0.07, 0.06, 0.32, t.shell, 0, -0.01, 0.0));
    // Top-mounted horizontal mag
    g.add(box(0.065, 0.03, 0.26, t.mag, 0, 0.07, -0.04));
    g.add(box(0.06, 0.025, 0.2, t.body, 0, 0.09, -0.04));
    // Integrated sight housing
    g.add(box(0.05, 0.03, 0.08, t.sight, 0, 0.1, -0.06));
    g.add(box(0.03, 0.025, 0.01, t.glow, 0, 0.108, -0.09));
    // Barrel (short, protruding)
    g.add(cyl(0.012, 0.12, t.barrel, 0, 0.015, -0.26));
    g.add(cyl(0.018, 0.03, t.body, 0, 0.015, -0.33));
    // Integrated foregrip
    g.add(box(0.04, 0.06, 0.06, t.shell, 0, -0.055, -0.1));
    // Trigger area
    g.add(box(0.04, 0.01, 0.05, t.shell, 0, -0.03, -0.02));
    // Ejection port
    g.add(box(0.02, 0.035, 0.06, t.glow, 0.042, 0.01, -0.12));
    // Back plate
    g.add(box(0.06, 0.08, 0.03, t.body, 0, 0.01, 0.18));

    g.add(triggerHand({ x: 0, y: -0.085, z: 0.04, armPitch: 0.8, armYaw: 0.3, armLength: 0.34 }));
    g.add(supportHand({ x: 0, y: -0.06, z: -0.12, rise: 0.05, armPitch: 0.88, armYaw: -0.32, armLength: 0.38 }));
    addMuzzle(g, 0, 0.015, -0.36, 0.5);
    return g;
  },

  vector() {
    const g = new THREE.Group();
    const t = THEMES.vector();
    // Angular upper body
    g.add(box(0.065, 0.065, 0.22, t.body, 0, 0.04, -0.02));
    // Lower body (wider, angular)
    g.add(box(0.07, 0.08, 0.2, t.body, 0, -0.02, 0.0));
    // Top rail
    g.add(box(0.04, 0.015, 0.26, t.rail, 0, 0.08, -0.02));
    // Barrel
    g.add(cyl(0.011, 0.16, t.barrel, 0, 0.035, -0.24));
    g.add(cyl(0.018, 0.04, t.body, 0, 0.035, -0.34));
    // Side-feeding mag
    g.add(box(0.04, 0.14, 0.06, t.mag, 0, -0.12, -0.02));
    g.add(box(0.042, 0.018, 0.062, t.glow, 0, -0.2, -0.02));
    // Grip
    g.add(grip(t.grip, t.rail, 0, -0.04, 0.1, 0.38));
    // Vertical foregrip
    g.add(box(0.035, 0.07, 0.035, t.grip, 0, -0.06, -0.14));
    g.add(box(0.038, 0.02, 0.04, t.body, 0, -0.01, -0.14));
    // Folding stock
    g.add(box(0.04, 0.05, 0.14, t.stock, 0, 0.01, 0.18));
    g.add(box(0.05, 0.08, 0.03, t.body, 0, 0.0, 0.26));
    // Charging handle
    g.add(box(0.08, 0.018, 0.02, t.body, 0, 0.06, 0.04));
    // Iron sights
    g.add(box(0.012, 0.024, 0.012, t.rail, -0.015, 0.1, 0.05));
    g.add(box(0.012, 0.024, 0.012, t.rail, 0.015, 0.1, 0.05));
    g.add(box(0.01, 0.026, 0.01, t.glow, 0, 0.1, -0.14));

    g.add(triggerHand({ x: 0, y: -0.09, z: 0.05, armPitch: 0.8, armYaw: 0.3, armLength: 0.34 }));
    g.add(supportHand({ x: 0, y: -0.06, z: -0.14, rise: 0.046, armPitch: 0.88, armYaw: -0.3, armLength: 0.38 }));
    addMuzzle(g, 0, 0.035, -0.36, 0.48);
    return g;
  },

  // === Rifles ===

  battlerifle() {
    const g = new THREE.Group();
    const t = THEMES.battlerifle();
    // Heavy upper receiver
    g.add(box(0.075, 0.075, 0.32, t.body, 0, 0.04, -0.06));
    // Lower receiver
    g.add(box(0.07, 0.06, 0.28, t.rail, 0, -0.02, -0.04));
    // Handguard
    g.add(box(0.078, 0.075, 0.2, t.tan, 0, 0.02, -0.32));
    g.add(box(0.05, 0.018, 0.18, t.rail, 0, 0.065, -0.32));
    // Heavy barrel
    g.add(cyl(0.015, 0.32, t.barrel, 0, 0.025, -0.58));
    g.add(cyl(0.022, 0.05, t.steel, 0, 0.025, -0.76));
    // Large mag
    g.add(box(0.05, 0.16, 0.085, t.mag, 0, -0.13, -0.06));
    g.add(box(0.052, 0.02, 0.087, t.glow, 0, -0.22, -0.05));
    // Grip
    g.add(grip(t.body, t.rail, 0, -0.04, 0.12, 0.4));
    // Heavy stock
    g.add(cyl(0.02, 0.16, t.steel, 0, 0.015, 0.2));
    g.add(box(0.055, 0.07, 0.16, t.tan, 0, 0.01, 0.32));
    g.add(box(0.07, 0.13, 0.04, t.body, 0, -0.01, 0.42));
    // Carry handle / iron sights
    g.add(box(0.04, 0.01, 0.12, t.rail, 0, 0.085, -0.06));
    g.add(box(0.012, 0.03, 0.012, t.steel, 0, 0.1, -0.12));
    g.add(box(0.012, 0.03, 0.012, t.steel, 0, 0.1, 0.0));
    // Front sight
    g.add(box(0.014, 0.028, 0.012, t.steel, 0, 0.088, -0.44));

    g.add(triggerHand({ x: 0, y: -0.09, z: 0.06 }));
    g.add(supportHand({ x: 0, y: -0.02, z: -0.22, rise: 0.046 }));
    addMuzzle(g, 0, 0.025, -0.8, 0.65);
    return g;
  },

  burstrifle() {
    const g = new THREE.Group();
    const t = THEMES.burstrifle();
    // Upper receiver
    g.add(box(0.07, 0.065, 0.28, t.body, 0, 0.04, -0.04));
    // Lower receiver
    g.add(box(0.066, 0.055, 0.24, t.rail, 0, -0.015, -0.02));
    // Triangular handguard (approximated with boxes)
    g.add(box(0.08, 0.06, 0.2, t.handguard, 0, 0.01, -0.28));
    g.add(box(0.06, 0.04, 0.2, t.handguard, 0, -0.03, -0.28));
    // Barrel
    g.add(cyl(0.013, 0.26, t.barrel, 0, 0.02, -0.52));
    g.add(cyl(0.02, 0.04, t.steel, 0, 0.02, -0.67));
    // Carry handle with integral sight
    g.add(box(0.044, 0.01, 0.14, t.rail, 0, 0.08, -0.02));
    g.add(box(0.012, 0.04, 0.012, t.rail, -0.016, 0.1, -0.08));
    g.add(box(0.012, 0.04, 0.012, t.rail, 0.016, 0.1, -0.08));
    g.add(box(0.012, 0.04, 0.012, t.rail, 0, 0.1, 0.04));
    g.add(box(0.03, 0.02, 0.04, t.rail, 0, 0.12, -0.08));
    g.add(box(0.008, 0.01, 0.008, t.glow, 0, 0.12, 0.04));
    // Mag
    g.add(box(0.042, 0.13, 0.075, t.mag, 0, -0.12, -0.04));
    g.add(box(0.044, 0.018, 0.077, t.glow, 0, -0.2, -0.03));
    // Grip
    g.add(grip(t.body, t.rail, 0, -0.04, 0.1, 0.4));
    // Stock
    g.add(cyl(0.016, 0.14, t.steel, 0, 0.01, 0.18));
    g.add(box(0.05, 0.06, 0.12, t.handguard, 0, 0.0, 0.28));
    g.add(box(0.06, 0.11, 0.03, t.body, 0, -0.01, 0.35));
    // Front sight
    g.add(box(0.014, 0.03, 0.012, t.steel, 0, 0.085, -0.42));

    g.add(triggerHand({ x: 0, y: -0.09, z: 0.05 }));
    g.add(supportHand({ x: 0, y: -0.02, z: -0.2, rise: 0.044 }));
    addMuzzle(g, 0, 0.02, -0.7, 0.6);
    return g;
  },

  dmr() {
    const g = new THREE.Group();
    const t = THEMES.dmr();
    // Long chassis
    g.add(box(0.07, 0.068, 0.38, t.body, 0, 0.02, -0.08));
    g.add(box(0.066, 0.05, 0.34, t.tan, 0, -0.03, -0.06));
    // Heavy barrel
    g.add(cyl(0.014, 0.44, t.barrel, 0, 0.02, -0.5));
    g.add(cyl(0.022, 0.05, t.steel, 0, 0.02, -0.74));
    // Small scope (zoom: 1.5)
    g.add(cyl(0.022, 0.2, t.optic, 0, 0.1, -0.1));
    g.add(cyl(0.028, 0.03, t.glass, 0, 0.1, -0.22));
    g.add(cyl(0.026, 0.025, t.steel, 0, 0.1, 0.02));
    // Scope mounts
    g.add(box(0.024, 0.03, 0.03, t.steel, 0, 0.07, -0.16));
    g.add(box(0.024, 0.03, 0.03, t.steel, 0, 0.07, -0.04));
    // Mag
    g.add(box(0.042, 0.1, 0.065, t.body, 0, -0.08, -0.02));
    // Grip
    g.add(grip(t.body, t.rail, 0, -0.04, 0.1, 0.38));
    // Stock + cheek riser
    g.add(box(0.05, 0.055, 0.22, t.tan, 0, 0.0, 0.26));
    g.add(box(0.055, 0.035, 0.1, t.body, 0, 0.045, 0.2));
    g.add(box(0.065, 0.12, 0.03, t.body, 0, -0.01, 0.38));
    // Bipod folded
    g.add(box(0.032, 0.02, 0.02, t.steel, 0, 0.01, -0.38));
    g.add(box(0.012, 0.065, 0.012, t.barrel, -0.022, -0.035, -0.38));
    g.add(box(0.012, 0.065, 0.012, t.barrel, 0.022, -0.035, -0.38));

    g.add(triggerHand({ x: 0, y: -0.11, z: 0.08 }));
    g.add(supportHand({ x: 0, y: -0.05, z: -0.16, rise: 0.045 }));
    addMuzzle(g, 0, 0.02, -0.78, 0.85);
    return g;
  },

  carbine() {
    const g = new THREE.Group();
    const t = THEMES.carbine();
    const glass = mat(0x0b1220, { emissive: 0xf87171, emissiveIntensity: 1.1, roughness: 0.3 });
    const reticle = mat(0x0b1220, { emissive: 0xff2a2a, emissiveIntensity: 2.2, roughness: 0.25 });
    // Compact receiver
    g.add(box(0.065, 0.065, 0.22, t.rail, 0, 0.035, -0.03));
    g.add(box(0.062, 0.055, 0.2, t.body, 0, -0.015, -0.02));
    // Short handguard
    g.add(box(0.068, 0.06, 0.15, t.green, 0, 0.01, -0.22));
    // Short barrel
    g.add(cyl(0.012, 0.16, t.barrel, 0, 0.02, -0.38));
    g.add(cyl(0.018, 0.035, t.steel, 0, 0.02, -0.48));
    // Mag
    g.add(box(0.04, 0.11, 0.065, t.mag, 0, -0.1, -0.04));
    g.add(box(0.042, 0.016, 0.067, t.glow, 0, -0.17, -0.03));
    // Grip
    g.add(grip(t.body, t.rail, 0, -0.035, 0.08, 0.38));
    // Collapsible stock
    g.add(cyl(0.014, 0.1, t.steel, 0, 0.01, 0.16));
    g.add(box(0.04, 0.045, 0.08, t.green, 0, 0.0, 0.24));
    g.add(box(0.05, 0.08, 0.025, t.body, 0, -0.005, 0.29));
    // Red dot
    redDotOptic(g, t.rail, glass, reticle, 0, 0.085, -0.02);
    // Front sight
    g.add(box(0.014, 0.026, 0.012, t.steel, 0, 0.08, -0.32));

    g.add(triggerHand({ x: 0, y: -0.085, z: 0.04 }));
    g.add(supportHand({ x: 0, y: -0.015, z: -0.16, rise: 0.044 }));
    addMuzzle(g, 0, 0.02, -0.5, 0.5);
    return g;
  },

  // === Shotguns ===

  autoshotgun() {
    const g = new THREE.Group();
    const t = THEMES.autoshotgun();
    // Receiver
    g.add(box(0.08, 0.09, 0.24, t.body, 0, 0.025, -0.02));
    // Thick barrel
    g.add(cyl(0.024, 0.34, t.barrel, 0, 0.035, -0.36));
    g.add(cyl(0.028, 0.04, t.steel, 0, 0.035, -0.54));
    // Gas tube above barrel
    g.add(cyl(0.012, 0.2, t.steel, 0, 0.07, -0.28));
    // Box mag
    g.add(box(0.055, 0.12, 0.08, t.mag, 0, -0.1, -0.04));
    g.add(box(0.057, 0.02, 0.082, t.glow, 0, -0.17, -0.04));
    // Handguard
    g.add(box(0.08, 0.06, 0.14, t.wood, 0, -0.02, -0.22));
    // Pistol grip
    g.add(grip(t.wood, t.body, 0, -0.02, 0.08, 0.35));
    // Stock
    g.add(box(0.055, 0.065, 0.18, t.wood, 0, 0.0, 0.24));
    g.add(box(0.065, 0.12, 0.035, t.body, 0, -0.01, 0.34));
    // Front bead
    g.add(box(0.014, 0.02, 0.014, t.glow, 0, 0.075, -0.5));
    // Ejection port
    g.add(box(0.02, 0.04, 0.07, t.glow, 0.045, 0.04, -0.06));

    g.add(triggerHand({ x: 0, y: -0.09, z: 0.06 }));
    g.add(supportHand({ x: 0, y: -0.05, z: -0.22, rise: 0.048, spread: 0.006 }));
    addMuzzle(g, 0, 0.035, -0.56, 0.95);
    return g;
  },

  slugshotgun() {
    const g = new THREE.Group();
    const t = THEMES.slugshotgun();
    // Long receiver
    g.add(box(0.078, 0.088, 0.28, t.body, 0, 0.025, -0.04));
    // Long barrel
    g.add(cyl(0.024, 0.46, t.steel, 0, 0.035, -0.46));
    g.add(cyl(0.028, 0.04, t.brass, 0, 0.035, -0.7));
    // Tube mag
    g.add(cyl(0.015, 0.32, t.body, 0, -0.01, -0.36));
    // Pump
    g.add(box(0.082, 0.065, 0.14, t.wood, 0, -0.03, -0.3));
    g.add(box(0.086, 0.014, 0.12, t.woodDark, 0, 0.006, -0.3));
    // Rifle-style rear sight
    g.add(box(0.04, 0.01, 0.03, t.steel, 0, 0.08, 0.02));
    g.add(box(0.012, 0.025, 0.012, t.steel, -0.014, 0.095, 0.02));
    g.add(box(0.012, 0.025, 0.012, t.steel, 0.014, 0.095, 0.02));
    // Front sight
    g.add(box(0.014, 0.024, 0.014, t.brass, 0, 0.075, -0.64));
    // Trigger guard
    g.add(box(0.04, 0.01, 0.055, t.body, 0, -0.03, 0.02));
    g.add(box(0.012, 0.04, 0.012, t.body, -0.014, -0.05, 0.02));
    g.add(box(0.012, 0.04, 0.012, t.body, 0.014, -0.05, 0.02));
    // Stock
    g.add(grip(t.wood, t.woodDark, 0, -0.01, 0.08, 0.28));
    g.add(box(0.06, 0.075, 0.22, t.wood, 0, 0.0, 0.24));
    g.add(box(0.07, 0.13, 0.035, t.woodDark, 0, -0.02, 0.36));
    // Ejection port
    g.add(box(0.018, 0.035, 0.065, t.glow, 0.044, 0.04, -0.06));

    g.add(triggerHand({ x: 0, y: -0.085, z: 0.06 }));
    g.add(supportHand({ x: 0, y: -0.065, z: -0.3, rise: 0.05, spread: 0.008 }));
    addMuzzle(g, 0, 0.035, -0.72, 1.1);
    return g;
  },

  doublebarrel() {
    const g = new THREE.Group();
    const t = THEMES.doublebarrel();
    // Receiver / break action
    g.add(box(0.09, 0.08, 0.16, t.body, 0, 0.025, -0.02));
    // Twin barrels side by side
    g.add(cyl(0.022, 0.44, t.steel, -0.022, 0.035, -0.38));
    g.add(cyl(0.022, 0.44, t.steel, 0.022, 0.035, -0.38));
    // Barrel rib on top
    g.add(box(0.015, 0.008, 0.4, t.body, 0, 0.062, -0.36));
    // Muzzle rings
    g.add(cyl(0.026, 0.02, t.brass, -0.022, 0.035, -0.6));
    g.add(cyl(0.026, 0.02, t.brass, 0.022, 0.035, -0.6));
    // Break hinge
    g.add(cyl(0.016, 0.08, t.brass, 0, 0.06, -0.1, 'x'));
    // Front bead
    g.add(box(0.012, 0.018, 0.012, t.brass, 0, 0.075, -0.58));
    // Trigger guard
    g.add(box(0.04, 0.01, 0.055, t.body, 0, -0.025, 0.02));
    g.add(box(0.012, 0.04, 0.012, t.body, -0.014, -0.045, 0.02));
    g.add(box(0.012, 0.04, 0.012, t.body, 0.014, -0.045, 0.02));
    // Wood grip + stock
    g.add(grip(t.wood, t.woodDark, 0, -0.01, 0.06, 0.28));
    g.add(box(0.065, 0.08, 0.24, t.wood, 0, 0.0, 0.24));
    g.add(box(0.075, 0.14, 0.035, t.woodDark, 0, -0.02, 0.37));
    // Ejection accent
    g.add(box(0.06, 0.02, 0.04, t.glow, 0, 0.072, -0.06));

    g.add(triggerHand({ x: 0, y: -0.085, z: 0.04 }));
    g.add(supportHand({ x: 0, y: -0.03, z: -0.3, rise: 0.046, spread: 0.01 }));
    addMuzzle(g, 0, 0.035, -0.62, 1.0);
    return g;
  },

  // === Snipers ===

  scout() {
    const g = new THREE.Group();
    const t = THEMES.scout();
    // Light chassis
    g.add(box(0.062, 0.06, 0.34, t.body, 0, 0.015, -0.06));
    g.add(box(0.06, 0.045, 0.3, t.tan, 0, -0.03, -0.04));
    // Thin barrel
    g.add(cyl(0.01, 0.42, t.black, 0, 0.02, -0.48));
    g.add(cyl(0.016, 0.04, t.steel, 0, 0.02, -0.72));
    // Medium scope
    g.add(cyl(0.024, 0.22, t.optic, 0, 0.1, -0.1));
    g.add(cyl(0.03, 0.03, t.glass, 0, 0.1, -0.23));
    g.add(cyl(0.028, 0.025, t.steel, 0, 0.1, 0.02));
    // Scope mounts
    g.add(box(0.024, 0.03, 0.03, t.steel, 0, 0.065, -0.18));
    g.add(box(0.024, 0.03, 0.03, t.steel, 0, 0.065, -0.02));
    // Bolt
    g.add(box(0.06, 0.016, 0.016, t.steel, 0.038, 0.035, 0.06));
    g.add(cyl(0.01, 0.022, t.steel, 0.068, 0.035, 0.06, 'x'));
    // Small mag
    g.add(box(0.038, 0.06, 0.055, t.black, 0, -0.06, -0.02));
    // Grip
    g.add(grip(t.body, t.black, 0, -0.04, 0.1, 0.36));
    // Light stock
    g.add(box(0.048, 0.05, 0.2, t.tan, 0, 0.0, 0.26));
    g.add(box(0.055, 0.1, 0.03, t.body, 0, -0.01, 0.37));

    g.add(triggerHand({ x: 0, y: -0.11, z: 0.08 }));
    g.add(supportHand({ x: 0, y: -0.05, z: -0.14, rise: 0.044 }));
    addMuzzle(g, 0, 0.02, -0.74, 1.1);
    return g;
  },

  awp() {
    const g = new THREE.Group();
    const t = THEMES.awp();
    // Heavy chassis
    g.add(box(0.075, 0.075, 0.46, t.body, 0, 0.018, -0.1));
    g.add(box(0.072, 0.055, 0.4, t.stock, 0, -0.038, -0.08));
    // Long heavy barrel
    g.add(cyl(0.014, 0.58, t.black, 0, 0.022, -0.64));
    g.add(cyl(0.024, 0.07, t.steel, 0, 0.022, -0.98));
    // Large scope
    g.add(cyl(0.035, 0.32, t.optic, 0, 0.115, -0.16));
    g.add(cyl(0.042, 0.04, t.glass, 0, 0.115, -0.34));
    g.add(cyl(0.04, 0.035, t.steel, 0, 0.115, 0.02));
    // Scope mounts
    g.add(box(0.03, 0.04, 0.04, t.steel, 0, 0.075, -0.26));
    g.add(box(0.03, 0.04, 0.04, t.steel, 0, 0.075, -0.06));
    // Bolt handle
    g.add(box(0.075, 0.02, 0.02, t.steel, 0.045, 0.045, 0.1));
    g.add(cyl(0.014, 0.028, t.steel, 0.088, 0.045, 0.1, 'x'));
    // Heavy mag
    g.add(box(0.05, 0.09, 0.075, t.black, 0, -0.09, -0.02));
    // Grip
    g.add(grip(t.body, t.black, 0, -0.055, 0.13, 0.4));
    // Heavy stock + cheek riser
    g.add(box(0.06, 0.065, 0.28, t.stock, 0, 0.0, 0.32));
    g.add(box(0.065, 0.045, 0.14, t.body, 0, 0.055, 0.26));
    g.add(box(0.075, 0.14, 0.04, t.body, 0, -0.015, 0.48));
    // Bipod folded
    g.add(box(0.036, 0.024, 0.026, t.steel, 0, 0.01, -0.5));
    g.add(box(0.06, 0.012, 0.016, t.steel, 0, -0.002, -0.5));
    g.add(box(0.012, 0.08, 0.012, t.black, -0.026, -0.044, -0.5));
    g.add(box(0.012, 0.08, 0.012, t.black, 0.026, -0.044, -0.5));

    g.add(triggerHand({ x: 0, y: -0.12, z: 0.1 }));
    g.add(supportHand({ x: 0, y: -0.06, z: -0.2, rise: 0.048 }));
    addMuzzle(g, 0, 0.022, -1.04, 1.5);
    return g;
  },

  // === Heavy ===

  lmg() {
    const g = new THREE.Group();
    const t = THEMES.lmg();
    // Heavy receiver
    g.add(box(0.08, 0.08, 0.32, t.body, 0, 0.035, -0.04));
    g.add(box(0.076, 0.065, 0.28, t.rail, 0, -0.02, -0.02));
    // Long heavy barrel with heat shield
    g.add(cyl(0.016, 0.36, t.barrel, 0, 0.025, -0.52));
    g.add(box(0.06, 0.05, 0.2, t.rail, 0, 0.025, -0.38));
    g.add(cyl(0.024, 0.06, t.steel, 0, 0.025, -0.74));
    // Carry handle
    g.add(box(0.025, 0.012, 0.14, t.steel, 0, 0.09, -0.14));
    g.add(box(0.012, 0.04, 0.012, t.steel, 0, 0.07, -0.21));
    g.add(box(0.012, 0.04, 0.012, t.steel, 0, 0.07, -0.07));
    // Box mag / ammo box
    g.add(box(0.07, 0.1, 0.1, t.mag, 0, -0.12, -0.06));
    g.add(box(0.072, 0.02, 0.102, t.brass, 0, -0.18, -0.06));
    // Feed cover / top
    g.add(box(0.082, 0.02, 0.14, t.body, 0, 0.08, -0.04));
    // Grip
    g.add(grip(t.body, t.rail, 0, -0.04, 0.12, 0.4));
    // Stock
    g.add(cyl(0.018, 0.14, t.steel, 0, 0.015, 0.2));
    g.add(box(0.055, 0.065, 0.16, t.body, 0, 0.0, 0.32));
    g.add(box(0.065, 0.12, 0.035, t.rail, 0, -0.01, 0.42));
    // Bipod
    g.add(box(0.04, 0.02, 0.02, t.steel, 0, 0.0, -0.5));
    g.add(box(0.012, 0.08, 0.012, t.body, -0.028, -0.045, -0.5));
    g.add(box(0.012, 0.08, 0.012, t.body, 0.028, -0.045, -0.5));
    // Front sight
    g.add(box(0.014, 0.026, 0.014, t.brass, 0, 0.085, -0.48));
    // Ejection port
    g.add(box(0.02, 0.04, 0.06, t.glow, 0.046, 0.04, -0.08));

    g.add(triggerHand({ x: 0, y: -0.1, z: 0.06 }));
    g.add(supportHand({ x: 0, y: -0.01, z: -0.24, rise: 0.046, spread: 0.008 }));
    addMuzzle(g, 0, 0.025, -0.76, 0.8);
    return g;
  },

  minigun() {
    const g = new THREE.Group();
    const t = THEMES.minigun();
    // Motor housing (rear cylinder)
    g.add(cyl(0.06, 0.14, t.housing, 0, 0.02, 0.04));
    g.add(box(0.05, 0.08, 0.08, t.body, 0, 0.02, 0.12));
    // Barrel cluster (6 barrels in a ring)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const bx = Math.cos(a) * 0.032;
      const by = 0.02 + Math.sin(a) * 0.032;
      g.add(cyl(0.008, 0.4, t.barrels, bx, by, -0.28));
    }
    // Front barrel clamp
    g.add(cyl(0.055, 0.025, t.body, 0, 0.02, -0.1));
    g.add(cyl(0.055, 0.025, t.body, 0, 0.02, -0.35));
    // Flash hider ring
    g.add(cyl(0.05, 0.03, t.brass, 0, 0.02, -0.49));
    // Rear grip (spade style)
    g.add(box(0.04, 0.1, 0.06, t.grip, 0.03, -0.06, 0.1));
    g.add(box(0.04, 0.1, 0.06, t.grip, -0.03, -0.06, 0.1));
    g.add(box(0.1, 0.02, 0.06, t.body, 0, -0.12, 0.1));
    // Ammo feed / box
    g.add(box(0.08, 0.08, 0.08, t.body, 0.06, -0.04, -0.04));
    g.add(box(0.05, 0.04, 0.06, t.brass, 0.06, 0.02, -0.04));
    // Trigger button
    g.add(cyl(0.01, 0.02, t.glow, 0, -0.02, 0.08, 'x'));

    g.add(triggerHand({ x: 0.03, y: -0.14, z: 0.08, armPitch: 0.85, armYaw: 0.35, armLength: 0.36 }));
    g.add(supportHand({ x: -0.03, y: -0.14, z: 0.08, rise: 0.04, armPitch: 0.85, armYaw: -0.35, armLength: 0.36 }));
    addMuzzle(g, 0, 0.02, -0.52, 0.7);
    return g;
  },

  // === Exotic ===

  crossbow() {
    const g = new THREE.Group();
    const t = THEMES.crossbow();
    // Rail / stock body
    g.add(box(0.055, 0.06, 0.36, t.body, 0, 0.02, -0.02));
    g.add(box(0.05, 0.045, 0.24, t.rail, 0, -0.015, 0.02));
    // Limbs (angled outward)
    const limbG = new THREE.Group();
    limbG.position.set(0, 0.02, -0.22);
    limbG.add(box(0.24, 0.025, 0.04, t.limb, 0, 0, 0));
    limbG.add(box(0.06, 0.02, 0.03, t.limb, -0.14, 0, 0.02));
    limbG.add(box(0.06, 0.02, 0.03, t.limb, 0.14, 0, 0.02));
    g.add(limbG);
    // String
    g.add(box(0.18, 0.006, 0.006, t.string, 0, 0.02, -0.18));
    // Bolt / arrow on rail
    g.add(cyl(0.005, 0.28, t.brass, 0, 0.055, -0.16));
    // Bolt tip
    g.add(box(0.015, 0.015, 0.025, t.steel, 0, 0.055, -0.31));
    // Trigger mechanism
    g.add(box(0.035, 0.025, 0.06, t.brass, 0, -0.01, -0.06));
    // Grip
    g.add(grip(t.body, t.brass, 0, -0.02, 0.08, 0.35));
    // Stock
    g.add(box(0.05, 0.055, 0.16, t.body, 0, 0.0, 0.22));
    g.add(box(0.055, 0.09, 0.03, t.rail, 0, -0.01, 0.31));
    // Simple top sight
    g.add(box(0.012, 0.024, 0.012, t.steel, -0.014, 0.075, 0.02));
    g.add(box(0.012, 0.024, 0.012, t.steel, 0.014, 0.075, 0.02));
    g.add(box(0.01, 0.026, 0.01, t.brass, 0, 0.078, -0.18));

    g.add(triggerHand({ x: 0, y: -0.09, z: 0.05 }));
    g.add(supportHand({ x: 0, y: -0.02, z: -0.1, rise: 0.044 }));
    addMuzzle(g, 0, 0.055, -0.36, 0.6);
    return g;
  },

  sawedoff() {
    const g = new THREE.Group();
    const t = THEMES.sawedoff();
    // Receiver
    g.add(box(0.085, 0.075, 0.12, t.steel, 0, 0.025, 0.0));
    // Twin short barrels
    g.add(cyl(0.02, 0.2, t.barrel, -0.018, 0.035, -0.16));
    g.add(cyl(0.02, 0.2, t.barrel, 0.018, 0.035, -0.16));
    // Muzzle rings
    g.add(cyl(0.024, 0.015, t.brass, -0.018, 0.035, -0.27));
    g.add(cyl(0.024, 0.015, t.brass, 0.018, 0.035, -0.27));
    // Break hinge
    g.add(cyl(0.014, 0.07, t.brass, 0, 0.06, -0.06, 'x'));
    // Grip only (no stock)
    g.add(grip(t.wood, t.woodDark, 0, -0.01, 0.04, 0.3));
    // Trigger guard
    g.add(box(0.04, 0.01, 0.05, t.steel, 0, -0.025, 0.0));
    g.add(box(0.012, 0.038, 0.012, t.steel, -0.014, -0.044, 0.0));
    g.add(box(0.012, 0.038, 0.012, t.steel, 0.014, -0.044, 0.0));
    // Side accent
    g.add(box(0.02, 0.03, 0.06, t.glow, 0.048, 0.03, -0.02));

    g.add(triggerHand({ x: 0, y: -0.085, z: 0.02, armPitch: 0.82, armYaw: 0.28, armLength: 0.32 }));
    g.add(supportHand({ x: 0, y: -0.04, z: -0.08, rise: 0.05, armPitch: 0.88, armYaw: -0.26, armLength: 0.34 }));
    addMuzzle(g, 0, 0.035, -0.28, 0.45);
    return g;
  },

  leveraction() {
    const g = new THREE.Group();
    const t = THEMES.leveraction();
    // Receiver
    g.add(box(0.07, 0.075, 0.22, t.brass, 0, 0.03, -0.02));
    // Octagonal barrel (approximated with box)
    g.add(box(0.04, 0.04, 0.42, t.blue, 0, 0.04, -0.38));
    g.add(box(0.044, 0.036, 0.42, t.blue, 0, 0.04, -0.38));
    // Tube mag under barrel
    g.add(cyl(0.012, 0.34, t.steel, 0, 0.0, -0.34));
    // Muzzle
    g.add(cyl(0.025, 0.03, t.brass, 0, 0.04, -0.6));
    // Lever loop
    g.add(box(0.05, 0.012, 0.1, t.brass, 0, -0.035, 0.01));
    g.add(box(0.012, 0.06, 0.012, t.brass, -0.02, -0.06, -0.04));
    g.add(box(0.012, 0.06, 0.012, t.brass, 0.02, -0.06, -0.04));
    g.add(box(0.05, 0.012, 0.012, t.brass, 0, -0.09, -0.04));
    // Trigger guard integrated with lever
    g.add(box(0.012, 0.04, 0.012, t.brass, -0.02, -0.06, 0.06));
    g.add(box(0.012, 0.04, 0.012, t.brass, 0.02, -0.06, 0.06));
    // Grip
    g.add(grip(t.wood, t.woodDark, 0, -0.01, 0.06, 0.28));
    // Wood stock
    g.add(box(0.06, 0.075, 0.24, t.wood, 0, 0.01, 0.24));
    g.add(box(0.07, 0.13, 0.035, t.woodDark, 0, -0.01, 0.37));
    // Front sight
    g.add(box(0.012, 0.022, 0.012, t.brass, 0, 0.068, -0.56));
    // Rear sight
    g.add(box(0.03, 0.014, 0.02, t.steel, 0, 0.076, -0.04));
    // Loading gate
    g.add(box(0.02, 0.03, 0.05, t.glow, 0.04, 0.01, -0.02));

    g.add(triggerHand({ x: 0, y: -0.085, z: 0.04 }));
    g.add(supportHand({ x: 0, y: -0.04, z: -0.26, rise: 0.046, spread: 0.006 }));
    addMuzzle(g, 0, 0.04, -0.62, 0.9);
    return g;
  },

  // === Special ===

  bow() {
    const g = new THREE.Group();
    const t = THEMES.bow();
    // Riser (grip section)
    g.add(box(0.04, 0.16, 0.06, t.leather, 0, 0.0, 0.0));
    g.add(box(0.035, 0.08, 0.055, t.dark, 0, 0.0, 0.01));
    // Upper limb (curving forward)
    g.add(box(0.03, 0.2, 0.035, t.wood, 0, 0.18, -0.01));
    g.add(box(0.028, 0.08, 0.03, t.wood, 0, 0.3, -0.03));
    g.add(box(0.025, 0.04, 0.025, t.wood, 0, 0.34, -0.05));
    // Lower limb (curving forward)
    g.add(box(0.03, 0.2, 0.035, t.wood, 0, -0.18, -0.01));
    g.add(box(0.028, 0.08, 0.03, t.wood, 0, -0.3, -0.03));
    g.add(box(0.025, 0.04, 0.025, t.wood, 0, -0.34, -0.05));
    // Limb tips
    g.add(box(0.01, 0.015, 0.015, t.tip, 0, 0.365, -0.06));
    g.add(box(0.01, 0.015, 0.015, t.tip, 0, -0.365, -0.06));
    // String
    g.add(box(0.004, 0.73, 0.004, t.string, 0, 0.0, -0.06));
    // Arrow rest
    g.add(box(0.02, 0.012, 0.04, t.dark, 0, 0.055, -0.02));
    // Arrow nocked
    g.add(cyl(0.004, 0.35, t.tip, 0, 0.055, -0.2));
    g.add(box(0.015, 0.015, 0.02, t.tip, 0, 0.055, -0.38));
    // Leather wrap detail
    g.add(box(0.044, 0.025, 0.065, t.leather, 0, 0.04, 0.0));
    g.add(box(0.044, 0.025, 0.065, t.leather, 0, -0.04, 0.0));

    g.add(triggerHand({ x: 0, y: -0.12, z: 0.05, armPitch: 0.82, armYaw: 0.3, armLength: 0.34 }));
    g.add(supportHand({ x: 0, y: -0.04, z: -0.02, rise: 0.06, armPitch: 0.85, armYaw: -0.3, armLength: 0.36 }));
    addMuzzle(g, 0, 0.055, -0.38, 0.5);
    return g;
  },

  laser() {
    const g = new THREE.Group();
    const t = THEMES.laser();
    // Sleek body
    g.add(box(0.065, 0.06, 0.28, t.body, 0, 0.035, -0.04));
    g.add(box(0.06, 0.05, 0.24, t.dark, 0, -0.01, -0.02));
    // Emitter barrel
    g.add(cyl(0.02, 0.14, t.chrome, 0, 0.03, -0.24));
    g.add(cyl(0.025, 0.03, t.cyan, 0, 0.03, -0.32));
    // Glowing side panels
    g.add(box(0.068, 0.015, 0.12, t.cyan, 0, 0.07, -0.06));
    g.add(box(0.015, 0.04, 0.16, t.glass, -0.038, 0.03, -0.08));
    g.add(box(0.015, 0.04, 0.16, t.glass, 0.038, 0.03, -0.08));
    // Top rail / sight
    g.add(box(0.03, 0.012, 0.18, t.chrome, 0, 0.07, -0.06));
    g.add(box(0.02, 0.02, 0.03, t.cyan, 0, 0.08, -0.04));
    // Power pack (rear)
    g.add(box(0.06, 0.065, 0.1, t.dark, 0, 0.02, 0.16));
    g.add(box(0.04, 0.04, 0.08, t.glass, 0, 0.04, 0.16));
    // Grip
    g.add(grip(t.grip, t.dark, 0, -0.02, 0.06, 0.34));
    // Trigger guard
    g.add(box(0.04, 0.01, 0.05, t.dark, 0, -0.03, 0.0));
    // Vent details
    g.add(box(0.07, 0.008, 0.02, t.cyan, 0, 0.065, -0.14));
    g.add(box(0.07, 0.008, 0.02, t.cyan, 0, 0.065, -0.18));

    g.add(triggerHand({ x: 0, y: -0.085, z: 0.03, armPitch: 0.8, armYaw: 0.3, armLength: 0.34 }));
    g.add(supportHand({ x: 0, y: -0.02, z: -0.12, rise: 0.045, armPitch: 0.88, armYaw: -0.3, armLength: 0.36 }));
    addMuzzle(g, 0, 0.03, -0.34, 0.5);
    return g;
  },

  poopgun() {
    const g = new THREE.Group();
    const t = THEMES.poopgun();
    const throwPivot = new THREE.Group();
    const payloadHost = new THREE.Group();
    const fallback = new THREE.Group();

    // Small fallback swirl while the authored GLB is loading.
    fallback.add(cyl(0.075, 0.08, t.body, 0, 0, 0, 'z'));
    fallback.add(cyl(0.06, 0.07, t.nozzle, 0.015, 0.065, 0, 'z'));
    fallback.add(cyl(0.04, 0.06, t.body, -0.01, 0.12, 0, 'z'));
    payloadHost.add(fallback);
    payloadHost.position.set(-0.015, 0.06, -0.09);
    payloadHost.rotation.set(0.1, -0.15, -0.12);
    throwPivot.add(payloadHost);

    // Open hand cupping the payload from below: palm slab under the base,
    // fingers curling up behind it, thumb bracing the near-right side.
    const gloveMat = GLOVE();
    const fingerMat = FINGER();
    const cuffMat = CUFF();
    const hand = new THREE.Group();
    hand.position.set(-0.015, 0.03, -0.09);
    hand.add(box(0.115, 0.035, 0.115, gloveMat, 0, 0, 0.01));
    for (let i = 0; i < 4; i++) {
      const fx = -0.034 + i * 0.0225;
      hand.add(box(0.026, 0.06, 0.028, fingerMat, fx, 0.028, -0.058));
      hand.add(box(0.026, 0.028, 0.034, fingerMat, fx, 0.06, -0.044));
    }
    hand.add(box(0.032, 0.05, 0.03, fingerMat, 0.066, 0.022, 0.028));
    hand.add(box(0.105, 0.07, 0.05, cuffMat, 0.012, -0.045, 0.075));
    const wrist = new THREE.Group();
    wrist.position.set(0.012, -0.05, 0.085);
    wrist.add(forearm(0.7, 0.35, 0.34));
    hand.add(wrist);
    throwPivot.add(hand);
    throwPivot.position.set(0, -0.01, 0.02);
    g.add(throwPivot);
    g.userData.throwPivot = throwPivot;
    g.userData.throwPayload = payloadHost;

    mountPoopModel(payloadHost, { targetLength: 0.18 }).then((mounted) => {
      if (mounted) fallback.visible = false;
    });
    addMuzzle(g, -0.015, 0.11, -0.18, 0.3);
    return g;
  },

  fahgun() {
    const g = new THREE.Group();
    const t = THEMES.fahgun();
    const fallback = new THREE.Group();
    const modelHost = new THREE.Group();
    g.add(fallback, modelHost);

    // Main launch tube
    fallback.add(cyl(0.055, 0.62, t.body, 0, 0.03, -0.12));
    // Bell muzzle
    fallback.add(cyl(0.075, 0.12, t.dark, 0, 0.03, -0.46));
    fallback.add(cyl(0.079, 0.02, t.accent, 0, 0.03, -0.52));
    // Rear exhaust flare
    fallback.add(cyl(0.068, 0.1, t.dark, 0, 0.03, 0.22));
    // Top carry handle / sight
    fallback.add(box(0.03, 0.05, 0.12, t.dark, 0, 0.1, -0.08));
    fallback.add(box(0.018, 0.018, 0.02, t.glow, 0, 0.13, -0.12));
    // Side warning stripe
    fallback.add(box(0.006, 0.03, 0.3, t.accent, 0.057, 0.045, -0.1));
    // Grip
    fallback.add(grip(t.dark, t.body, 0, -0.03, 0.06, 0.35));

    g.add(triggerHand({ x: 0, y: -0.09, z: 0.08 }));
    g.add(supportHand({ x: 0, y: -0.04, z: -0.24, rise: 0.05 }));

    addMuzzle(g, 0, 0.03, -0.55, 0.85);
    mountFahhGun(modelHost, { targetLength: 0.62 }).then((loaded) => {
      if (loaded) fallback.visible = false;
    });
    return g;
  },

  knife() {
    const g = new THREE.Group();
    const t = THEMES.knife();
    const fallbackRig = new THREE.Group();
    const knifeRig = new THREE.Group();
    const fallback = new THREE.Group();
    knifeRig.rotation.set(1.12, 0.04, -0.08);
    knifeRig.position.set(0.05, 0.01, 0);
    knifeRig.add(fallback);
    fallbackRig.add(knifeRig);
    g.add(fallbackRig);

    // Blade (held forward)
    fallback.add(box(0.035, 0.018, 0.22, t.blade, 0, 0.04, -0.16));
    // Cutting edge (slightly offset for bevel look)
    fallback.add(box(0.032, 0.006, 0.2, t.edge, 0, 0.03, -0.15));
    // Blade tip (narrowing)
    fallback.add(box(0.025, 0.015, 0.04, t.blade, 0, 0.04, -0.29));
    fallback.add(box(0.015, 0.012, 0.03, t.edge, 0, 0.038, -0.32));
    // Fuller / blood groove
    fallback.add(box(0.025, 0.005, 0.14, t.guard, 0, 0.045, -0.14));
    // Cross guard
    fallback.add(box(0.07, 0.024, 0.025, t.guard, 0, 0.038, -0.04));
    // Handle
    fallback.add(box(0.04, 0.042, 0.1, t.handle, 0, 0.035, 0.02));
    fallback.add(box(0.038, 0.02, 0.09, t.trim, 0, 0.055, 0.02));
    // Handle wrap ridges
    fallback.add(box(0.042, 0.044, 0.012, t.guard, 0, 0.035, -0.01));
    fallback.add(box(0.042, 0.044, 0.012, t.guard, 0, 0.035, 0.02));
    fallback.add(box(0.042, 0.044, 0.012, t.guard, 0, 0.035, 0.05));
    // Pommel
    fallback.add(box(0.045, 0.035, 0.025, t.guard, 0, 0.035, 0.085));
    fallback.add(box(0.02, 0.02, 0.015, t.trim, 0, 0.035, 0.098));

    // Compact one-handed grip; the old two-hand pose obscured the entire knife.
    const knifeHand = triggerHand({
      x: 0.025,
      y: -0.02,
      z: 0.06,
      armPitch: 0.82,
      armYaw: 0.3,
      armLength: 0.22,
      verticalGrip: true,
    });
    knifeHand.scale.setScalar(0.68);
    knifeRig.add(knifeHand);
    const offHand = readyHand({ x: -0.25, y: 0.04, z: 0.04 });
    offHand.scale.setScalar(0.8);
    fallbackRig.add(offHand);
    addMuzzle(g, 0, 0.04, -0.34, 0.34);
    mountKnifeViewModel(g, {
      scale: 0.72,
    }).then((model) => {
      if (!model) return;
      fallbackRig.visible = false;
      g.userData.knifeHold = model.getObjectByName('Right_Hold_Pose');
    });
    return g;
  },
};

/** Compact third-person guns — same themes, fewer parts. */
export const AVATAR_GUN_BUILDERS = {
  pistol() {
    const g = new THREE.Group();
    const t = THEMES.pistol();
    g.add(box(0.07, 0.05, 0.18, t.slide, 0, 0.04, -0.04));
    g.add(box(0.065, 0.04, 0.16, t.body, 0, 0.0, -0.03));
    g.add(grip(t.grip, t.trim, 0, -0.01, 0.04, 0.3));
    g.add(cyl(0.01, 0.06, t.barrel, 0, 0.015, -0.16));
    // Tiny iron sights
    g.add(box(0.01, 0.02, 0.01, t.slide, -0.012, 0.075, 0.03));
    g.add(box(0.01, 0.02, 0.01, t.slide, 0.012, 0.075, 0.03));
    g.add(box(0.01, 0.022, 0.01, t.glow, 0, 0.078, -0.1));
    g.userData.length = 0.5;
    return g;
  },
  assault() {
    const g = new THREE.Group();
    const t = THEMES.assault();
    const glass = mat(0x0b1220, { emissive: 0xf87171, emissiveIntensity: 1.0, roughness: 0.3 });
    const reticle = mat(0x0b1220, { emissive: 0xff2a2a, emissiveIntensity: 2.0, roughness: 0.25 });
    const fallback = new THREE.Group();
    const modelHost = new THREE.Group();
    g.add(fallback, modelHost);
    fallback.add(box(0.065, 0.06, 0.28, t.rail, 0, 0.03, -0.06));
    fallback.add(box(0.068, 0.065, 0.18, t.tan, 0, 0.01, -0.28));
    fallback.add(cyl(0.012, 0.2, t.barrel, 0, 0.015, -0.48));
    fallback.add(box(0.04, 0.12, 0.07, t.mag, 0, -0.1, -0.04));
    fallback.add(grip(t.body, t.rail, 0, -0.03, 0.1, 0.38));
    fallback.add(box(0.05, 0.05, 0.12, t.tan, 0, 0.0, 0.22));
    redDotOptic(fallback, t.rail, glass, reticle, 0, 0.08, -0.04);
    mountAssaultRifle(modelHost, {
      targetLength: 0.95,
      castShadow: true,
      offset: { x: 0, y: -0.02, z: 0.02 },
    }).then((loaded) => {
      if (loaded) fallback.visible = false;
    });
    g.userData.length = 0.95;
    return g;
  },
  shotgun() {
    const g = new THREE.Group();
    const t = THEMES.shotgun();
    g.add(box(0.07, 0.08, 0.22, t.blue, 0, 0.02, -0.02));
    g.add(cyl(0.024, 0.3, t.steel, 0, 0.03, -0.32));
    g.add(box(0.075, 0.06, 0.12, t.wood, 0, -0.03, -0.2));
    g.add(box(0.06, 0.07, 0.18, t.wood, 0, 0.0, 0.2));
    g.add(grip(t.wood, t.woodDark, 0, -0.01, 0.08, 0.28));
    g.userData.length = 1.05;
    return g;
  },
  sniper() {
    const g = new THREE.Group();
    const t = THEMES.sniper();
    g.add(box(0.06, 0.06, 0.34, t.olive, 0, 0.015, -0.06));
    g.add(cyl(0.011, 0.4, t.black, 0, 0.02, -0.45));
    g.add(cyl(0.025, 0.2, t.optic, 0, 0.09, -0.1));
    g.add(box(0.05, 0.05, 0.18, t.tan, 0, 0.0, 0.24));
    g.add(grip(t.olive, t.black, 0, -0.04, 0.1, 0.35));
    g.userData.length = 1.35;
    return g;
  },

  // --- Sidearms ---
  revolver() {
    const g = new THREE.Group();
    const t = THEMES.revolver();
    g.add(box(0.06, 0.05, 0.14, t.frame, 0, 0.035, -0.02));
    g.add(cyl(0.035, 0.055, t.cylinder, 0, 0.025, -0.05, 'x'));
    g.add(cyl(0.014, 0.18, t.barrel, 0, 0.035, -0.2));
    g.add(box(0.035, 0.03, 0.15, t.frame, 0, 0.05, -0.18));
    g.add(grip(t.wood, t.brass, 0, -0.01, 0.04, 0.33));
    g.add(box(0.012, 0.02, 0.012, t.brass, 0, 0.07, -0.25));
    g.userData.length = 0.55;
    return g;
  },
  machinepistol() {
    const g = new THREE.Group();
    const t = THEMES.machinepistol();
    g.add(box(0.06, 0.04, 0.18, t.slide, 0, 0.045, -0.03));
    g.add(box(0.058, 0.038, 0.16, t.body, 0, 0.008, -0.02));
    g.add(cyl(0.01, 0.05, t.barrel, 0, 0.015, -0.15));
    g.add(box(0.035, 0.14, 0.055, t.mag, 0, -0.1, -0.03));
    g.add(grip(t.grip, t.trim, 0, -0.01, 0.035, 0.3));
    g.add(box(0.01, 0.018, 0.01, t.glow, -0.012, 0.07, 0.02));
    g.add(box(0.01, 0.018, 0.01, t.glow, 0.012, 0.07, 0.02));
    g.userData.length = 0.45;
    return g;
  },
  deagle() {
    const g = new THREE.Group();
    const t = THEMES.deagle();
    g.add(box(0.08, 0.05, 0.24, t.slide, 0, 0.05, -0.06));
    g.add(box(0.075, 0.045, 0.2, t.body, 0, 0.005, -0.04));
    g.add(cyl(0.014, 0.06, t.barrel, 0, 0.02, -0.2));
    g.add(grip(t.grip, t.gold, 0, -0.01, 0.035, 0.28));
    g.add(box(0.082, 0.015, 0.04, t.gold, 0, 0.05, 0.0));
    g.add(box(0.01, 0.02, 0.01, t.glow, 0, 0.08, -0.12));
    g.userData.length = 0.6;
    return g;
  },

  // --- SMGs ---
  smg() {
    const g = new THREE.Group();
    const t = THEMES.smg();
    g.add(box(0.06, 0.06, 0.22, t.body, 0, 0.025, -0.03));
    g.add(box(0.064, 0.055, 0.13, t.rail, 0, 0.015, -0.2));
    g.add(cyl(0.01, 0.14, t.barrel, 0, 0.015, -0.36));
    g.add(box(0.035, 0.1, 0.055, t.mag, 0, -0.08, -0.04));
    g.add(grip(t.grip, t.rail, 0, -0.025, 0.08, 0.36));
    g.add(box(0.04, 0.045, 0.08, t.body, 0, 0.0, 0.22));
    g.add(box(0.012, 0.024, 0.01, t.glow, 0, 0.08, -0.24));
    g.userData.length = 0.5;
    return g;
  },
  p90() {
    const g = new THREE.Group();
    const t = THEMES.p90();
    g.add(box(0.068, 0.07, 0.3, t.body, 0, 0.015, -0.01));
    g.add(box(0.058, 0.025, 0.22, t.mag, 0, 0.06, -0.03));
    g.add(cyl(0.01, 0.1, t.barrel, 0, 0.01, -0.22));
    g.add(box(0.045, 0.025, 0.06, t.sight, 0, 0.085, -0.04));
    g.add(box(0.035, 0.05, 0.05, t.shell, 0, -0.045, -0.08));
    g.add(box(0.05, 0.065, 0.025, t.body, 0, 0.008, 0.15));
    g.add(box(0.025, 0.02, 0.008, t.glow, 0, 0.092, -0.06));
    g.userData.length = 0.5;
    return g;
  },
  vector() {
    const g = new THREE.Group();
    const t = THEMES.vector();
    g.add(box(0.058, 0.058, 0.18, t.body, 0, 0.035, -0.01));
    g.add(box(0.062, 0.07, 0.16, t.body, 0, -0.015, 0.0));
    g.add(cyl(0.01, 0.12, t.barrel, 0, 0.03, -0.2));
    g.add(box(0.035, 0.11, 0.05, t.mag, 0, -0.1, -0.01));
    g.add(grip(t.grip, t.rail, 0, -0.035, 0.08, 0.36));
    g.add(box(0.03, 0.055, 0.03, t.grip, 0, -0.05, -0.1));
    g.add(box(0.035, 0.04, 0.1, t.stock, 0, 0.008, 0.16));
    g.userData.length = 0.48;
    return g;
  },

  // --- Rifles ---
  battlerifle() {
    const g = new THREE.Group();
    const t = THEMES.battlerifle();
    g.add(box(0.068, 0.065, 0.28, t.body, 0, 0.035, -0.05));
    g.add(box(0.07, 0.06, 0.16, t.tan, 0, 0.015, -0.26));
    g.add(cyl(0.013, 0.24, t.barrel, 0, 0.02, -0.48));
    g.add(box(0.045, 0.13, 0.075, t.mag, 0, -0.1, -0.04));
    g.add(grip(t.body, t.rail, 0, -0.035, 0.1, 0.38));
    g.add(box(0.05, 0.055, 0.14, t.tan, 0, 0.0, 0.24));
    g.add(box(0.012, 0.025, 0.012, t.steel, 0, 0.085, -0.38));
    g.userData.length = 0.65;
    return g;
  },
  burstrifle() {
    const g = new THREE.Group();
    const t = THEMES.burstrifle();
    g.add(box(0.064, 0.058, 0.24, t.body, 0, 0.035, -0.03));
    g.add(box(0.07, 0.052, 0.16, t.handguard, 0, 0.008, -0.22));
    g.add(cyl(0.012, 0.2, t.barrel, 0, 0.015, -0.42));
    g.add(box(0.04, 0.01, 0.12, t.rail, 0, 0.07, -0.02));
    g.add(box(0.012, 0.035, 0.012, t.rail, -0.014, 0.088, -0.06));
    g.add(box(0.012, 0.035, 0.012, t.rail, 0.014, 0.088, -0.06));
    g.add(box(0.038, 0.1, 0.065, t.mag, 0, -0.09, -0.03));
    g.add(grip(t.body, t.rail, 0, -0.035, 0.08, 0.38));
    g.add(box(0.045, 0.05, 0.1, t.handguard, 0, 0.0, 0.2));
    g.userData.length = 0.6;
    return g;
  },
  dmr() {
    const g = new THREE.Group();
    const t = THEMES.dmr();
    g.add(box(0.062, 0.058, 0.32, t.body, 0, 0.015, -0.06));
    g.add(cyl(0.012, 0.34, t.barrel, 0, 0.018, -0.42));
    g.add(cyl(0.02, 0.16, t.optic, 0, 0.085, -0.08));
    g.add(cyl(0.025, 0.025, t.glass, 0, 0.085, -0.18));
    g.add(box(0.038, 0.07, 0.055, t.body, 0, -0.06, -0.02));
    g.add(grip(t.body, t.rail, 0, -0.035, 0.08, 0.36));
    g.add(box(0.045, 0.045, 0.18, t.tan, 0, 0.0, 0.22));
    g.userData.length = 0.85;
    return g;
  },
  carbine() {
    const g = new THREE.Group();
    const t = THEMES.carbine();
    const glass = mat(0x0b1220, { emissive: 0xf87171, emissiveIntensity: 1.0, roughness: 0.3 });
    const reticle = mat(0x0b1220, { emissive: 0xff2a2a, emissiveIntensity: 2.0, roughness: 0.25 });
    g.add(box(0.058, 0.056, 0.18, t.rail, 0, 0.03, -0.02));
    g.add(box(0.06, 0.05, 0.12, t.green, 0, 0.008, -0.16));
    g.add(cyl(0.01, 0.12, t.barrel, 0, 0.015, -0.3));
    g.add(box(0.035, 0.09, 0.055, t.mag, 0, -0.08, -0.03));
    g.add(grip(t.body, t.rail, 0, -0.03, 0.06, 0.36));
    g.add(box(0.035, 0.04, 0.07, t.green, 0, 0.0, 0.18));
    redDotOptic(g, t.rail, glass, reticle, 0, 0.07, -0.02);
    g.userData.length = 0.5;
    return g;
  },

  // --- Shotguns ---
  autoshotgun() {
    const g = new THREE.Group();
    const t = THEMES.autoshotgun();
    g.add(box(0.07, 0.08, 0.2, t.body, 0, 0.02, -0.01));
    g.add(cyl(0.022, 0.26, t.barrel, 0, 0.03, -0.28));
    g.add(box(0.07, 0.05, 0.1, t.wood, 0, -0.02, -0.16));
    g.add(box(0.048, 0.1, 0.07, t.mag, 0, -0.08, -0.03));
    g.add(grip(t.wood, t.body, 0, -0.015, 0.065, 0.33));
    g.add(box(0.05, 0.055, 0.14, t.wood, 0, 0.0, 0.18));
    g.add(box(0.012, 0.018, 0.012, t.glow, 0, 0.068, -0.38));
    g.userData.length = 0.95;
    return g;
  },
  slugshotgun() {
    const g = new THREE.Group();
    const t = THEMES.slugshotgun();
    g.add(box(0.07, 0.08, 0.24, t.body, 0, 0.02, -0.02));
    g.add(cyl(0.022, 0.36, t.steel, 0, 0.03, -0.38));
    g.add(cyl(0.013, 0.26, t.body, 0, -0.01, -0.3));
    g.add(box(0.072, 0.055, 0.1, t.wood, 0, -0.025, -0.22));
    g.add(grip(t.wood, t.woodDark, 0, -0.01, 0.065, 0.26));
    g.add(box(0.055, 0.065, 0.18, t.wood, 0, 0.0, 0.2));
    g.add(box(0.012, 0.02, 0.012, t.brass, 0, 0.065, -0.52));
    g.userData.length = 1.1;
    return g;
  },
  doublebarrel() {
    const g = new THREE.Group();
    const t = THEMES.doublebarrel();
    g.add(box(0.08, 0.07, 0.14, t.body, 0, 0.02, -0.01));
    g.add(cyl(0.02, 0.34, t.steel, -0.018, 0.03, -0.3));
    g.add(cyl(0.02, 0.34, t.steel, 0.018, 0.03, -0.3));
    g.add(grip(t.wood, t.woodDark, 0, -0.01, 0.05, 0.26));
    g.add(box(0.058, 0.065, 0.2, t.wood, 0, 0.0, 0.18));
    g.add(box(0.012, 0.016, 0.012, t.brass, 0, 0.06, -0.46));
    g.userData.length = 1.0;
    return g;
  },

  // --- Snipers ---
  scout() {
    const g = new THREE.Group();
    const t = THEMES.scout();
    g.add(box(0.055, 0.052, 0.28, t.body, 0, 0.012, -0.04));
    g.add(cyl(0.009, 0.34, t.black, 0, 0.018, -0.4));
    g.add(cyl(0.02, 0.17, t.optic, 0, 0.08, -0.08));
    g.add(cyl(0.025, 0.025, t.glass, 0, 0.08, -0.18));
    g.add(box(0.033, 0.05, 0.045, t.black, 0, -0.05, -0.02));
    g.add(grip(t.body, t.black, 0, -0.035, 0.08, 0.34));
    g.add(box(0.042, 0.042, 0.16, t.tan, 0, 0.0, 0.2));
    g.userData.length = 1.1;
    return g;
  },
  awp() {
    const g = new THREE.Group();
    const t = THEMES.awp();
    g.add(box(0.068, 0.068, 0.38, t.body, 0, 0.015, -0.08));
    g.add(cyl(0.012, 0.45, t.black, 0, 0.02, -0.52));
    g.add(cyl(0.03, 0.26, t.optic, 0, 0.1, -0.12));
    g.add(cyl(0.036, 0.035, t.glass, 0, 0.1, -0.27));
    g.add(box(0.045, 0.075, 0.065, t.black, 0, -0.07, -0.02));
    g.add(grip(t.body, t.black, 0, -0.045, 0.1, 0.38));
    g.add(box(0.055, 0.055, 0.22, t.stock, 0, 0.0, 0.28));
    g.add(box(0.065, 0.016, 0.02, t.steel, 0.04, 0.04, 0.08));
    g.userData.length = 1.5;
    return g;
  },

  // --- Heavy ---
  lmg() {
    const g = new THREE.Group();
    const t = THEMES.lmg();
    g.add(box(0.072, 0.07, 0.28, t.body, 0, 0.03, -0.03));
    g.add(cyl(0.014, 0.28, t.barrel, 0, 0.02, -0.42));
    g.add(box(0.055, 0.04, 0.16, t.rail, 0, 0.02, -0.3));
    g.add(box(0.06, 0.08, 0.08, t.mag, 0, -0.08, -0.04));
    g.add(box(0.062, 0.015, 0.082, t.brass, 0, -0.13, -0.04));
    g.add(grip(t.body, t.rail, 0, -0.035, 0.1, 0.38));
    g.add(box(0.05, 0.055, 0.14, t.body, 0, 0.0, 0.26));
    g.add(box(0.02, 0.01, 0.12, t.steel, 0, 0.078, -0.1));
    g.userData.length = 0.8;
    return g;
  },
  minigun() {
    const g = new THREE.Group();
    const t = THEMES.minigun();
    g.add(cyl(0.05, 0.12, t.housing, 0, 0.015, 0.02));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(cyl(0.007, 0.3, t.barrels, Math.cos(a) * 0.028, 0.015 + Math.sin(a) * 0.028, -0.22));
    }
    g.add(cyl(0.045, 0.02, t.body, 0, 0.015, -0.08));
    g.add(cyl(0.045, 0.02, t.body, 0, 0.015, -0.28));
    g.add(cyl(0.04, 0.025, t.brass, 0, 0.015, -0.38));
    g.add(box(0.035, 0.07, 0.05, t.grip, 0.025, -0.04, 0.06));
    g.add(box(0.035, 0.07, 0.05, t.grip, -0.025, -0.04, 0.06));
    g.userData.length = 0.7;
    return g;
  },

  // --- Exotic ---
  crossbow() {
    const g = new THREE.Group();
    const t = THEMES.crossbow();
    g.add(box(0.05, 0.05, 0.28, t.body, 0, 0.015, -0.01));
    g.add(box(0.2, 0.02, 0.03, t.limb, 0, 0.015, -0.18));
    g.add(box(0.15, 0.005, 0.005, t.string, 0, 0.015, -0.16));
    g.add(cyl(0.004, 0.22, t.brass, 0, 0.04, -0.12));
    g.add(grip(t.body, t.brass, 0, -0.015, 0.06, 0.33));
    g.add(box(0.04, 0.04, 0.12, t.body, 0, 0.0, 0.18));
    g.userData.length = 0.6;
    return g;
  },
  sawedoff() {
    const g = new THREE.Group();
    const t = THEMES.sawedoff();
    g.add(box(0.075, 0.065, 0.1, t.steel, 0, 0.02, 0.0));
    g.add(cyl(0.018, 0.16, t.barrel, -0.015, 0.03, -0.13));
    g.add(cyl(0.018, 0.16, t.barrel, 0.015, 0.03, -0.13));
    g.add(grip(t.wood, t.woodDark, 0, -0.01, 0.035, 0.28));
    g.add(cyl(0.012, 0.06, t.brass, 0, 0.05, -0.05, 'x'));
    g.userData.length = 0.45;
    return g;
  },
  leveraction() {
    const g = new THREE.Group();
    const t = THEMES.leveraction();
    g.add(box(0.062, 0.065, 0.18, t.brass, 0, 0.025, -0.01));
    g.add(box(0.035, 0.035, 0.34, t.blue, 0, 0.035, -0.3));
    g.add(cyl(0.01, 0.28, t.steel, 0, -0.002, -0.28));
    g.add(box(0.04, 0.01, 0.08, t.brass, 0, -0.03, 0.0));
    g.add(box(0.012, 0.05, 0.012, t.brass, -0.016, -0.055, -0.03));
    g.add(box(0.012, 0.05, 0.012, t.brass, 0.016, -0.055, -0.03));
    g.add(grip(t.wood, t.woodDark, 0, -0.008, 0.05, 0.26));
    g.add(box(0.055, 0.065, 0.2, t.wood, 0, 0.008, 0.2));
    g.userData.length = 0.9;
    return g;
  },

  // --- Special ---
  bow() {
    const g = new THREE.Group();
    const t = THEMES.bow();
    g.add(box(0.035, 0.12, 0.05, t.leather, 0, 0.0, 0.0));
    g.add(box(0.025, 0.16, 0.03, t.wood, 0, 0.16, -0.01));
    g.add(box(0.022, 0.06, 0.025, t.wood, 0, 0.26, -0.03));
    g.add(box(0.025, 0.16, 0.03, t.wood, 0, -0.16, -0.01));
    g.add(box(0.022, 0.06, 0.025, t.wood, 0, -0.26, -0.03));
    g.add(box(0.004, 0.58, 0.004, t.string, 0, 0.0, -0.045));
    g.add(cyl(0.003, 0.28, t.tip, 0, 0.045, -0.16));
    g.userData.length = 0.5;
    return g;
  },
  laser() {
    const g = new THREE.Group();
    const t = THEMES.laser();
    g.add(box(0.058, 0.052, 0.24, t.body, 0, 0.03, -0.03));
    g.add(box(0.053, 0.04, 0.2, t.dark, 0, -0.008, -0.01));
    g.add(cyl(0.018, 0.1, t.chrome, 0, 0.025, -0.2));
    g.add(cyl(0.022, 0.025, t.cyan, 0, 0.025, -0.26));
    g.add(box(0.06, 0.012, 0.1, t.cyan, 0, 0.06, -0.04));
    g.add(grip(t.grip, t.dark, 0, -0.015, 0.05, 0.32));
    g.add(box(0.05, 0.05, 0.08, t.dark, 0, 0.015, 0.14));
    g.userData.length = 0.5;
    return g;
  },
  poopgun() {
    const g = new THREE.Group();
    const t = THEMES.poopgun();
    const fallback = new THREE.Group();
    const modelHost = new THREE.Group();
    fallback.add(cyl(0.07, 0.08, t.body, 0, 0, 0, 'z'));
    fallback.add(cyl(0.05, 0.065, t.nozzle, 0.01, 0.06, 0, 'z'));
    modelHost.add(fallback);
    g.add(modelHost);
    mountPoopModel(modelHost, { targetLength: 0.2, castShadow: true }).then((mounted) => {
      if (mounted) fallback.visible = false;
    });
    g.userData.length = 0.2;
    return g;
  },
  fahgun() {
    const g = new THREE.Group();
    const t = THEMES.fahgun();
    const fallback = new THREE.Group();
    const modelHost = new THREE.Group();
    g.add(fallback, modelHost);
    fallback.add(cyl(0.06, 0.68, t.body, 0, 0.03, -0.05));
    fallback.add(cyl(0.08, 0.12, t.dark, 0, 0.03, -0.42));
    fallback.add(cyl(0.07, 0.1, t.dark, 0, 0.03, 0.32));
    fallback.add(box(0.03, 0.05, 0.12, t.dark, 0, 0.1, -0.05));
    fallback.add(grip(t.dark, t.body, 0, -0.03, 0.1, 0.3));
    mountFahhGun(modelHost, { targetLength: 1.0, castShadow: true }).then((loaded) => {
      if (loaded) fallback.visible = false;
    });
    g.userData.length = 1.0;
    return g;
  },
  knife() {
    const g = new THREE.Group();
    const t = THEMES.knife();
    const fallback = new THREE.Group();
    const modelHost = new THREE.Group();
    g.add(fallback, modelHost);
    fallback.add(box(0.03, 0.015, 0.18, t.blade, 0, 0.035, -0.12));
    fallback.add(box(0.028, 0.005, 0.16, t.edge, 0, 0.027, -0.11));
    fallback.add(box(0.06, 0.02, 0.02, t.guard, 0, 0.033, -0.02));
    fallback.add(box(0.035, 0.035, 0.08, t.handle, 0, 0.03, 0.03));
    fallback.add(box(0.038, 0.028, 0.02, t.guard, 0, 0.03, 0.075));
    mountBayonet(modelHost, {
      targetLength: 0.38,
      castShadow: true,
      offset: { x: 0, y: 0.01, z: -0.055 },
    }).then((loaded) => {
      if (loaded) fallback.visible = false;
    });
    g.userData.length = 0.38;
    return g;
  },
};

/**
 * Third-person hold data. The gun is parented to the right hand so it can never
 * detach; `gunOffset` slides the model so its grip lands in that hand, and the
 * shoulders are staggered into a bladed stance so the left arm can actually
 * reach the forend — square shoulders leave the arms far too short.
 */
export const AVATAR_HOLDS = {
  pistol: {
    rightShoulder: [0.33, 1.3, 0.02],
    leftShoulder: [-0.36, 1.28, 0],
    rightArm: [0.95, 0, -0.55],
    leftArm: [0.9, 0, 0.5],
    gunOffset: [0, 0.082, -0.018],
  },
  assault: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.16, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.45, 0, 0.56],
    gunOffset: [0, 0.1, -0.072],
  },
  shotgun: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.18, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.42, 0, 0.56],
    gunOffset: [0, 0.082, -0.059],
  },
  sniper: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.22, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.45, 0, 0.56],
    gunOffset: [0, 0.111, -0.074],
  },
  // --- Sidearms ---
  revolver: {
    rightShoulder: [0.33, 1.3, 0.02],
    leftShoulder: [-0.36, 1.28, 0],
    rightArm: [0.95, 0, -0.55],
    leftArm: [0.9, 0, 0.5],
    gunOffset: [0, 0.082, -0.02],
  },
  machinepistol: {
    rightShoulder: [0.33, 1.3, 0.02],
    leftShoulder: [-0.36, 1.28, 0],
    rightArm: [0.95, 0, -0.55],
    leftArm: [0.92, 0, 0.5],
    gunOffset: [0, 0.082, -0.018],
  },
  deagle: {
    rightShoulder: [0.33, 1.3, 0.02],
    leftShoulder: [-0.36, 1.28, 0],
    rightArm: [0.95, 0, -0.55],
    leftArm: [0.9, 0, 0.5],
    gunOffset: [0, 0.085, -0.022],
  },
  // --- SMGs ---
  smg: {
    rightShoulder: [0.33, 1.3, 0.05],
    leftShoulder: [-0.34, 1.2, -0.12],
    rightArm: [1.0, 0, -0.6],
    leftArm: [1.3, 0, 0.54],
    gunOffset: [0, 0.09, -0.055],
  },
  p90: {
    rightShoulder: [0.33, 1.3, 0.05],
    leftShoulder: [-0.34, 1.2, -0.12],
    rightArm: [1.0, 0, -0.6],
    leftArm: [1.25, 0, 0.54],
    gunOffset: [0, 0.088, -0.05],
  },
  vector: {
    rightShoulder: [0.33, 1.3, 0.05],
    leftShoulder: [-0.34, 1.2, -0.12],
    rightArm: [1.0, 0, -0.6],
    leftArm: [1.28, 0, 0.54],
    gunOffset: [0, 0.09, -0.048],
  },
  // --- Rifles ---
  battlerifle: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.16, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.45, 0, 0.56],
    gunOffset: [0, 0.1, -0.075],
  },
  burstrifle: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.16, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.42, 0, 0.56],
    gunOffset: [0, 0.098, -0.068],
  },
  dmr: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.2, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.45, 0, 0.56],
    gunOffset: [0, 0.105, -0.072],
  },
  carbine: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.18, -0.14],
    rightArm: [1.02, 0, -0.62],
    leftArm: [1.35, 0, 0.55],
    gunOffset: [0, 0.092, -0.06],
  },
  // --- Shotguns ---
  autoshotgun: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.18, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.42, 0, 0.56],
    gunOffset: [0, 0.085, -0.06],
  },
  slugshotgun: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.18, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.44, 0, 0.56],
    gunOffset: [0, 0.082, -0.062],
  },
  doublebarrel: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.18, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.4, 0, 0.56],
    gunOffset: [0, 0.082, -0.055],
  },
  // --- Snipers ---
  scout: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.2, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.42, 0, 0.56],
    gunOffset: [0, 0.1, -0.068],
  },
  awp: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.22, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.48, 0, 0.56],
    gunOffset: [0, 0.115, -0.078],
  },
  // --- Heavy ---
  lmg: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.18, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.45, 0, 0.56],
    gunOffset: [0, 0.1, -0.07],
  },
  minigun: {
    rightShoulder: [0.33, 1.3, 0.04],
    leftShoulder: [-0.33, 1.18, -0.12],
    rightArm: [1.0, 0, -0.58],
    leftArm: [1.0, 0, 0.58],
    gunOffset: [0, 0.085, -0.04],
  },
  // --- Exotic ---
  crossbow: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.18, -0.14],
    rightArm: [1.02, 0, -0.62],
    leftArm: [1.35, 0, 0.55],
    gunOffset: [0, 0.09, -0.058],
  },
  sawedoff: {
    rightShoulder: [0.33, 1.3, 0.02],
    leftShoulder: [-0.36, 1.28, 0],
    rightArm: [0.95, 0, -0.55],
    leftArm: [0.92, 0, 0.5],
    gunOffset: [0, 0.082, -0.022],
  },
  leveraction: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.18, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.42, 0, 0.56],
    gunOffset: [0, 0.088, -0.06],
  },
  // --- Special ---
  bow: {
    rightShoulder: [0.33, 1.3, 0.04],
    leftShoulder: [-0.34, 1.22, -0.1],
    rightArm: [1.0, 0, -0.58],
    leftArm: [1.2, 0, 0.54],
    gunOffset: [0, 0.082, -0.02],
  },
  laser: {
    rightShoulder: [0.33, 1.3, 0.05],
    leftShoulder: [-0.34, 1.2, -0.14],
    rightArm: [1.02, 0, -0.62],
    leftArm: [1.35, 0, 0.55],
    gunOffset: [0, 0.09, -0.055],
  },
  poopgun: {
    rightShoulder: [0.33, 1.3, 0.02],
    leftShoulder: [-0.36, 1.28, 0],
    rightArm: [0.95, 0, -0.55],
    leftArm: [0.92, 0, 0.5],
    gunOffset: [0, 0.082, -0.02],
  },
  fahgun: {
    rightShoulder: [0.33, 1.3, 0.06],
    leftShoulder: [-0.33, 1.16, -0.16],
    rightArm: [1.05, 0, -0.64],
    leftArm: [1.45, 0, 0.56],
    gunOffset: [0, 0.12, -0.06],
  },
  knife: {
    rightShoulder: [0.34, 1.32, 0.08],
    leftShoulder: [-0.34, 1.2, -0.04],
    rightArm: [1.15, 0.15, -0.35],
    leftArm: [0.55, 0, 0.35],
    gunOffset: [0, 0.07, -0.02],
  },
};

// The viewmodel uses its own narrow FOV so the weapon reads large without
// sitting so close to the camera that the stock pokes into frame.
const VIEWMODEL_FOV = 54;
const HOME = new THREE.Vector3(0.43, -0.18, -0.8);
const KNIFE_HOME = new THREE.Vector3(0.1, -0.13, -0.82);
const SCOPED = new THREE.Vector3(0.01, -0.16, -0.75);
const VIEWMODEL_SCALE = 1.5;

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, 1, 0.01, 12);

    this.scene.add(new THREE.HemisphereLight(0xe8f1ff, 0x3a4555, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(0.5, 1.4, 1.0);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffe6c8, 0.85);
    fill.position.set(-0.8, 0.2, 0.4);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0x7dd3fc, 0.7);
    rim.position.set(-0.3, 0.6, -1.0);
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
    this.swing = 0;
    this.throwPhase = 0;
    this.hidden = false;
  }

  setWeapon(id) {
    if (this.weaponId === id) return;
    this.clear();
    const build = BUILDERS[id] || BUILDERS.pistol;
    this.weapon = build();
    if (id === 'knife') {
      // Counter-Strike-style stance: vertical knife in the right hand with
      // the relaxed left hand visible near the lower centre.
      this.weapon.rotation.set(0, 0.04, -0.02);
      this.weapon.scale.setScalar(0.95);
    } else if (id === 'poopgun') {
      // Hold the throwable cocked near the right shoulder.
      this.weapon.rotation.set(-0.08, 0.08, 0.02);
      this.weapon.scale.setScalar(0.85);
    } else {
      // Yawed and canted like a real FPS viewmodel: the buttstock swings off
      // the right edge instead of into frame.
      this.weapon.rotation.set(0, 0.2, 0.1);
    }
    this.weaponId = id;
    this.swing = 0;
    this.throwPhase = 0;
    this.holder.add(this.weapon);
  }

  clear() {
    if (!this.weapon) return;
    this.holder.remove(this.weapon);
    this.weapon.traverse((child) => {
      child.userData.disposed = true;
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) m.dispose();
      }
    });
    this.weapon = null;
    this.weaponId = null;
    this.swing = 0;
    this.throwPhase = 0;
  }

  get barrelLength() {
    return this.weapon ? this.weapon.userData.length : 1;
  }

  muzzlePosition(out) {
    if (!this.weapon) return out.set(0, 0, -0.5);
    return this.weapon.userData.muzzle.getWorldPosition(out);
  }

  addRecoil(amount) {
    this.recoil = Math.min(1.4, this.recoil + amount);
  }

  /** Start a first-person bayonet/knife slash. */
  playSwing() {
    this.swing = 1;
  }

  /** Release the held throwable with a grenade-style overhand motion. */
  playThrow() {
    this.throwPhase = 1;
  }

  look(dYaw, dPitch) {
    this.swayTarget.set(
      THREE.MathUtils.clamp(dYaw * 6, -0.09, 0.09),
      THREE.MathUtils.clamp(dPitch * 6, -0.07, 0.07),
    );
  }

  update(dt, { moving, onGround, crouching, sliding, zooming, reloading, reloadProgress, ammo }) {
    if (!this.weapon) return;

    this.hidden = Boolean(zooming);
    this.weapon.visible = !this.hidden;

    this.recoil *= Math.exp(-dt * 11);
    this.sway.lerp(this.swayTarget, Math.min(1, dt * 12));
    this.swayTarget.multiplyScalar(Math.exp(-dt * 7));

    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt * 2.5);
    if (this.throwPhase > 0) this.throwPhase = Math.max(0, this.throwPhase - dt * 2.8);

    if (moving && onGround && !sliding) this.bobTime += dt * 9.5;
    else this.bobTime += dt * 1.6;

    const bobX = sliding ? 0 : Math.cos(this.bobTime) * (moving && onGround ? 0.014 : 0.003);
    const bobY = sliding ? 0 : Math.abs(Math.sin(this.bobTime)) * (moving && onGround ? 0.012 : 0.002);

    const home = zooming ? SCOPED : this.weaponId === 'knife' ? KNIFE_HOME : HOME;
    const crouchDrop = crouching ? 0.06 : 0;
    const slideDrop = sliding ? 0.1 : 0;

    this.reloadPhase = reloading ? Math.min(1, this.reloadPhase + dt * 4) : Math.max(0, this.reloadPhase - dt * 5);
    // The poopgun has its own reach-behind reload move on the throw pivot, so
    // skip the generic barrel dip for it.
    const reloadDip = this.weaponId === 'poopgun'
      ? 0
      : Math.sin(Math.PI * Math.min(1, reloadProgress || 0)) * this.reloadPhase;

    // Knife stab: short anticipation pulling the arm back, a fast thrust that
    // pitches the vertical blade toward the target, then a smooth recovery.
    // The gripping hierarchy moves as one rigid unit so the authored wrist,
    // fingers, and knife alignment are never disturbed.
    const swingT = 1 - this.swing;
    let wind = 0;
    let strike = 0;
    if (this.swing > 0 && swingT < 0.16) {
      wind = smoothstep01(swingT / 0.16);
    } else if (this.swing > 0 && swingT < 0.4) {
      const hit = (swingT - 0.16) / 0.24;
      strike = 1 - (1 - hit) * (1 - hit); // fast launch, decelerating into impact
      wind = 1 - strike;
    } else if (this.swing > 0) {
      strike = 1 - smoothstep01((swingT - 0.4) / 0.6);
    }
    const knifeHold = this.weaponId === 'knife' ? this.weapon.userData.knifeHold : null;
    if (knifeHold) {
      // Move only the authored gripping arm; the ready hand stays planted.
      if (!knifeHold.userData.swingRest) {
        knifeHold.userData.swingRest = {
          position: knifeHold.position.clone(),
          rotation: knifeHold.rotation.clone(),
        };
      }
      const rest = knifeHold.userData.swingRest;
      knifeHold.position.set(
        rest.position.x + wind * 0.03 - strike * 0.14,
        rest.position.y + wind * 0.02 + strike * 0.01,
        rest.position.z + wind * 0.06 - strike * 0.3,
      );
      knifeHold.rotation.set(
        rest.rotation.x + wind * 0.16 - strike * 0.68,
        rest.rotation.y - wind * 0.05 + strike * 0.3,
        rest.rotation.z + wind * 0.06 - strike * 0.18,
      );
    }
    const holderSlash = knifeHold ? 0 : strike;
    const holderWind = knifeHold ? 0 : wind;

    const throwPivot = this.weaponId === 'poopgun' ? this.weapon.userData.throwPivot : null;
    if (throwPivot) {
      if (!throwPivot.userData.throwRest) {
        throwPivot.userData.throwRest = {
          position: throwPivot.position.clone(),
          rotation: throwPivot.rotation.clone(),
        };
      }
      const rest = throwPivot.userData.throwRest;
      const t = 1 - this.throwPhase;
      const followThrough = this.throwPhase > 0 ? Math.sin(Math.min(1, t) * Math.PI) : 0;
      // Reload: the hand sweeps down and back toward the player's rear, pauses
      // off-screen for the grab, then swings back up holding a fresh poop.
      const rp = reloading ? Math.min(1, reloadProgress || 0) : 0;
      let reach = 0;
      if (rp > 0) {
        if (rp < 0.35) reach = smoothstep01(rp / 0.35);
        else if (rp < 0.5) reach = 1;
        else reach = 1 - smoothstep01((rp - 0.5) / 0.5);
      }
      throwPivot.position.set(
        rest.position.x - followThrough * 0.25 + reach * 0.22,
        rest.position.y + followThrough * 0.12 - reach * 0.42,
        rest.position.z - followThrough * 0.32 + reach * 0.3,
      );
      throwPivot.rotation.set(
        rest.rotation.x - followThrough * 0.9 + reach * 1.3,
        rest.rotation.y + followThrough * 0.18 - reach * 0.6,
        rest.rotation.z - followThrough * 0.48 - reach * 0.45,
      );
      const payload = this.weapon.userData.throwPayload;
      if (payload) {
        const empty = typeof ammo === 'number' && ammo <= 0;
        const released = this.throwPhase > 0 && t >= 0.1;
        if (reloading) {
          // Empty hand on the way down; the poop reappears mid-grab so the
          // hand visibly comes back up holding the fresh one.
          payload.visible = rp >= 0.5;
        } else {
          // Hide the held poop once it leaves the hand, and keep the hand
          // empty while out of ammo until the reload restocks it.
          payload.visible = !empty && !released;
        }
      }
    }

    this.holder.position.set(
      home.x + this.sway.x + bobX + holderSlash * -0.18 + holderWind * 0.08,
      home.y + this.sway.y + bobY - reloadDip * 0.14 - crouchDrop - slideDrop + holderSlash * 0.04 + holderWind * 0.06,
      home.z + this.recoil * 0.075 + holderSlash * -0.1,
    );

    this.holder.rotation.set(
      this.recoil * 0.24 + reloadDip * 0.5 + (sliding ? 0.25 : 0) + holderSlash * 0.55 + holderWind * -0.35,
      -this.sway.x * 1.6 + holderSlash * 0.85 + holderWind * -0.45,
      this.sway.y * 0.9 + reloadDip * 0.3 + holderSlash * -1.35 + holderWind * 0.55,
    );
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
