// All four guns are hitscan. Balance intent, roughly by time-to-kill on body
// shots: shotgun wins point blank and falls off a cliff past ~12m, AR is the
// reliable mid-range pick, pistol trades damage for accuracy and mobility,
// sniper one-shots on a headshot but punishes a miss with a long refire.

export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    damage: 24,
    pellets: 1,
    rpm: 400,
    auto: false,
    magazine: 12,
    reload: 1.3,
    spread: 0.004,
    bloom: 0.006,
    maxBloom: 0.03,
    bloomDecay: 0.05,
    moveMult: 1.06,
    recoil: 0.9,
    zoom: 1,
    falloffStart: 40,
    falloffEnd: 70,
    falloffMin: 0.7,
    shake: 0.5,
  },
  assault: {
    id: 'assault',
    name: 'Assault Rifle',
    damage: 18,
    pellets: 1,
    rpm: 660,
    auto: true,
    magazine: 30,
    reload: 2.1,
    spread: 0.006,
    bloom: 0.005,
    maxBloom: 0.05,
    bloomDecay: 0.07,
    moveMult: 0.95,
    recoil: 0.7,
    zoom: 1,
    falloffStart: 35,
    falloffEnd: 65,
    falloffMin: 0.65,
    shake: 0.4,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    damage: 11,
    pellets: 9,
    rpm: 70,
    auto: false,
    magazine: 6,
    reload: 2.8,
    spread: 0.075,
    bloom: 0,
    maxBloom: 0,
    bloomDecay: 0,
    moveMult: 1.0,
    recoil: 2.4,
    zoom: 1,
    falloffStart: 10,
    falloffEnd: 26,
    falloffMin: 0.22,
    shake: 1.3,
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper Rifle',
    damage: 90,
    pellets: 1,
    rpm: 45,
    auto: false,
    magazine: 5,
    reload: 3.0,
    spread: 0.0006,
    bloom: 0.03,
    maxBloom: 0.09,
    bloomDecay: 0.04,
    moveMult: 0.82,
    recoil: 3.0,
    zoom: 3.2,
    falloffStart: 200,
    falloffEnd: 400,
    falloffMin: 1,
    shake: 1.6,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

export const HEADSHOT_MULT = 1.8;

export function randomWeaponId(rand = Math.random) {
  return WEAPON_IDS[Math.floor(rand() * WEAPON_IDS.length)];
}

export function shotInterval(weapon) {
  return 60 / weapon.rpm;
}

// Linear damage falloff between falloffStart and falloffEnd, floored at
// falloffMin. Keeps the shotgun honest at range without a hard cutoff.
export function damageAtRange(weapon, distance) {
  if (distance <= weapon.falloffStart) return weapon.damage;
  if (distance >= weapon.falloffEnd) return weapon.damage * weapon.falloffMin;
  const t = (distance - weapon.falloffStart) / (weapon.falloffEnd - weapon.falloffStart);
  return weapon.damage * (1 - t * (1 - weapon.falloffMin));
}
