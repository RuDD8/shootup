import fs from 'node:fs';
import path from 'node:path';

/**
 * Patch first-person BUILDERS in public/js/viewmodel.js with sandbox-tuned
 * gun / hand / muzzle values. Avatar builders are left alone.
 */

function fmt(n) {
  const v = Math.round(Number(n) * 1000) / 1000;
  return Object.is(v, -0) ? 0 : v;
}

function indentBlock(text, spaces = 4) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.length ? pad + line : line))
    .join('\n');
}

function buildMountBlock(weaponId, mountFn, tune) {
  const gun = tune.gun || {};
  const trigger = tune.trigger || null;
  const support = tune.support || null;
  const muzzle = tune.muzzle || null;
  const length = fmt(gun.targetLength ?? 0.5);
  const lines = [];

  if (trigger) {
    lines.push('const trigger = triggerHand({');
    lines.push(`  x: ${fmt(trigger.x)},`);
    lines.push(`  y: ${fmt(trigger.y)},`);
    lines.push(`  z: ${fmt(trigger.z)},`);
    if (trigger.armPitch != null) lines.push(`  armPitch: ${fmt(trigger.armPitch)},`);
    if (trigger.armYaw != null) lines.push(`  armYaw: ${fmt(trigger.armYaw)},`);
    if (trigger.armLength != null) lines.push(`  armLength: ${fmt(trigger.armLength)},`);
    if (trigger.verticalGrip) lines.push('  verticalGrip: true,');
    lines.push('});');
    if (trigger.rx || trigger.ry || trigger.rz) {
      lines.push(
        `trigger.rotation.set(${fmt(trigger.rx || 0)}, ${fmt(trigger.ry || 0)}, ${fmt(trigger.rz || 0)});`,
      );
    }
    if (trigger.scale != null && Math.abs(trigger.scale - 1) > 0.001) {
      lines.push(`trigger.scale.setScalar(${fmt(trigger.scale)});`);
    }
    lines.push('g.add(trigger);');
    lines.push('');
  }

  if (support) {
    lines.push('const support = supportHand({');
    lines.push(`  x: ${fmt(support.x)},`);
    lines.push(`  y: ${fmt(support.y)},`);
    lines.push(`  z: ${fmt(support.z)},`);
    if (support.rise != null) lines.push(`  rise: ${fmt(support.rise)},`);
    if (support.armPitch != null) lines.push(`  armPitch: ${fmt(support.armPitch)},`);
    if (support.armYaw != null) lines.push(`  armYaw: ${fmt(support.armYaw)},`);
    if (support.armLength != null) lines.push(`  armLength: ${fmt(support.armLength)},`);
    lines.push('});');
    if (support.rx || support.ry || support.rz) {
      lines.push(
        `support.rotation.set(${fmt(support.rx || 0)}, ${fmt(support.ry || 0)}, ${fmt(support.rz || 0)});`,
      );
    }
    if (support.scale != null && Math.abs(support.scale - 1) > 0.001) {
      lines.push(`support.scale.setScalar(${fmt(support.scale)});`);
    }
    lines.push('g.add(support);');
    lines.push('');
  }

  if (muzzle) {
    lines.push(
      `addMuzzle(g, ${fmt(muzzle.x)}, ${fmt(muzzle.y)}, ${fmt(muzzle.z)}, ${length});`,
    );
  }

  const offset = gun.offset || { x: 0, y: 0, z: 0 };
  lines.push(`${mountFn}(modelHost, {`);
  lines.push(`  targetLength: ${length},`);
  if (gun.yaw != null) lines.push(`  yaw: ${fmt(gun.yaw)},`);
  if (gun.pitch != null && Math.abs(gun.pitch) > 0.0005) lines.push(`  pitch: ${fmt(gun.pitch)},`);
  if (gun.roll != null && Math.abs(gun.roll) > 0.0005) lines.push(`  roll: ${fmt(gun.roll)},`);
  lines.push(
    `  offset: { x: ${fmt(offset.x)}, y: ${fmt(offset.y)}, z: ${fmt(offset.z)} },`,
  );
  lines.push('}).then((loaded) => {');
  lines.push('  if (loaded) fallback.visible = false;');
  lines.push('});');

  return indentBlock(lines.join('\n'), 4);
}

