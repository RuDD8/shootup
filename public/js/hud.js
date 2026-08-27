const $ = (id) => document.getElementById(id);

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

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

    this.hitmarkerTimer = 0;
    this.vignetteTimer = 0;
    this.bannerTimer = 0;
    this.lastGap = -1;
    this.mode = 'duel';

    // Smoothed frame rate so the readout does not flicker every frame.
    this.fps = 60;
    this.fpsTimer = 0;
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
    this.bannerEl.classList.remove('show');
  }

  setGameMode(mode) {
    this.mode = mode;
    const isDM = mode === 'deathmatch';
    this.scoreboard.classList.toggle('hidden', isDM);
    this.dmBoard.classList.toggle('hidden', !isDM);
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
        `<span class="lb-kills">${entry.kills}</span>`;
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
