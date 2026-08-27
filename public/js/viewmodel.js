import * as THREE from '/vendor/three.module.js';

// The viewmodel lives in its own scene rendered after the world with the depth
// buffer cleared, which is the standard way to stop the gun clipping into walls.

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

// Tactical gloves rather than bare skin. The guns span tan, wood, olive, navy
// and bright steel, so no single glove colour contrasts with all of them —
// instead every finger segment gets a pale pad, and the resulting striped
// banding reads as a hand against any of the weapons.
const GLOVE = () => mat(0x2f3338, { roughness: 0.82, metalness: 0.06 });
const GLOVE_DARK = () => mat(0x14171a, { roughness: 0.85, metalness: 0.05 });
const PAD = () => mat(0xb6a893, { roughness: 0.68, metalness: 0.08 });
const SLEEVE = () => mat(0x2b3a52, { roughness: 0.85, metalness: 0.04 });
const CUFF = () => mat(0x151c27, { roughness: 0.85, metalness: 0.05 });

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
 * Left hand supporting the weapon from underneath. `y` is the bottom of the
 * forend: the hand cups it from below and the fingers only come part-way up the
 * near side, so nothing reaches over the top of the weapon.
 */
function supportHand({ x, y, z, rise = 0.05, spread = 0, armPitch = 0.95, armYaw = -0.42, armLength = 0.5 }) {
  const glove = GLOVE();
  const dark = GLOVE_DARK();
  const pad = PAD();
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const handX = -0.008 - spread;
  const handY = -0.023;
  const fingerY = handY + rise / 2 + 0.012;

  // Back of the hand cupping the forend from below
  g.add(box(0.09, 0.058, 0.142, glove, handX, handY, 0));
  // Fingers coming up the near side, padded so they read against the gun
  for (let i = 0; i < 4; i++) {
    const fz = -0.05 + i * 0.033;
    g.add(box(0.03, rise, 0.028, glove, handX - 0.042, fingerY, fz));
    g.add(box(0.013, rise - 0.014, 0.028, pad, handX - 0.06, fingerY + 0.002, fz));
    if (i < 3) g.add(box(0.058, rise + 0.004, 0.008, dark, handX - 0.05, fingerY, fz + 0.0165));
  }
  // Thumb laid along the far side
  g.add(box(0.028, 0.03, 0.088, glove, handX + 0.046, handY + 0.022, -0.05));
  // Wrist and forearm heading off-screen
  g.add(box(0.072, 0.062, 0.05, dark, handX, handY - 0.006, 0.094));
  const wrist = new THREE.Group();
  wrist.position.set(handX, handY - 0.008, 0.106);
  wrist.add(forearm(armPitch, armYaw, armLength));
  g.add(wrist);

  return g;
}

/**
 * Right hand on a pistol grip. The palm hides behind the grip; the fingers wrap
 * around the front and their tips come back out on the camera side, with the
 * thumb riding along the near flank.
 */
function triggerHand({ x, y, z, armPitch = 0.78, armYaw = 0.32, armLength = 0.36 }) {
  const glove = GLOVE();
  const dark = GLOVE_DARK();
  const pad = PAD();
  const g = new THREE.Group();
  g.position.set(x, y, z);

  // Palm behind the grip, on the far side
  g.add(box(0.05, 0.125, 0.1, glove, 0.052, 0.0, 0.005));
  // Fingers wrapping the front of the grip, tips protruding on the near side
  for (let i = 0; i < 3; i++) {
    const fy = 0.006 - i * 0.034;
    g.add(box(0.098, 0.028, 0.027, glove, 0.006, fy, -0.04));
    g.add(box(0.03, 0.028, 0.042, glove, -0.046, fy, -0.02));
    g.add(box(0.012, 0.022, 0.036, pad, -0.063, fy, -0.018));
    if (i < 2) {
      g.add(box(0.1, 0.008, 0.03, dark, 0.006, fy - 0.017, -0.042));
      g.add(box(0.05, 0.008, 0.044, dark, -0.05, fy - 0.017, -0.02));
    }
  }
  // Index finger reaching forward to the trigger
  g.add(box(0.028, 0.026, 0.085, glove, -0.03, 0.046, -0.07));
  g.add(box(0.03, 0.018, 0.026, pad, -0.03, 0.06, -0.096));
  // Thumb along the near flank, above the fingers
  g.add(box(0.03, 0.03, 0.075, glove, -0.042, 0.05, 0.01));
  // Wrist and forearm heading off-screen
  g.add(box(0.076, 0.082, 0.05, dark, 0.04, 0.028, 0.075));
  const wrist = new THREE.Group();
  wrist.position.set(0.048, 0.028, 0.088);
  wrist.add(forearm(armPitch, armYaw, armLength));
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

    // Upper receiver
    g.add(box(0.07, 0.07, 0.3, t.rail, 0, 0.04, -0.05));
    // Lower receiver
    g.add(box(0.068, 0.06, 0.26, t.body, 0, -0.02, -0.03));
    // Handguard (tan)
    g.add(box(0.072, 0.075, 0.24, t.tan, 0, 0.015, -0.32));
    g.add(box(0.05, 0.018, 0.22, t.rail, 0, 0.06, -0.32));
    // Barrel
    g.add(cyl(0.013, 0.28, t.barrel, 0, 0.02, -0.56));
    g.add(cyl(0.02, 0.05, t.steel, 0, 0.02, -0.72));
    // Mag (curved look via two offset boxes)
    g.add(box(0.045, 0.14, 0.08, t.mag, 0, -0.12, -0.06));
    g.add(box(0.045, 0.1, 0.075, t.mag, 0, -0.2, -0.03));
    g.add(box(0.048, 0.02, 0.08, t.glow, 0, -0.26, -0.02));
    // Grip
    g.add(grip(t.body, t.rail, 0, -0.04, 0.1, 0.4));
    // Stock tube + pad
    g.add(cyl(0.018, 0.16, t.steel, 0, 0.01, 0.2));
    g.add(box(0.05, 0.06, 0.14, t.tan, 0, 0.0, 0.3));
    g.add(box(0.065, 0.12, 0.035, t.body, 0, -0.01, 0.38));
    // Holo / red-dot on top rail
    redDotOptic(g, t.rail, glass, reticle, 0, 0.095, -0.02);
    // Backup front sight (folded look)
    g.add(box(0.014, 0.028, 0.012, t.steel, 0, 0.08, -0.48));

    g.add(triggerHand({ x: 0, y: -0.105, z: 0.075 }));
    g.add(supportHand({ x: 0, y: -0.0225, z: -0.32, rise: 0.052 }));

    addMuzzle(g, 0, 0.02, -0.76, 1.0);
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
    g.add(box(0.065, 0.06, 0.28, t.rail, 0, 0.03, -0.06));
    g.add(box(0.068, 0.065, 0.18, t.tan, 0, 0.01, -0.28));
    g.add(cyl(0.012, 0.2, t.barrel, 0, 0.015, -0.48));
    g.add(box(0.04, 0.12, 0.07, t.mag, 0, -0.1, -0.04));
    g.add(grip(t.body, t.rail, 0, -0.03, 0.1, 0.38));
    g.add(box(0.05, 0.05, 0.12, t.tan, 0, 0.0, 0.22));
    redDotOptic(g, t.rail, glass, reticle, 0, 0.08, -0.04);
    g.userData.length = 1.0;
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
};