function extractBuildersSection(source) {
  const start = source.indexOf('const BUILDERS = {');
  const end = source.indexOf('export const AVATAR_GUN_BUILDERS');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Could not locate BUILDERS section in viewmodel.js');
  }
  return { start, end, body: source.slice(start, end) };
}

function findWeaponFn(buildersBody, weaponId) {
  const re = new RegExp(`\\n  ${weaponId}\\(\\) \\{`);
  const match = re.exec(buildersBody);
  if (!match) throw new Error(`No first-person builder for "${weaponId}"`);
  const fnStart = match.index + 1; // at "  weaponId() {"
  // Brace match from the opening `{` of the function
  const braceOpen = buildersBody.indexOf('{', fnStart);
  let depth = 0;
  for (let i = braceOpen; i < buildersBody.length; i++) {
    const ch = buildersBody[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return {
          fnStart,
          fnEnd: i + 1,
          fnBody: buildersBody.slice(fnStart, i + 1),
        };
      }
    }
  }
  throw new Error(`Unbalanced braces in ${weaponId}() builder`);
}

function detectMountFn(fnBody) {
  const m = fnBody.match(/mount([A-Za-z0-9]+)\(\s*modelHost/);
  if (!m) throw new Error('No mount*(modelHost) call found in builder');
  return `mount${m[1]}`;
}

function replaceTuneTail(fnBody, replacement) {
  // Drop any existing hand / muzzle / mount tail, keep everything above it.
  const patterns = [
    /\n[ \t]*const trigger = triggerHand\(/,
    /\n[ \t]*g\.add\(triggerHand\(/,
    /\n[ \t]*const support = supportHand\(/,
    /\n[ \t]*g\.add\(supportHand\(/,
    /\n[ \t]*addMuzzle\(/,
    /\n[ \t]*mount[A-Za-z0-9]+\(\s*modelHost/,
  ];
  let cut = -1;
  for (const re of patterns) {
    const m = re.exec(fnBody);
    if (m && (cut < 0 || m.index < cut)) cut = m.index;
  }
  if (cut < 0) throw new Error('Could not find tune tail (hands/muzzle/mount) in builder');

  const head = fnBody.slice(0, cut);
  // Keep a clean return g; closing
  const returnMatch = /\n[ \t]*return g;\n[ \t]*\}\s*$/.exec(fnBody);
  if (!returnMatch) throw new Error('Builder does not end with return g;');
  return `${head}\n${replacement}\n\n    return g;\n  }`;
}

export function saveViewmodelTune(viewmodelPath, weaponId, tune) {
  const id = String(weaponId || '').trim();
  if (!/^[a-z][a-z0-9]*$/i.test(id)) {
    throw new Error('Invalid weapon id');
  }

  const source = fs.readFileSync(viewmodelPath, 'utf8');
  const { start, end, body } = extractBuildersSection(source);
  const { fnStart, fnEnd, fnBody } = findWeaponFn(body, id);
  const mountFn = detectMountFn(fnBody);
  const block = buildMountBlock(id, mountFn, tune);
  const newFn = replaceTuneTail(fnBody, block);

  const newBody = body.slice(0, fnStart) + newFn + body.slice(fnEnd);
  const next = source.slice(0, start) + newBody + source.slice(end);
  fs.writeFileSync(viewmodelPath, next, 'utf8');
  return { weaponId: id, mountFn, bytes: next.length };
}

export function viewmodelPathFromRoot(root) {
  return path.join(root, 'public', 'js', 'viewmodel.js');
}
