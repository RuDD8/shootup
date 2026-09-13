import {
  CELL,
  TILE_WALL,
  TILE_COVER,
  TILE_LOW,
  TILE_HIGH,
  TILE_DECK,
} from '/shared/constants.js';

const $ = (id) => document.getElementById(id);

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Height-graded greys so the layout reads instantly on every theme: the
// brighter the blip, the taller the column.
const MINIMAP_TILE_COLORS = {
  [TILE_WALL]: 'rgba(215, 228, 245, 0.92)',
  [TILE_COVER]: 'rgba(130, 150, 175, 0.5)',
  [TILE_LOW]: 'rgba(105, 125, 150, 0.34)',
  [TILE_HIGH]: 'rgba(165, 185, 212, 0.62)',
  [TILE_DECK]: 'rgba(232, 238, 250, 0.78)',
};

const SKULL_ICON =
  '<svg class="feed-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" ' +
  'd="M12 2a8 8 0 0 0-8 8v3.1a2 2 0 0 0 1.1 1.8l1.3.65.35 1.95A2 2 0 0 0 8.72 19h6.56a2 2 0 0 0 ' +
  '1.97-1.6l.35-1.95 1.3-.65A2 2 0 0 0 20 13.1V10a8 8 0 0 0-8-8Zm-3.3 8.1a1.9 1.9 0 1 1 0 3.8 1.9 ' +
  '1.9 0 0 1 0-3.8Zm6.6 0a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8ZM10.5 15.6h3l-.5 1.9h-2l-.5-1.9Z"/></svg>';

export class Hud {
  constructor() {
    this.root = $('hud');
    this.crosshairParts = Array.from(document.querySelectorAll('.ch'));
    this.hitmarkerEl = $('hitmarker');
    this.bannerEl = $('banner');
    this.feedEl = $('killfeed');
    this.vignette = $('damage-vignette');
    this.scope = $('scope-overlay');
    this.scoreboard = $('scoreboard');
    this.clock = $('match-clock');
    this.dmBoard = $('dm-leaderboard');
    this.dmList = $('dm-lb-list');
    this.netInfo = $('net-info');
    this.healthWrap = $('health-wrap');
    this.ammoEl = $('ammo');
    this.reloadFill = $('reload-fill');
    this.spawnShield = $('spawn-shield');
    this.minimap = $('minimap');
    this.minimapCtx = this.minimap.getContext('2d');
    this.minimapLayoutCanvas = null;
    this.minimapWorldHalf = 32;
    this.minimapPings = [];
    this.dmgWrap = $('dmg-dirs');
    this.dmgDirs = [];

    this.hitmarkerTimer = 0;
    this.vignetteTimer = 0;
    this.bannerTimer = 0;
    this.lastGap = -1;
    this.mode = 'duel';

    // Smoothed frame rate so the readout does not flicker every frame.
    this.fps = 60;
    this.fpsTimer = 0;

    // Current render-resolution scale; a badge appears next to the FPS
    // counter whenever the game is rendering below native resolution.
    this.renderScale = 1;
  }

  setRenderScale(scale) {
    this.renderScale = scale;
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
    this.bannerEl.classList.remove('show');
    this.minimapPings.length = 0;
    for (const d of this.dmgDirs) d.el.remove();
    this.dmgDirs.length = 0;
  }

  // ------------------------------------------------------------- minimap

