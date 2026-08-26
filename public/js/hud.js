const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.crosshairParts = Array.from(document.querySelectorAll('.ch'));
    this.hitmarkerEl = $('hitmarker');
    this.bannerEl = $('banner');
    this.feedEl = $('killfeed');
    this.vignette = $('damage-vignette');
    this.scope = $('scope-overlay');

    this.hitmarkerTimer = 0;
    this.vignetteTimer = 0;
    this.bannerTimer = 0;
    this.lastGap = -1;
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
    this.bannerEl.classList.remove('show');
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

  setTimer(text) {
    $('round-timer').textContent = text;
  }

  setHealth(health) {
    const clamped = Math.max(0, Math.min(100, health));
    const fill = $('health-fill');
    fill.style.width = `${clamped}%`;
    fill.classList.toggle('low', clamped <= 35);
    $('health-num').textContent = Math.round(clamped);
  }

  setWeapon(name, ammo, magazine, reloading) {
    $('weapon-name').textContent = name.toUpperCase();
    $('ammo-cur').textContent = ammo;
    $('ammo-max').textContent = `/${magazine}`;
    $('reload-note').classList.toggle('hidden', !reloading);
  }

  /** Crosshair gap tracks the weapon's current cone of fire. */
  setCrosshairGap(pixels) {
    const gap = Math.round(pixels);
    if (gap === this.lastGap) return;
    this.lastGap = gap;
    for (const part of this.crosshairParts) part.style.setProperty('--gap', `${gap}px`);
  }

  setScope(on) {
    this.scope.classList.toggle('hidden', !on);
  }

  setPing(ms) {
    $('ping').textContent = ms;
  }

  hitmarker(isHead) {
    this.hitmarkerEl.style.opacity = '1';
    this.hitmarkerEl.style.filter = isHead
      ? 'drop-shadow(0 0 5px #fb7185) hue-rotate(-20deg)'
      : 'none';
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

  feed(html) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.innerHTML = html;
    this.feedEl.appendChild(row);
    setTimeout(() => row.remove(), 4500);
    while (this.feedEl.children.length > 4) this.feedEl.firstChild.remove();
  }

  clearFeed() {
    this.feedEl.innerHTML = '';
  }

  update(dt) {
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
