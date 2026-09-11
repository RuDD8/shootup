import * as THREE from '/vendor/three.module.js';
import { mountArrow, mountPoopModel, mountFahhText } from './model-assets.js';

// Every visual is drawn from a fixed pool. Nothing is allocated during a
// firefight, so there are no GC hitches mid-duel.

const TRACER_COUNT = 40;
const SPARK_COUNT = 220;
const FLASH_COUNT = 12;
const PROJECTILE_COUNT = 8;
const HAZARD_COUNT = 12;

const TRACER_LIFE = 0.075;
const FLASH_LIFE = 0.06;

const SPARK_COLORS = {
  wall: 0xffd9a0,
  floor: 0xffc98a,
  player: 0xff4d63,
  air: 0x9fc4ef,
  pee: 0xe9c93b,
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    const tracerGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.tracerGeometry = tracerGeometry;
    this.tracers = [];
    for (let i = 0; i < TRACER_COUNT; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xfff0c4,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(tracerGeometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.tracers.push({ mesh, material, life: 0 });
    }
    this.tracerCursor = 0;

    const sparkGeometry = new THREE.SphereGeometry(0.035, 6, 5);
    this.sparkGeometry = sparkGeometry;
    this.sparks = [];
    for (let i = 0; i < SPARK_COUNT; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(sparkGeometry, material);
      mesh.visible = false;
      scene.add(mesh);
      this.sparks.push({
        mesh,
        material,
        life: 0,
        maxLife: 1,
        vel: new THREE.Vector3(),
      });
    }
    this.sparkCursor = 0;

    const flashGeometry = new THREE.SphereGeometry(0.16, 8, 6);
    this.flashGeometry = flashGeometry;
    this.flashes = [];
    for (let i = 0; i < FLASH_COUNT; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffe6a8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(flashGeometry, material);
      mesh.visible = false;
      scene.add(mesh);
      this.flashes.push({ mesh, material, life: 0 });
    }
    this.flashCursor = 0;

    // One shared light stands in for muzzle illumination; cheaper than a light
    // per shot and visually indistinguishable at these speeds.
    this.flashLight = new THREE.PointLight(0xffd28a, 0, 9, 2);
    scene.add(this.flashLight);
    this.flashLightLife = 0;

    this.projectilePool = [];
    for (let i = 0; i < PROJECTILE_COUNT; i++) {
      const group = new THREE.Group();

      // Poop visual (default projectile kind).
      const poopHost = new THREE.Group();
      const fallback = new THREE.Group();

      const bodyGeo = new THREE.SphereGeometry(0.22, 8, 6);
      bodyGeo.scale(1, 0.75, 1);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x5a3210,
        roughness: 0.9,
        metalness: 0,
        transparent: true,
        opacity: 0,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      fallback.add(body);

      const lump1Geo = new THREE.SphereGeometry(0.11, 6, 5);
      const lump1 = new THREE.Mesh(lump1Geo, bodyMat);
      lump1.position.set(0.1, 0.08, 0.05);
      fallback.add(lump1);

      const lump2Geo = new THREE.SphereGeometry(0.09, 6, 5);
      const lump2 = new THREE.Mesh(lump2Geo, bodyMat);
      lump2.position.set(-0.07, 0.06, -0.08);
      fallback.add(lump2);

      poopHost.add(fallback);
      mountPoopModel(poopHost, { targetLength: 0.34, castShadow: true }).then((mounted) => {
        if (mounted) fallback.visible = false;
      });
      group.add(poopHost);

      // Flying "FAHH" text for the fahgun rocket.
      const fahhHost = new THREE.Group();
      const fahhFallbackMat = new THREE.MeshStandardMaterial({
        color: 0xffb020,
        emissive: 0xff5a1f,
        emissiveIntensity: 1.4,
        roughness: 0.4,
      });
      const fahhFallback = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 0.1), fahhFallbackMat);
      fahhHost.add(fahhFallback);
      mountFahhText(fahhHost, { targetLength: 0.42, castShadow: true }).then((mounted) => {
        if (mounted) fahhFallback.visible = false;
      });
      fahhHost.visible = false;
      group.add(fahhHost);

      // Flying arrow for the bow; it points along its velocity in update().
      const arrowHost = new THREE.Group();
      const arrowFallback = new THREE.Group();
      const shaftMat = new THREE.MeshStandardMaterial({ color: 0x8c6b38, roughness: 0.6 });
      const headMat = new THREE.MeshStandardMaterial({
        color: 0x80888f, roughness: 0.25, metalness: 0.8,
      });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.66, 6), shaftMat);
      shaft.rotation.x = Math.PI / 2;
      arrowFallback.add(shaft);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.06), headMat);
      tip.position.z = -0.33;
      arrowFallback.add(tip);
      arrowHost.add(arrowFallback);
      mountArrow(arrowHost, { targetLength: 0.7, castShadow: true }).then((mounted) => {
        if (mounted) arrowFallback.visible = false;
      });
      arrowHost.visible = false;
      group.add(arrowHost);

      group.visible = false;
      scene.add(group);
      this.projectilePool.push({
        mesh: group, mat: bodyMat, poopHost, fahhHost, arrowHost,
        id: null, kind: 'poopgun', gravity: 15,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        active: false, spin: Math.random() * Math.PI * 2,
      });
    }
    this.projCursor = 0;

    this.hazardPool = [];
    for (let i = 0; i < HAZARD_COUNT; i++) {
      const group = new THREE.Group();

      const baseGeo = new THREE.CircleGeometry(1, 24);
      const baseMat = new THREE.MeshBasicMaterial({
        color: 0x4a2a08,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.rotation.x = -Math.PI / 2;
      group.add(base);

      for (let j = 0; j < 5; j++) {
        const splatGeo = new THREE.CircleGeometry(0.25 + Math.random() * 0.2, 8);
        const splatMat = new THREE.MeshBasicMaterial({
          color: 0x3d2006,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const splat = new THREE.Mesh(splatGeo, splatMat);
        splat.rotation.x = -Math.PI / 2;
        const angle = (j / 5) * Math.PI * 2 + Math.random() * 0.6;
        const dist = 0.7 + Math.random() * 0.4;
        splat.position.set(Math.cos(angle) * dist, 0.005, Math.sin(angle) * dist);
        group.add(splat);
      }

      group.visible = false;
      scene.add(group);
      this.hazardPool.push({ mesh: group, baseMat, life: 0, maxLife: 5 });
    }
    this.hazardCursor = 0;
  }

  tracer(from, to, width = 0.022) {
    const slot = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % TRACER_COUNT;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 0.05) return;

    slot.mesh.visible = true;
    slot.mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    slot.mesh.lookAt(to.x, to.y, to.z);
    slot.mesh.scale.set(width, width, length);
    slot.material.opacity = 0.9;
    slot.life = TRACER_LIFE;
  }

  spark(x, y, z, kind = 'wall', count = 5, power = 3.2) {
    const color = SPARK_COLORS[kind] ?? SPARK_COLORS.wall;
    for (let i = 0; i < count; i++) {
      const slot = this.sparks[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % SPARK_COUNT;

      slot.mesh.visible = true;
      slot.mesh.position.set(x, y, z);
      slot.mesh.scale.setScalar(0.6 + Math.random() * 0.9);
      slot.material.color.setHex(color);
      // Additive sparks wash out to white on bright floors; liquid splashes
      // need their actual color to read.
      slot.material.blending = kind === 'pee' ? THREE.NormalBlending : THREE.AdditiveBlending;
      slot.material.opacity = 1;
      slot.vel.set(
        (Math.random() - 0.5) * power,
        Math.random() * power * 0.75,
        (Math.random() - 0.5) * power,
      );
      slot.maxLife = 0.22 + Math.random() * 0.24;
      slot.life = slot.maxLife;
    }
  }

  // Directed droplets for the pee stream: unlike spark(), these launch along
  // a given direction so gravity bends them into a proper arc.
  droplets(x, y, z, dx, dy, dz, count = 3, speed = 8.5) {
    for (let i = 0; i < count; i++) {
      const slot = this.sparks[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % SPARK_COUNT;

      slot.mesh.visible = true;
      slot.mesh.position.set(x, y, z);
      slot.mesh.scale.setScalar(0.45 + Math.random() * 0.45);
      slot.material.color.setHex(SPARK_COLORS.pee);
      slot.material.blending = THREE.NormalBlending;
      slot.material.opacity = 0.9;
      const jitter = 0.9;
      slot.vel.set(
        dx * speed + (Math.random() - 0.5) * jitter,
        dy * speed + (Math.random() - 0.5) * jitter,
        dz * speed + (Math.random() - 0.5) * jitter,
      );
      slot.maxLife = 0.5 + Math.random() * 0.25;
      slot.life = slot.maxLife;
    }
  }

  flash(x, y, z, scale = 1) {
    const slot = this.flashes[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % FLASH_COUNT;
    slot.mesh.visible = true;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(scale);
    slot.material.opacity = 1;
    slot.life = FLASH_LIFE;

    this.flashLight.position.set(x, y, z);
    this.flashLight.intensity = 14 * scale;
    this.flashLightLife = FLASH_LIFE;
  }

  spawnProjectile(id, x, y, z, vx, vy, vz, kind = 'poopgun') {
    const slot = this.projectilePool[this.projCursor];
    this.projCursor = (this.projCursor + 1) % PROJECTILE_COUNT;
    slot.id = id;
    slot.kind = kind;
    slot.gravity = kind === 'fahgun' ? 4 : kind === 'bow' ? 9 : 15;
    slot.poopHost.visible = kind !== 'fahgun' && kind !== 'bow';
    slot.fahhHost.visible = kind === 'fahgun';
    slot.arrowHost.visible = kind === 'bow';
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.active = true;
    slot.spin = Math.random() * Math.PI * 2;
    slot.mesh.visible = true;
    slot.mat.opacity = 1;
    slot.mesh.position.set(x, y, z);
  }

  getProjectilePosition(id) {
    for (const slot of this.projectilePool) {
      if (slot.active && slot.id === id) return { x: slot.x, y: slot.y, z: slot.z };
    }
    return null;
  }

  removeProjectile(id) {
    for (const slot of this.projectilePool) {
      if (slot.id === id) {
        slot.active = false;
        slot.mesh.visible = false;
        slot.mat.opacity = 0;
        slot.id = null;
        break;
      }
    }
  }

  spawnHazard(x, y, z, radius, duration) {
    const slot = this.hazardPool[this.hazardCursor];
    this.hazardCursor = (this.hazardCursor + 1) % HAZARD_COUNT;
    slot.mesh.visible = true;
    slot.mesh.position.set(x, y + 0.02, z);
    slot.mesh.scale.setScalar(radius);
    slot.baseMat.opacity = 0.7;
    slot.mesh.traverse((child) => {
      if (child.isMesh && child.material !== slot.baseMat) {
        child.material.opacity = 0.8;
      }
    });
    slot.life = duration;
    slot.maxLife = duration;
  }

  // A rocket-style detonation: oversized flash plus a dense spark burst.
  explosion(x, y, z, radius = 4) {
    this.flash(x, y, z, 3.2);
    this.spark(x, y, z, 'wall', 42, radius);
  }

  update(dt, camera = null) {
    this.time += dt;

    for (const slot of this.tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.mesh.visible = false;
        slot.material.opacity = 0;
      } else {
        slot.material.opacity = 0.9 * (slot.life / TRACER_LIFE);
      }
    }

    for (const slot of this.sparks) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.mesh.visible = false;
        slot.material.opacity = 0;
        continue;
      }
      slot.vel.y -= 11 * dt;
      slot.mesh.position.addScaledVector(slot.vel, dt);
      if (slot.mesh.position.y < 0.02) {
        slot.mesh.position.y = 0.02;
        slot.vel.y = Math.abs(slot.vel.y) * 0.28;
        slot.vel.x *= 0.6;
        slot.vel.z *= 0.6;
      }
      slot.material.opacity = slot.life / slot.maxLife;
    }

    for (const slot of this.flashes) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.mesh.visible = false;
        slot.material.opacity = 0;
      } else {
        const t = slot.life / FLASH_LIFE;
        slot.material.opacity = t;
        slot.mesh.scale.multiplyScalar(1 + dt * 6);
      }
    }

    if (this.flashLightLife > 0) {
      this.flashLightLife -= dt;
      this.flashLight.intensity *= Math.max(0, this.flashLightLife / FLASH_LIFE);
      if (this.flashLightLife <= 0) this.flashLight.intensity = 0;
    }

    for (const slot of this.projectilePool) {
      if (!slot.active) continue;
      slot.vy -= slot.gravity * dt;
      slot.x += slot.vx * dt;
      slot.y += slot.vy * dt;
      slot.z += slot.vz * dt;
      slot.spin += dt * 8;
      slot.mesh.position.set(slot.x, slot.y, slot.z);
      if (slot.kind === 'fahgun' && camera) {
        // Billboard the text toward the viewer, with a frantic little wobble.
        const yaw = Math.atan2(camera.position.x - slot.x, camera.position.z - slot.z);
        slot.mesh.rotation.set(0, yaw, Math.sin(this.time * 11 + slot.spin) * 0.14);
      } else if (slot.kind === 'bow') {
        // Arrows fly tip-first along their velocity instead of tumbling.
        // lookAt aims the group's +Z, and the arrow's tip points to -Z.
        slot.mesh.lookAt(slot.x - slot.vx, slot.y - slot.vy, slot.z - slot.vz);
      } else {
        slot.mesh.rotation.set(slot.spin, slot.spin * 0.7, 0);
      }
      if (slot.y < -5) {
        slot.active = false;
        slot.mesh.visible = false;
        slot.mat.opacity = 0;
      }
    }

    for (const slot of this.hazardPool) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.mesh.visible = false;
        slot.baseMat.opacity = 0;
        slot.mesh.traverse((child) => {
          if (child.isMesh) child.material.opacity = 0;
        });
      } else {
        const fade = Math.min(1, slot.life / slot.maxLife * 2.5);
        slot.baseMat.opacity = 0.7 * fade;
        slot.mesh.traverse((child) => {
          if (child.isMesh && child.material !== slot.baseMat) {
            child.material.opacity = 0.8 * fade;
          }
        });
      }
    }
  }

  reset() {
    for (const slot of [...this.tracers, ...this.sparks, ...this.flashes]) {
      slot.life = 0;
      slot.mesh.visible = false;
      slot.material.opacity = 0;
    }
    this.flashLight.intensity = 0;
    this.flashLightLife = 0;
    for (const slot of this.projectilePool) {
      slot.active = false;
      slot.mesh.visible = false;
      slot.mat.opacity = 0;
      slot.id = null;
    }
    for (const slot of this.hazardPool) {
      slot.life = 0;
      slot.mesh.visible = false;
      slot.baseMat.opacity = 0;
      slot.mesh.traverse((child) => {
        if (child.isMesh) child.material.opacity = 0;
      });
    }
  }
}