  /** Pre-render the arena layout once per round onto an offscreen canvas. */
  minimapSetArena(arena) {
    const size = arena.size;
    const px = this.minimap.width;
    const off = document.createElement('canvas');
    off.width = px;
    off.height = px;
    const ctx = off.getContext('2d');
    ctx.fillStyle = 'rgba(10, 15, 24, 0.92)';
    ctx.fillRect(0, 0, px, px);
    const cellPx = px / size;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const color = MINIMAP_TILE_COLORS[arena.grid[r * size + c]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(c * cellPx, r * cellPx, cellPx + 0.5, cellPx + 0.5);
      }
    }
    this.minimapLayoutCanvas = off;
    this.minimapWorldHalf = (size * CELL) / 2;
    this.minimapPings.length = 0;
  }

  /** Mark enemy gunfire: shots reveal position, walking does not. */
  minimapPing(x, z) {
    this.minimapPings.push({ x, z, at: performance.now() });
    if (this.minimapPings.length > 24) this.minimapPings.shift();
  }

  minimapDraw(selfX, selfZ, selfYaw) {
    if (!this.minimapLayoutCanvas) return;
    const ctx = this.minimapCtx;
    const px = this.minimap.width;
    ctx.clearRect(0, 0, px, px);
    ctx.drawImage(this.minimapLayoutCanvas, 0, 0);

    const world = this.minimapWorldHalf * 2;
    const toMapX = (wx) => ((wx + this.minimapWorldHalf) / world) * px;
    const toMapY = (wz) => ((wz + this.minimapWorldHalf) / world) * px;

    const now = performance.now();
    this.minimapPings = this.minimapPings.filter((p) => now - p.at < 1600);
    for (const p of this.minimapPings) {
      const age = (now - p.at) / 1600;
      ctx.beginPath();
      ctx.arc(toMapX(p.x), toMapY(p.z), 3 + age * 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 74, 74, ${(0.8 * (1 - age)).toFixed(3)})`;
      ctx.fill();
    }

    // Self: a view-cone arrow. Map north is world -z, matching yaw 0.
    ctx.save();
    ctx.translate(toMapX(selfX), toMapY(selfZ));
    ctx.rotate(-selfYaw);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fillStyle = '#4dd7ff';
    ctx.strokeStyle = 'rgba(6, 10, 16, 0.9)';
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // -------------------------------------------------- damage direction

  /** Show a wedge pointing at the world bearing damage came from. */
  damageFrom(bearing) {
    const el = document.createElement('div');
    el.className = 'dmg-dir';
    this.dmgWrap.appendChild(el);
    this.dmgDirs.push({ bearing, ttl: 1.15, el });
    if (this.dmgDirs.length > 6) {
      const oldest = this.dmgDirs.shift();
      oldest.el.remove();
    }
  }

  /** Re-aim the wedges every frame so they track as the camera turns. */
  updateDamageDirs(viewYaw, dt) {
    for (let i = this.dmgDirs.length - 1; i >= 0; i--) {
      const d = this.dmgDirs[i];
      d.ttl -= dt;
      if (d.ttl <= 0) {
        d.el.remove();
        this.dmgDirs.splice(i, 1);
        continue;
      }
      const rel = normalizeAngle(d.bearing - viewYaw);
      d.el.style.transform = `translate(-50%, -50%) rotate(${-rel}rad) translateY(-92px)`;
      d.el.style.opacity = String(Math.min(1, d.ttl / 0.45));
    }
  }

  setGameMode(mode) {
    this.mode = mode;
    const isMulti = mode === 'deathmatch' || mode === 'gungame';
    this.scoreboard.classList.toggle('hidden', isMulti);
    this.dmBoard.classList.toggle('hidden', !isMulti);
  }

  setNames(mine, theirs) {
    $('score-name-me').textContent = (mine || 'You').toUpperCase();
    $('score-name-them').textContent = (theirs || 'Rival').toUpperCase();
  }

  setScores(mine, theirs) {
    $('score-me').textContent = mine;
    $('score-them').textContent = theirs;
  }

  setRound(n, target) {
    $('round-label').textContent = `ROUND ${n} · FIRST TO ${target}`;
  }

  setDeathmatchLabel(minutes) {
    $('round-label').textContent = `DEATHMATCH · ${minutes} MIN`;
  }

  setGunGameLabel() {
    $('round-label').textContent = 'GUN GAME';
  }

  setTimer(text, urgent = false) {
    $('round-timer').textContent = text;
    this.clock.classList.toggle('urgent', urgent);
  }

  updateDmLeaderboard(entries) {
    this.dmList.innerHTML = '';
    entries.forEach((entry, i) => {
      const li = document.createElement('li');
      if (entry.me) li.className = 'me';
      li.innerHTML =
        `<span class="lb-rank">${i + 1}</span>` +
        `<span class="lb-dot" style="background:${entry.color}"></span>` +
        `<span class="lb-name">${escapeHtml(entry.name)}</span>` +
        `<span class="lb-kills">${entry.kills}</span>` +
        `<span class="lb-deaths">${entry.deaths}</span>`;
      this.dmList.appendChild(li);
    });
  }

  setHealth(health) {
    const clamped = Math.max(0, Math.min(100, health));
    const low = clamped <= 35;
    const fill = $('health-fill');
    fill.style.width = `${clamped}%`;
    fill.classList.toggle('low', low);
    this.healthWrap.classList.toggle('low', low);
    $('health-num').textContent = Math.round(clamped);
  }

  setWeapon(name, ammo, magazine, reloading, reloadProgress = 0) {
    $('weapon-name').textContent = name.toUpperCase();
    $('ammo-cur').textContent = ammo;
    $('ammo-max').textContent = `/${magazine}`;
    this.ammoEl.classList.toggle('empty', ammo === 0);
    $('reload-note').classList.toggle('hidden', !reloading);
    if (reloading) {
      this.reloadFill.style.width = `${Math.round(Math.max(0, Math.min(1, reloadProgress)) * 100)}%`;
    }
  }

  setLoadout({ primaryName, primaryAmmo, secondaryAmmo, activeSlot, visible }) {
    const bar = $('loadout-bar');
    bar.classList.toggle('hidden', !visible);
    if (!visible) return;
    $('slot-primary-name').textContent = primaryName.toUpperCase();
    $('slot-primary-ammo').textContent = primaryAmmo;
    $('slot-secondary-ammo').textContent = secondaryAmmo;
    $('slot-primary').classList.toggle('active', activeSlot === 'primary');
    $('slot-secondary').classList.toggle('active', activeSlot === 'secondary');
  }

  setCrosshairGap(pixels) {
    const gap = Math.round(pixels);
    if (gap === this.lastGap) return;
    this.lastGap = gap;
    for (const part of this.crosshairParts) part.style.setProperty('--gap', `${gap}px`);
  }

  setScope(on) {
    this.scope.classList.toggle('hidden', !on);
    this.root.classList.toggle('scoped', on);
  }

  setSpawnShield(on) {
    this.spawnShield.classList.toggle('hidden', !on);
  }

  setPing(ms) {
    $('ping').textContent = ms;
    this.netInfo.classList.toggle('ok', ms >= 80 && ms < 150);
    this.netInfo.classList.toggle('bad', ms >= 150);
  }

  hitmarker(isHead) {
    this.hitmarkerEl.style.opacity = '1';
    this.hitmarkerEl.style.filter = isHead
      ? 'drop-shadow(0 0 6px #fb7185) hue-rotate(-20deg)'
      : 'drop-shadow(0 0 2px rgba(0, 0, 0, 0.9))';
    this.hitmarkerTimer = isHead ? 0.22 : 0.14;
  }

  damageFlash(intensity) {
    this.vignette.style.opacity = String(Math.min(0.95, intensity));
    this.vignetteTimer = 0.5;
  }

  banner(main, sub = '', seconds = 1.6) {
    this.bannerEl.innerHTML = sub ? `${main}<small>${sub}</small>` : main;
    this.bannerEl.classList.add('show');
    this.bannerTimer = seconds;
  }

  clearBanner() {
    this.bannerEl.classList.remove('show');
    this.bannerTimer = 0;
  }

  killFeed({ killer, killerColor, victim, victimColor, headshot, iKilled, iDied }) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    if (iKilled) row.classList.add('i-killed');
    if (iDied) row.classList.add('i-died');
    if (headshot) row.classList.add('headshot');
    row.innerHTML =
      `<span class="feed-name" style="color:${killerColor}">${escapeHtml(killer)}</span>` +
      SKULL_ICON +
      `<span class="feed-name" style="color:${victimColor}">${escapeHtml(victim)}</span>` +
      (headshot ? '<span class="feed-head">HS</span>' : '');
    this.feedEl.appendChild(row);
    setTimeout(() => row.remove(), 4500);
    while (this.feedEl.children.length > 5) this.feedEl.firstChild.remove();
  }

  clearFeed() {
    this.feedEl.innerHTML = '';
  }

  update(dt) {
    if (dt > 0) this.fps += (1 / dt - this.fps) * Math.min(1, dt * 4);
    this.fpsTimer -= dt;
    if (this.fpsTimer <= 0) {
      this.fpsTimer = 0.25;
      $('fps').textContent = Math.round(this.fps);
      const scaled = this.renderScale < 0.995;
      $('res-stat').classList.toggle('hidden', !scaled);
      $('res-div').classList.toggle('hidden', !scaled);
      if (scaled) $('res-scale').textContent = Math.round(this.renderScale * 100);
    }

    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) this.hitmarkerEl.style.opacity = '0';
    }
    if (this.vignetteTimer > 0) {
      this.vignetteTimer -= dt;
      if (this.vignetteTimer <= 0) this.vignette.style.opacity = '0';
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.classList.remove('show');
    }
  }
}
