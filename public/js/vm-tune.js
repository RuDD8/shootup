/**
 * Live first-person weapon mount tuner.
 * Open with window.vmTune() / toggleVmTune(). Sandbox F2 flow opens this so
 * you can fix GLB grip offsets, hands, and muzzle exit point live.
 */

function findMountedModel(weapon) {
  if (!weapon) return null;
  let found = null;
  weapon.traverse((child) => {
    if (found) return;
    if (child.userData?.mountTune) found = child;
  });
  return found;
}

function findHand(weapon, kind) {
  if (!weapon) return null;
  let found = null;
  weapon.traverse((child) => {
    if (found) return;
    if (child.userData?.handTune === kind) found = child;
  });
  return found;
}

function findMuzzle(weapon) {
  if (!weapon) return null;
  if (weapon.userData?.muzzle) return weapon.userData.muzzle;
  let found = null;
  weapon.traverse((child) => {
    if (found) return;
    if (child.userData?.muzzleTune) found = child;
  });
  return found;
}

function setMuzzleMarkerVisible(weapon, visible) {
  const muzzle = findMuzzle(weapon);
  if (!muzzle) return;
  const marker = muzzle.getObjectByName('MuzzleMarker');
  if (marker) marker.visible = Boolean(visible);
}

function fmt(n) {
  const v = Math.round(n * 1000) / 1000;
  return Object.is(v, -0) ? 0 : v;
}

function gunSnippet(model) {
  const tune = model.userData.mountTune || {};
  const base = tune.baseLength || 1;
  const targetLength = fmt(model.scale.x * base);
  return [
    '// gun mount',
    `offset: { x: ${fmt(model.position.x)}, y: ${fmt(model.position.y)}, z: ${fmt(model.position.z)} },`,
    `pitch: ${fmt(model.rotation.x)},`,
    `yaw: ${fmt(model.rotation.y)},`,
    `roll: ${fmt(model.rotation.z)},`,
    `targetLength: ${targetLength},`,
  ].join('\n');
}

function handSnippet(hand, kind) {
  const args = hand.userData.handTuneArgs || {};
  const lines = [
    `// ${kind} hand`,
    `${kind === 'trigger' ? 'triggerHand' : 'supportHand'}({`,
    `  x: ${fmt(hand.position.x)},`,
    `  y: ${fmt(hand.position.y)},`,
    `  z: ${fmt(hand.position.z)},`,
  ];
  if (kind === 'trigger') {
    lines.push(
      `  armPitch: ${fmt(args.armPitch ?? 0.78)},`,
      `  armYaw: ${fmt(args.armYaw ?? 0.32)},`,
      `  armLength: ${fmt(args.armLength ?? 0.36)},`,
    );
    if (args.verticalGrip) lines.push('  verticalGrip: true,');
  } else {
    lines.push(
      `  rise: ${fmt(args.rise ?? 0.05)},`,
      `  armPitch: ${fmt(args.armPitch ?? 0.95)},`,
      `  armYaw: ${fmt(args.armYaw ?? -0.42)},`,
      `  armLength: ${fmt(args.armLength ?? 0.5)},`,
    );
  }
  if (Math.abs(hand.rotation.x) > 0.001 || Math.abs(hand.rotation.y) > 0.001 || Math.abs(hand.rotation.z) > 0.001) {
    lines.push(
      `  // then after create: hand.rotation.set(${fmt(hand.rotation.x)}, ${fmt(hand.rotation.y)}, ${fmt(hand.rotation.z)});`,
    );
  }
  if (Math.abs(hand.scale.x - 1) > 0.001) {
    lines.push(`  // then after create: hand.scale.setScalar(${fmt(hand.scale.x)});`);
  }
  lines.push('})');
  return lines.join('\n');
}

function muzzleSnippet(muzzle) {
  return [
    '// muzzle (bullet / tracer leave point)',
    `addMuzzle(g, ${fmt(muzzle.position.x)}, ${fmt(muzzle.position.y)}, ${fmt(muzzle.position.z)}, length);`,
  ].join('\n');
}

