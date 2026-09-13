import {
  CELL,
  PLAYER_RADIUS,
  MOVE_SPEED,
  ACCEL,
  AIR_ACCEL,
  FRICTION,
  GRAVITY,
  JUMP_SPEED,
  STEP_UP,
  CROUCH_SPEED_MULT,
  RUN_SPEED_MULT,
  SLIDE_MIN_SPEED,
  SLIDE_BOOST,
  SLIDE_MAX_SPEED,
  SLIDE_FRICTION,
  SLIDE_END_SPEED,
  SLIDE_MAX_TIME,
  SLIDE_STEER_MULT,
} from './constants.js';
import { tileAt, tileHeight, gridSize } from './arena.js';

// How fast over-cap horizontal speed (an airhorn shove) bleeds back down to
// run speed, in m/s². 15 m/s decays to ~7 m/s in roughly 0.8 s of flight.
const KNOCKBACK_DECAY = 10;

// Arenas come in different sizes, so the world half-extent is a property of
// the grid rather than a global constant.
const halfWorld = (grid) => (gridSize(grid) * CELL) / 2;

const cellIndex = (w, half) => Math.floor((w + half) / CELL);

function collides(grid, x, y, z) {
  const half = halfWorld(grid);
  const c0 = cellIndex(x - PLAYER_RADIUS, half);
  const c1 = cellIndex(x + PLAYER_RADIUS, half);
  const r0 = cellIndex(z - PLAYER_RADIUS, half);
  const r1 = cellIndex(z + PLAYER_RADIUS, half);
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      if (tileHeight(tileAt(grid, c, r)) > y + STEP_UP) return true;
    }
  }
  return false;
}

function groundHeight(grid, x, y, z) {
  const half = halfWorld(grid);
  const c0 = cellIndex(x - PLAYER_RADIUS, half);
  const c1 = cellIndex(x + PLAYER_RADIUS, half);
  const r0 = cellIndex(z - PLAYER_RADIUS, half);
  const r1 = cellIndex(z + PLAYER_RADIUS, half);
  let ground = 0;
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      const h = tileHeight(tileAt(grid, c, r));
      if (h <= y + STEP_UP && h > ground) ground = h;
    }
  }
  return ground;
}

function wishDirection(input) {
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);

  let wishX = 0;
  let wishZ = 0;
  if (input.forward) {
    wishX -= sin;
    wishZ -= cos;
  }
  if (input.back) {
    wishX += sin;
    wishZ += cos;
  }
  if (input.left) {
    wishX -= cos;
    wishZ += sin;
  }
  if (input.right) {
    wishX += cos;
    wishZ -= sin;
  }

  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 0) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }
  return { wishX, wishZ, wishLen };
}

function applyFriction(p, dt, friction) {
  const speed = Math.hypot(p.vx, p.vz);
  if (speed <= 0) return;
  const drop = Math.min(speed, friction * dt * Math.max(speed, 1));
  const scale = Math.max(0, speed - drop) / speed;
  p.vx *= scale;
  p.vz *= scale;
}

function accelerate(p, wishX, wishZ, maxSpeed, accel, dt) {
  const current = p.vx * wishX + p.vz * wishZ;
  const add = Math.min(maxSpeed - current, accel * dt * maxSpeed);
  if (add > 0) {
    p.vx += wishX * add;
    p.vz += wishZ * add;
  }
}

function clampHorizontalSpeed(p, maxSpeed) {
  const horiz = Math.hypot(p.vx, p.vz);
  if (horiz > maxSpeed) {
    p.vx = (p.vx / horiz) * maxSpeed;
    p.vz = (p.vz / horiz) * maxSpeed;
  }
}

function tryStartSlide(p, input, crouchEdge, speedMult) {
  const speed = Math.hypot(p.vx, p.vz);
  if (!p.onGround || !crouchEdge || p.sliding || speed < SLIDE_MIN_SPEED) return;

  const sprinting = Boolean(input.run) || speed >= MOVE_SPEED * RUN_SPEED_MULT * 0.82;
  if (!sprinting) return;

  p.sliding = true;
  p.slideTime = 0;
  p.crouching = true;

  const cap = SLIDE_MAX_SPEED * speedMult;
  if (speed > 0.01 && speed < cap) {
    const scale = Math.min(cap / speed, SLIDE_BOOST);
    p.vx *= scale;
    p.vz *= scale;
  }
}

/**
 * Advances one player by a fixed timestep. Mutates `p` in place.
 * Runs on the server as the authority and on the client as the predictor.
 */