// The viewmodel uses its own narrow FOV so the weapon reads large without
// sitting so close to the camera that the stock pokes into frame.
const VIEWMODEL_FOV = 54;
const HOME = new THREE.Vector3(0.43, -0.18, -0.8);
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
    this.hidden = false;
  }

  setWeapon(id) {
    if (this.weaponId === id) return;
    this.clear();
    const build = BUILDERS[id] || BUILDERS.pistol;
    this.weapon = build();
    // Yawed and canted like a real FPS viewmodel: the buttstock swings off the
    // right edge instead of into frame, and the cant tips the top of the weapon
    // toward the player so the support hand stays visible.
    this.weapon.rotation.set(0, 0.2, 0.1);
    this.weaponId = id;
    this.holder.add(this.weapon);
  }

  clear() {
    if (!this.weapon) return;
    this.holder.remove(this.weapon);
    this.weapon.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) m.dispose();
      }
    });
    this.weapon = null;
    this.weaponId = null;
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

  look(dYaw, dPitch) {
    this.swayTarget.set(
      THREE.MathUtils.clamp(dYaw * 6, -0.09, 0.09),
      THREE.MathUtils.clamp(dPitch * 6, -0.07, 0.07),
    );
  }

  update(dt, { moving, onGround, crouching, sliding, zooming, reloading, reloadProgress }) {
    if (!this.weapon) return;

    this.hidden = Boolean(zooming);
    this.weapon.visible = !this.hidden;

    this.recoil *= Math.exp(-dt * 11);
    this.sway.lerp(this.swayTarget, Math.min(1, dt * 12));
    this.swayTarget.multiplyScalar(Math.exp(-dt * 7));

    if (moving && onGround && !sliding) this.bobTime += dt * 9.5;
    else this.bobTime += dt * 1.6;

    const bobX = sliding ? 0 : Math.cos(this.bobTime) * (moving && onGround ? 0.014 : 0.003);
    const bobY = sliding ? 0 : Math.abs(Math.sin(this.bobTime)) * (moving && onGround ? 0.012 : 0.002);

    const home = zooming ? SCOPED : HOME;
    const crouchDrop = crouching ? 0.06 : 0;
    const slideDrop = sliding ? 0.1 : 0;

    this.reloadPhase = reloading ? Math.min(1, this.reloadPhase + dt * 4) : Math.max(0, this.reloadPhase - dt * 5);
    const reloadDip = Math.sin(Math.PI * Math.min(1, reloadProgress || 0)) * this.reloadPhase;

    this.holder.position.set(
      home.x + this.sway.x + bobX,
      home.y + this.sway.y + bobY - reloadDip * 0.14 - crouchDrop - slideDrop,
      home.z + this.recoil * 0.075,
    );

    this.holder.rotation.set(
      this.recoil * 0.24 + reloadDip * 0.5 + (sliding ? 0.25 : 0),
      -this.sway.x * 1.6,
      this.sway.y * 0.9 + reloadDip * 0.3,
    );
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
