import { MAX_PITCH } from '/shared/constants.js';

const KEY = {
  FORWARD: 1,
  BACK: 2,
  LEFT: 4,
  RIGHT: 8,
  JUMP: 16,
  SHOOT: 32,
  RELOAD: 64,
  ZOOM: 128,
  CROUCH: 256,
  RUN: 512,
};

const SENSITIVITY = 0.0022;

export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.yaw = 0;
    this.pitch = 0;
    this.locked = false;
    this.enabled = false;
    this.zoomFactor = 1;

    this.keys = new Set();
    this.shoot = false;
    this.zoom = false;
    this.reloadPressed = false;
    this.slotPrimaryPressed = false;
    this.slotSecondaryPressed = false;
    this.kickYaw = 0;
    this.kickPitch = 0;

    this.onLockChange = null;

    this.bind();
  }

  bind() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.keys.clear();
        this.shoot = false;
        this.zoom = false;
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Scoping narrows the field of view, so scale look speed to match or
      // aiming feels twitchy at high zoom.
      const scale = SENSITIVITY / this.zoomFactor;
      this.yaw -= e.movementX * scale;
      this.pitch -= e.movementY * scale;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.shoot = true;
      if (e.button === 2) this.zoom = true;
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.shoot = false;
      if (e.button === 2) this.zoom = false;
    });

    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });

    document.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      if (e.code === 'KeyR') this.reloadPressed = true;
      if (e.code === 'Digit1') this.slotPrimaryPressed = true;
      if (e.code === 'Digit2') this.slotSecondaryPressed = true;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.shoot = false;
      this.zoom = false;
    });
  }

  requestLock() {
    if (this.locked) return;
    const result = this.canvas.requestPointerLock();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  }

  addKick(yawAmount, pitchAmount) {
    this.kickYaw += yawAmount;
    this.kickPitch += pitchAmount;
  }

  decayKick(dt) {
    const decay = Math.exp(-dt * 9);
    // Feed part of the kick back into real aim so recoil actually moves the
    // shot, then let the rest spring back.
    this.yaw += this.kickYaw * (1 - decay) * 0.35;
    this.pitch += this.kickPitch * (1 - decay) * 0.35;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    this.kickYaw *= decay;
    this.kickPitch *= decay;
  }

  /** Current aim including the transient recoil offset. */
  viewAngles() {
    return {
      yaw: this.yaw + this.kickYaw,
      pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + this.kickPitch)),
    };
  }

  sample() {
    let mask = 0;
    if (!this.enabled) return { mask: 0, yaw: this.yaw, pitch: this.pitch };

    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) mask |= KEY.FORWARD;
    if (k.has('KeyS') || k.has('ArrowDown')) mask |= KEY.BACK;
    if (k.has('KeyA') || k.has('ArrowLeft')) mask |= KEY.LEFT;
    if (k.has('KeyD') || k.has('ArrowRight')) mask |= KEY.RIGHT;
    if (k.has('Space')) mask |= KEY.JUMP;
    if (k.has('KeyC') || k.has('ControlLeft') || k.has('ControlRight')) mask |= KEY.CROUCH;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) mask |= KEY.RUN;
    if (this.shoot) mask |= KEY.SHOOT;
    if (this.zoom) mask |= KEY.ZOOM;
    if (this.reloadPressed) {
      mask |= KEY.RELOAD;
      this.reloadPressed = false;
    }

    let switchSlot = 0;
    if (this.slotPrimaryPressed) {
      switchSlot = 1;
      this.slotPrimaryPressed = false;
    }
    if (this.slotSecondaryPressed) {
      switchSlot = 2;
      this.slotSecondaryPressed = false;
    }

    const view = this.viewAngles();
    return { mask, yaw: view.yaw, pitch: view.pitch, switchSlot };
  }

  static decode(mask) {
    return {
      forward: (mask & KEY.FORWARD) !== 0,
      back: (mask & KEY.BACK) !== 0,
      left: (mask & KEY.LEFT) !== 0,
      right: (mask & KEY.RIGHT) !== 0,
      jump: (mask & KEY.JUMP) !== 0,
      shoot: (mask & KEY.SHOOT) !== 0,
      reload: (mask & KEY.RELOAD) !== 0,
      zoom: (mask & KEY.ZOOM) !== 0,
      crouch: (mask & KEY.CROUCH) !== 0,
      run: (mask & KEY.RUN) !== 0,
    };
  }
}

export { KEY };