export function stepPlayer(grid, p, input, dt, speedMult = 1) {
  const crouchPressed = Boolean(input.crouch);
  const crouchEdge = crouchPressed && !p.prevCrouch;
  p.prevCrouch = crouchPressed;

  tryStartSlide(p, input, crouchEdge, speedMult);

  const { wishX, wishZ, wishLen } = wishDirection(input);

  if (p.sliding) {
    p.crouching = true;
    p.slideTime += dt;

    if (wishLen > 0) {
      accelerate(p, wishX, wishZ, SLIDE_MAX_SPEED * speedMult, ACCEL * SLIDE_STEER_MULT, dt);
    }

    applyFriction(p, dt, SLIDE_FRICTION);
    clampHorizontalSpeed(p, SLIDE_MAX_SPEED * speedMult);

    const slideSpeed = Math.hypot(p.vx, p.vz);
    if (
      !p.onGround ||
      !crouchPressed ||
      p.slideTime >= SLIDE_MAX_TIME ||
      slideSpeed < SLIDE_END_SPEED
    ) {
      p.sliding = false;
    }
  } else {
    if (p.onGround) {
      p.crouching = crouchPressed;
    } else {
      p.crouching = false;
    }

    let moveMult = speedMult;
    if (p.onGround && input.run && !p.crouching && wishLen > 0) {
      moveMult *= RUN_SPEED_MULT;
    }
    if (p.crouching) moveMult *= CROUCH_SPEED_MULT;

    const maxSpeed = MOVE_SPEED * moveMult;
    const accel = p.onGround ? ACCEL : AIR_ACCEL;

    // Speed measured BEFORE this tick's acceleration. Only externally-set
    // velocity (airhorn shoves, banana slips) may sit above the cap, and that
    // excess bleeds off at KNOCKBACK_DECAY instead of being clamped away in
    // one tick. Player input can never raise speed past the cap: accelerate()
    // works off the wish-direction projection, so whenever velocity points
    // elsewhere (turning hard, or a wall/box zeroing one axis) it overshoots
    // the cap — uncapped, that compounds into skating along walls at way past
    // sprint speed. Stateless (velocity only), so client prediction replays
    // it identically after adopting the server's velocity.
    const preSpeed = Math.hypot(p.vx, p.vz);

    if (p.onGround && wishLen === 0) {
      applyFriction(p, dt, FRICTION);
    } else if (wishLen > 0) {
      accelerate(p, wishX, wishZ, maxSpeed, accel, dt);
    }

    clampHorizontalSpeed(p, Math.max(maxSpeed, preSpeed - KNOCKBACK_DECAY * dt));
  }

  if (input.jump && p.onGround && !p.crouching && !p.sliding) {
    p.vy = JUMP_SPEED;
    p.onGround = false;
  }

  p.vy -= GRAVITY * dt;

  const nx = p.x + p.vx * dt;
  if (!collides(grid, nx, p.y, p.z)) {
    p.x = nx;
  } else {
    p.vx = 0;
    if (p.sliding) p.sliding = false;
  }

  const nz = p.z + p.vz * dt;
  if (!collides(grid, p.x, p.y, nz)) {
    p.z = nz;
  } else {
    p.vz = 0;
    if (p.sliding) p.sliding = false;
  }

  let ny = p.y + p.vy * dt;
  const ground = groundHeight(grid, p.x, p.y, p.z);
  if (ny <= ground) {
    ny = ground;
    p.vy = 0;
    p.onGround = true;
  } else {
    p.onGround = false;
    if (p.sliding) p.sliding = false;
  }
  p.y = ny;

  return p;
}

export function raycastWorld(grid, ox, oy, oz, dx, dy, dz, maxDist) {
  const size = gridSize(grid);
  const half = halfWorld(grid);
  let c = cellIndex(ox, half);
  let r = cellIndex(oz, half);

  const stepC = dx > 0 ? 1 : -1;
  const stepR = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(CELL / dz) : Infinity;

  const cellMinX = c * CELL - half;
  const cellMinZ = r * CELL - half;
  let tMaxX =
    dx !== 0 ? (dx > 0 ? cellMinX + CELL - ox : ox - cellMinX) / Math.abs(dx) : Infinity;
  let tMaxZ =
    dz !== 0 ? (dz > 0 ? cellMinZ + CELL - oz : oz - cellMinZ) / Math.abs(dz) : Infinity;

  const tFloor = dy < 0 ? -oy / dy : Infinity;
  let t = 0;

  for (let guard = 0; guard < 1024; guard++) {
    if (c < 0 || r < 0 || c >= size || r >= size) break;

    const tExit = Math.min(tMaxX, tMaxZ);
    const h = tileHeight(tileAt(grid, c, r));

    if (h > 0) {
      const yIn = oy + dy * t;
      if (yIn < h) {
        return { hit: true, dist: t, surface: 'wall' };
      }
      if (dy < 0) {
        // Descending onto the column's top face. The hit must lie within this
        // ray's reach — without the maxDist bound, a lobbed projectile inside
        // a tall cell's airspace "hits" the top from any height above it and
        // reports a distance far beyond the actual step.
        const tTop = (h - oy) / dy;
        if (tTop >= t && tTop <= tExit && tTop <= maxDist) {
          return { hit: true, dist: tTop, surface: 'wall' };
        }
      }
    }

    if (tFloor >= t && tFloor <= tExit && tFloor <= maxDist) {
      return { hit: true, dist: tFloor, surface: 'floor' };
    }

    if (tExit > maxDist) break;

    if (tMaxX < tMaxZ) {
      t = tMaxX;
      tMaxX += tDeltaX;
      c += stepC;
    } else {
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      r += stepR;
    }
  }

  return { hit: false, dist: maxDist, surface: null };
}

export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius, height) {
  const px = ox - cx;
  const pz = oz - cz;

  const a = dx * dx + dz * dz;
  let best = Infinity;

  if (a > 1e-9) {
    const b = 2 * (px * dx + pz * dz);
    const cc = px * px + pz * pz - radius * radius;
    const disc = b * b - 4 * a * cc;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
        if (t < 0) continue;
        const y = oy + dy * t;
        if (y >= cy && y <= cy + height && t < best) best = t;
      }
    }
  }

  if (Math.abs(dy) > 1e-9) {
    for (const planeY of [cy, cy + height]) {
      const t = (planeY - oy) / dy;
      if (t < 0 || t >= best) continue;
      const hx = px + dx * t;
      const hz = pz + dz * t;
      if (hx * hx + hz * hz <= radius * radius) best = t;
    }
  }

  return best === Infinity ? null : best;
}
