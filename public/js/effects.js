import * as THREE from '/vendor/three.module.js';

// Every visual is drawn from a fixed pool. Nothing is allocated during a
// firefight, so there are no GC hitches mid-duel.

const TRACER_COUNT = 40;
const SPARK_COUNT = 220;
const FLASH_COUNT = 12;

const TRACER_LIFE = 0.075;
const FLASH_LIFE = 0.06;

const SPARK_COLORS = {
  wall: 0xffd9a0,
  floor: 0xffc98a,
  player: 0xff4d63,
  air: 0x9fc4ef,
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

  update(dt) {
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
  }

  reset() {
    for (const slot of [...this.tracers, ...this.sparks, ...this.flashes]) {
      slot.life = 0;
      slot.mesh.visible = false;
      slot.material.opacity = 0;
    }
    this.flashLight.intensity = 0;
    this.flashLightLife = 0;
  }
}