export function installVmTune(viewModel, options = {}) {
  const getPassword = typeof options.getPassword === 'function' ? options.getPassword : () => '';
  const panel = document.createElement('div');
  panel.id = 'vm-tune';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="vm-tune-head">
      <strong>Viewmodel tune</strong>
      <span class="vm-tune-id"></span>
      <button type="button" data-act="close" title="Close">✕</button>
    </div>
    <p class="vm-tune-hint">Sandbox · F = weapons · red bead = muzzle</p>
    <div class="vm-tune-tabs">
      <button type="button" data-tab="gun" class="active">Gun</button>
      <button type="button" data-tab="trigger">Trigger</button>
      <button type="button" data-tab="support">Support</button>
      <button type="button" data-tab="muzzle">Muzzle</button>
    </div>
    <label data-row="size">size <input data-k="size" type="range" min="0.15" max="1.2" step="0.005"><span data-v="size"></span></label>
    <label>pos X <input data-k="px" type="range" min="-0.35" max="0.35" step="0.001"><span data-v="px"></span></label>
    <label>pos Y <input data-k="py" type="range" min="-0.35" max="0.35" step="0.001"><span data-v="py"></span></label>
    <label>pos Z <input data-k="pz" type="range" min="-0.6" max="0.45" step="0.001"><span data-v="pz"></span></label>
    <label data-row="rx">pitch <input data-k="rx" type="range" min="-3.14" max="3.14" step="0.01"><span data-v="rx"></span></label>
    <label data-row="ry">yaw <input data-k="ry" type="range" min="-3.14" max="3.14" step="0.01"><span data-v="ry"></span></label>
    <label data-row="rz">roll <input data-k="rz" type="range" min="-3.14" max="3.14" step="0.01"><span data-v="rz"></span></label>
    <div class="vm-tune-actions">
      <button type="button" data-act="copy">Copy snippet</button>
      <button type="button" data-act="copy-all">Copy all</button>
      <button type="button" data-act="save" class="vm-tune-save">Save to code</button>
      <button type="button" data-act="reset">Reset</button>
    </div>
    <pre class="vm-tune-out"></pre>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #vm-tune {
      position: fixed; top: 12px; left: 12px; z-index: 9999;
      width: 310px; padding: 10px 12px; border-radius: 8px;
      background: rgba(10, 14, 20, 0.92); color: #e8eef7;
      font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
      box-shadow: 0 8px 28px rgba(0,0,0,0.45); pointer-events: auto;
    }
    #vm-tune[hidden] { display: none !important; }
    #vm-tune .vm-tune-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    #vm-tune .vm-tune-head strong { flex: 1; font-size: 13px; }
    #vm-tune .vm-tune-id { opacity: 0.7; }
    #vm-tune .vm-tune-hint { margin: 0 0 8px; opacity: 0.65; font-size: 11px; }
    #vm-tune .vm-tune-tabs { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }
    #vm-tune .vm-tune-tabs button {
      flex: 1; min-width: 64px; background: #1a2433; color: #9fb0c7; border: 0; border-radius: 5px;
      padding: 5px 4px; cursor: pointer; font: inherit; font-size: 11px;
    }
    #vm-tune .vm-tune-tabs button.active { background: #3a6ea5; color: #fff; }
    #vm-tune label { display: grid; grid-template-columns: 48px 1fr 46px; gap: 6px; align-items: center; margin: 3px 0; }
    #vm-tune label[hidden] { display: none !important; }
    #vm-tune input[type=range] { width: 100%; }
    #vm-tune .vm-tune-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
    #vm-tune button {
      background: #2a3b55; color: #fff; border: 0; border-radius: 5px;
      padding: 5px 8px; cursor: pointer; font: inherit;
    }
    #vm-tune button:hover { background: #3a5275; }
    #vm-tune .vm-tune-save { background: #1f6a45; }
    #vm-tune .vm-tune-save:hover { background: #278555; }
    #vm-tune .vm-tune-out {
      margin: 8px 0 0; padding: 8px; max-height: 140px; overflow: auto;
      background: #0b1220; border-radius: 5px; white-space: pre-wrap; color: #9fd4ff;
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(panel);

  const inputs = Object.fromEntries(
    [...panel.querySelectorAll('input[data-k]')].map((el) => [el.dataset.k, el]),
  );
  const values = Object.fromEntries(
    [...panel.querySelectorAll('span[data-v]')].map((el) => [el.dataset.v, el]),
  );
  const out = panel.querySelector('.vm-tune-out');
  const idEl = panel.querySelector('.vm-tune-id');
  const tabBtns = [...panel.querySelectorAll('[data-tab]')];
  const rowSize = panel.querySelector('[data-row="size"]');
  const rowRx = panel.querySelector('[data-row="rx"]');
  const rowRy = panel.querySelector('[data-row="ry"]');
  const rowRz = panel.querySelector('[data-row="rz"]');

  let open = false;
  let tab = 'gun';
  let baselines = { gun: null, trigger: null, support: null, muzzle: null };
  let lastTargets = { gun: null, trigger: null, support: null, muzzle: null };

  function currentTarget() {
    const weapon = viewModel.weapon;
    if (tab === 'gun') return findMountedModel(weapon);
    if (tab === 'trigger') return findHand(weapon, 'trigger');
    if (tab === 'support') return findHand(weapon, 'support');
    if (tab === 'muzzle') return findMuzzle(weapon);
    return null;
  }

  function readTarget(target) {
    if (tab === 'gun') {
      const tune = target.userData.mountTune || {};
      const base = tune.baseLength || 1;
      return {
        size: target.scale.x * base,
        px: target.position.x,
        py: target.position.y,
        pz: target.position.z,
        rx: target.rotation.x,
        ry: target.rotation.y,
        rz: target.rotation.z,
      };
    }
    if (tab === 'muzzle') {
      const marker = target.getObjectByName('MuzzleMarker');
      return {
        size: marker ? marker.scale.x : 1,
        px: target.position.x,
        py: target.position.y,
        pz: target.position.z,
        rx: 0,
        ry: 0,
        rz: 0,
      };
    }
    return {
      size: target.scale.x,
      px: target.position.x,
      py: target.position.y,
      pz: target.position.z,
      rx: target.rotation.x,
      ry: target.rotation.y,
      rz: target.rotation.z,
    };
  }

  function writeTarget(target, next) {
    if (tab === 'gun') {
      const tune = target.userData.mountTune || {};
      const base = tune.baseLength || 1;
      target.scale.setScalar(next.size / base);
      target.position.set(next.px, next.py, next.pz);
      target.rotation.set(next.rx, next.ry, next.rz);
      return;
    }
    if (tab === 'muzzle') {
      target.position.set(next.px, next.py, next.pz);
      const marker = target.getObjectByName('MuzzleMarker');
      if (marker) marker.scale.setScalar(next.size);
      return;
    }
    target.scale.setScalar(next.size);
    target.position.set(next.px, next.py, next.pz);
    target.rotation.set(next.rx, next.ry, next.rz);
  }

  function snippetFor(target) {
    if (!target) return '';
    if (tab === 'gun') return gunSnippet(target);
    if (tab === 'muzzle') return muzzleSnippet(target);
    return handSnippet(target, tab);
  }

  function allSnippet() {
    const weapon = viewModel.weapon;
    const chunks = [];
    const gun = findMountedModel(weapon);
    const trigger = findHand(weapon, 'trigger');
    const support = findHand(weapon, 'support');
    const muzzle = findMuzzle(weapon);
    if (gun) chunks.push(gunSnippet(gun));
    if (trigger) chunks.push(handSnippet(trigger, 'trigger'));
    if (support) chunks.push(handSnippet(support, 'support'));
    if (muzzle) chunks.push(muzzleSnippet(muzzle));
    return chunks.join('\n\n') || 'Nothing tunable on this weapon.';
  }

  function collectTunePayload() {
    const weapon = viewModel.weapon;
    const gunObj = findMountedModel(weapon);
    const triggerObj = findHand(weapon, 'trigger');
    const supportObj = findHand(weapon, 'support');
    const muzzleObj = findMuzzle(weapon);
    const tune = {};

    if (gunObj) {
      const meta = gunObj.userData.mountTune || {};
      const base = meta.baseLength || 1;
      tune.gun = {
        targetLength: fmt(gunObj.scale.x * base),
        offset: {
          x: fmt(gunObj.position.x),
          y: fmt(gunObj.position.y),
          z: fmt(gunObj.position.z),
        },
        pitch: fmt(gunObj.rotation.x),
        yaw: fmt(gunObj.rotation.y),
        roll: fmt(gunObj.rotation.z),
      };
    }

    if (triggerObj) {
      const args = triggerObj.userData.handTuneArgs || {};
      tune.trigger = {
        x: fmt(triggerObj.position.x),
        y: fmt(triggerObj.position.y),
        z: fmt(triggerObj.position.z),
        armPitch: args.armPitch,
        armYaw: args.armYaw,
        armLength: args.armLength,
        verticalGrip: Boolean(args.verticalGrip),
        scale: fmt(triggerObj.scale.x),
        rx: fmt(triggerObj.rotation.x),
        ry: fmt(triggerObj.rotation.y),
        rz: fmt(triggerObj.rotation.z),
      };
    }

    if (supportObj) {
      const args = supportObj.userData.handTuneArgs || {};
      tune.support = {
        x: fmt(supportObj.position.x),
        y: fmt(supportObj.position.y),
        z: fmt(supportObj.position.z),
        rise: args.rise,
        armPitch: args.armPitch,
        armYaw: args.armYaw,
        armLength: args.armLength,
        scale: fmt(supportObj.scale.x),
        rx: fmt(supportObj.rotation.x),
        ry: fmt(supportObj.rotation.y),
        rz: fmt(supportObj.rotation.z),
      };
    }

    if (muzzleObj) {
      tune.muzzle = {
        x: fmt(muzzleObj.position.x),
        y: fmt(muzzleObj.position.y),
        z: fmt(muzzleObj.position.z),
      };
    }

    return tune;
  }

  async function saveToCode() {
    const weaponId = viewModel.weaponId;
    if (!weaponId) {
      out.textContent = 'No weapon equipped.';
      return;
    }
    if (!findMountedModel(viewModel.weapon) && !findHand(viewModel.weapon, 'trigger')) {
      out.textContent = 'Nothing to save on this weapon.';
      return;
    }
    if (!window.confirm(`Save ${weaponId} viewmodel into public/js/viewmodel.js?`)) return;

    const password = getPassword();
    out.textContent = `Saving ${weaponId}…`;
    try {
      const res = await fetch('/api/sandbox/save-viewmodel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          weaponId,
          tune: collectTunePayload(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        out.textContent = `Save failed: ${data.error || res.statusText || res.status}`;
        return;
      }
      out.textContent = `Saved ${weaponId} → viewmodel.js\n\nHard-refresh to reload the file.\n(${data.mountFn})`;
    } catch (err) {
      out.textContent = `Save failed: ${err.message || err}`;
    }
  }

  function syncRowVisibility() {
    const isMuzzle = tab === 'muzzle';
    rowSize.hidden = false;
    rowRx.hidden = isMuzzle;
    rowRy.hidden = isMuzzle;
    rowRz.hidden = isMuzzle;
    if (isMuzzle) {
      inputs.size.min = '0.4';
      inputs.size.max = '3';
      inputs.size.step = '0.05';
      inputs.pz.min = '-0.7';
      inputs.pz.max = '0.2';
    } else if (tab === 'gun') {
      inputs.size.min = '0.15';
      inputs.size.max = '1.2';
      inputs.size.step = '0.005';
      inputs.pz.min = '-0.45';
      inputs.pz.max = '0.45';
    } else {
      inputs.size.min = '0.4';
      inputs.size.max = '1.8';
      inputs.size.step = '0.01';
      inputs.pz.min = '-0.45';
      inputs.pz.max = '0.45';
    }
  }

  function syncUiFromTarget(target) {
    syncRowVisibility();
    const next = readTarget(target);
    for (const [k, el] of Object.entries(inputs)) {
      el.value = String(next[k]);
      values[k].textContent = String(fmt(next[k]));
    }
    out.textContent = snippetFor(target);
  }

  function applyFromUi() {
    const target = currentTarget();
    if (!target) {
      idEl.textContent = `(no ${tab})`;
      out.textContent =
        tab === 'gun'
          ? 'Equip a weapon that uses a .glb model.'
          : tab === 'muzzle'
            ? 'This weapon has no muzzle point.'
            : `This weapon has no ${tab} hand tagged.`;
      return;
    }
    if (target !== lastTargets[tab]) {
      lastTargets[tab] = target;
      baselines[tab] = readTarget(target);
    }
    idEl.textContent = `${viewModel.weaponId || ''} · ${tab}`;
    const next = {
      size: Number(inputs.size.value),
      px: Number(inputs.px.value),
      py: Number(inputs.py.value),
      pz: Number(inputs.pz.value),
      rx: Number(inputs.rx.value),
      ry: Number(inputs.ry.value),
      rz: Number(inputs.rz.value),
    };
    writeTarget(target, next);
    for (const [k, el] of Object.entries(values)) el.textContent = String(fmt(next[k]));
    out.textContent = snippetFor(target);
  }

  function refresh() {
    if (!open) return;
    setMuzzleMarkerVisible(viewModel.weapon, true);
    const target = currentTarget();
    if (!target) {
      idEl.textContent = `(no ${tab})`;
      out.textContent =
        tab === 'gun'
          ? 'Equip a weapon that uses a .glb model.'
          : tab === 'muzzle'
            ? 'This weapon has no muzzle point.'
            : `This weapon has no ${tab} hand tagged.`;
      return;
    }
    if (target !== lastTargets[tab]) {
      lastTargets[tab] = target;
      baselines[tab] = readTarget(target);
      idEl.textContent = `${viewModel.weaponId || ''} · ${tab}`;
      syncUiFromTarget(target);
    } else {
      idEl.textContent = `${viewModel.weaponId || ''} · ${tab}`;
    }
  }

  function setTab(next) {
    tab = next;
    for (const btn of tabBtns) btn.classList.toggle('active', btn.dataset.tab === tab);
    lastTargets[tab] = null;
    refresh();
  }

  for (const el of Object.values(inputs)) {
    el.addEventListener('input', applyFromUi);
  }

  for (const btn of tabBtns) {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  }

  panel.addEventListener('click', async (e) => {
    const act = e.target?.dataset?.act;
    if (act === 'close') {
      setOpen(false);
      return;
    }
    if (act === 'reset') {
      const target = currentTarget();
      if (target && baselines[tab]) {
        writeTarget(target, baselines[tab]);
        syncUiFromTarget(target);
      }
      return;
    }
    if (act === 'copy' || act === 'copy-all') {
      const text = act === 'copy-all' ? allSnippet() : snippetFor(currentTarget());
      out.textContent = text;
      try {
        await navigator.clipboard.writeText(text);
        out.textContent = `${text}\n\n// copied`;
      } catch {
        out.textContent = `${text}\n\n// copy failed — select manually`;
      }
      return;
    }
    if (act === 'save') {
      await saveToCode();
    }
  });

  panel.addEventListener('mousedown', (e) => e.stopPropagation());
  panel.addEventListener('wheel', (e) => e.stopPropagation());

  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    setMuzzleMarkerVisible(viewModel.weapon, open);
    if (open) {
      lastTargets = { gun: null, trigger: null, support: null, muzzle: null };
      refresh();
      let tries = 0;
      const wait = setInterval(() => {
        refresh();
        if (lastTargets[tab] || ++tries > 40) clearInterval(wait);
      }, 100);
    }
  }

  window.vmTune = () => setOpen(true);
  window.vmTuneClose = () => setOpen(false);
  window.toggleVmTune = () => setOpen(!open);
  window.vmTuneDump = () => {
    const text = allSnippet();
    console.log(text);
    return text;
  };

  const prevSetWeapon = viewModel.setWeapon.bind(viewModel);
  viewModel.setWeapon = (id) => {
    prevSetWeapon(id);
    if (open) {
      lastTargets = { gun: null, trigger: null, support: null, muzzle: null };
      setTimeout(() => {
        setMuzzleMarkerVisible(viewModel.weapon, true);
        refresh();
      }, 50);
      setTimeout(refresh, 250);
      setTimeout(refresh, 800);
    }
  };
}
