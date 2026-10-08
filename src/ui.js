// DOM user interface: menus, opponent select, tournament, upgrades, fighter editor, settings,
// HUD, notifications and results. UI never touches game rules; it calls handlers from main.js.
import { OPPONENTS, DIFFICULTY, FIGHT, FIGHTER, KRONARI, CRUCIBLE } from './config.js';
import { UPGRADES, MAX_UPGRADE, upgradeCost, playerStats } from './upgrades.js';
import { xpForLevel } from './progression.js';
import { ATTACKS } from './attacks.js';
import { STYLES, STYLE_ORDER, styleOf } from './styles.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const LOOK_OPTIONS = {
  skin: ['#f1c9a5', '#e0ab8b', '#c68e62', '#a87452', '#8d5a3b', '#6b4430', '#4a2e20'],
  shorts: ['#c81e3c', '#1e40af', '#111111', '#f5f5f5', '#15803d', '#7c3aed', '#f59e0b', '#0e7490'],
  gloves: ['#d7263d', '#111111', '#f5f5f5', '#2563eb', '#f5c518', '#16a34a', '#a855f7', '#ff2a6d'],
  topColor: ['#1d1d22', '#e8e8e8', '#7f1d1d', '#1e3a8a', '#14532d', '#ff2a6d', '#f5c518'],
  hairColor: ['#0d0a08', '#3b2a1e', '#7a4b26', '#c9a26b', '#e6e6f0', '#ff2a6d', '#19d3ff'],
  hair: ['bald', 'buzz', 'short', 'mohawk', 'long'],
  top: ['none', 'tank', 'tee', 'hoodie'],
  accessory: ['none', 'headband', 'mask', 'chain'],
};

export class UI {
  constructor(handlers, prog, audio) {
    this.h = handlers;
    this.prog = prog;
    this.audio = audio;
    this.current = null;
    this.el = {
      hud: $('hud'),
      pHp: $('hud-p-hp'), pGhost: $('hud-p-ghost'), pSt: $('hud-p-st'), pSp: $('hud-p-sp'),
      oHp: $('hud-o-hp'), oGhost: $('hud-o-ghost'), oSt: $('hud-o-st'), oSp: $('hud-o-sp'),
      pName: $('hud-p-name'), oName: $('hud-o-name'), pKd: $('hud-p-kd'), oKd: $('hud-o-kd'),
      timer: $('hud-timer'), oppTitle: $('hud-opp-title'),
      combo: $('combo'), comboN: $('combo-n'), notify: $('notify'), big: $('bigtext'), count: $('count'), hint: $('hint'),
      lock: $('lock-ind'), training: $('training-panel'), tpMode: $('tp-mode'),
    };
    this._bindStatic();
  }

  _click() {
    this.audio.play('uiClick', { reverb: 0 });
  }

  _bindStatic() {
    document.querySelectorAll('#screen-menu [data-action]').forEach((b) => {
      b.addEventListener('click', () => {
        this._click();
        this.h.onMenu(b.dataset.action);
      });
    });
    document.querySelectorAll('[data-action="back"]').forEach((b) => b.addEventListener('click', () => {
      this._click();
      this.h.onBack();
    }));
    // Keyboard navigation for every menu screen: arrows move focus, Enter/Space activate.
    window.addEventListener('keydown', (e) => this._navKey(e));
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.screen.active') && this._lastFocus !== t) {
        this._lastFocus = t;
        this.audio.play('uiHover', { reverb: 0 });
      }
    });
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest && e.target.closest('.btn:not(:disabled), .card:not(.locked)')) {
        if (this._lastHover !== e.target) this.audio.play('uiHover', { reverb: 0 });
        this._lastHover = e.target;
      }
    });
    $('p-resume').addEventListener('click', () => { this._click(); this.h.onResume(); });
    $('p-restart').addEventListener('click', () => { this._click(); this.h.onRestart(); });
    $('p-quit').addEventListener('click', () => { this._click(); this.h.onQuit(); });
    $('tourney-go').addEventListener('click', () => { this._click(); this.h.onTournamentGo(); });
    $('cru-go').addEventListener('click', () => { this._click(); this.h.onCrucibleGo(); });
    $('tourney-forfeit').addEventListener('click', () => { this._click(); this.h.onTournamentForfeit(); });
    const name = $('f-name');
    name.addEventListener('input', () => {
      const v = name.value.toUpperCase().replace(/[^A-Z0-9 ._'-]/g, '').slice(0, 16);
      this.prog.data.name = v.trim() || 'NO NAME';
      this.prog.save();
    });
    name.addEventListener('keydown', (e) => e.stopPropagation());
  }

  show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    this.current = name;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (!name) return;
    const el = $(`screen-${name}`);
    if (el) el.classList.add('active');
    const r = { menu: 'renderMenu', select: 'renderSelect', crucible: 'renderCrucible', tournament: 'renderTournament', upgrades: 'renderUpgrades', fighter: 'renderFighter', settings: 'renderSettings' }[name];
    if (r) this[r]();
    this._focusFirst();
  }

  _focusables() {
    const screen = document.querySelector('.screen.active');
    if (!screen) return [];
    return [...screen.querySelectorAll('button:not(:disabled), input, select, [tabindex="0"]')].filter((el) => el.offsetParent !== null);
  }

  _focusFirst() {
    const list = this._focusables();
    if (!list.length) return;
    // prefer the main action of the screen over its BACK button
    const first = list.find((el) => el.matches('.primary, .card:not(.locked)')) || list.find((el) => !el.matches('.back')) || list[0];
    first.focus({ focusVisible: true });
  }

  /** Make a non-button element keyboard-activatable. */
  _activatable(el) {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
        e.preventDefault();
        e.stopPropagation();
        el.click();
      }
    });
  }

  _navKey(e) {
    if (!document.querySelector('.screen.active')) return;
    const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
    const cur = document.activeElement;
    const typing = cur && cur.tagName === 'INPUT' && cur.type === 'text';
    if (typing && !['ArrowUp', 'ArrowDown', 'Enter', 'NumpadEnter'].includes(e.code)) return;
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && cur && cur.matches && cur.matches('input[type="checkbox"]')) {
      e.preventDefault();
      cur.click();
      return;
    }
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && typing) {
      e.preventDefault();
      this._move(0, 1);
      return;
    }
    const d = dirs[e.code];
    if (!d) return;
    // sliders and dropdowns use left/right to change their value
    if (cur && cur.matches && d[0] !== 0) {
      if (cur.matches('input[type="range"]')) return;
      if (cur.matches('select')) {
        e.preventDefault();
        const n = cur.options.length;
        cur.selectedIndex = (cur.selectedIndex + d[0] + n) % n;
        cur.dispatchEvent(new Event('change'));
        return;
      }
    }
    e.preventDefault();
    this._move(d[0], d[1]);
  }

  _move(dx, dy) {
    const list = this._focusables();
    if (!list.length) return;
    const cur = document.activeElement;
    if (!list.includes(cur)) {
      this._focusFirst();
      return;
    }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect();
      const x = q.left + q.width / 2 - cx;
      const y = q.top + q.height / 2 - cy;
      const along = dx ? x * dx : y * dy;
      const across = dx ? Math.abs(y) : Math.abs(x);
      if (along <= 4) continue;
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      best.focus({ focusVisible: true });
      best.scrollIntoView({ block: 'nearest' });
    }
  }

  _wallet() {
    const d = this.prog.data;
    return `<span class="cash">$${d.cash.toLocaleString()}</span><span class="rep">${d.rep} REP</span><span>LV ${d.level}</span>`;
  }

  // -------------------------------------------------------------------------------------------
  // Menus

  renderMenu() {
    const d = this.prog.data;
    $('menu-footer').innerHTML = `
      <span>FIGHTER <b>${esc(d.name)}</b></span>
      <span>CASH <b>$${d.cash.toLocaleString()}</b></span>
      <span>REP <b>${d.rep}</b></span>
      <span>LEVEL <b>${d.level}</b></span>
      <span>RECORD <b>${d.record.w}-${d.record.l}</b> (${d.record.ko} ${FIGHT.deathMatch ? 'KILLS' : 'KO'})</span>
      ${d.champion ? '<span><b style="color:var(--pink)">★ PIT CHAMPION ★</b></span>' : ''}`;
  }

  renderSelect() {
    $('select-wallet').innerHTML = this._wallet();
    const wrap = $('select-cards');
    wrap.innerHTML = '';
    const d = this.prog.data;
    OPPONENTS.forEach((o) => {
      const unlocked = this.prog.isUnlocked(o);
      const card = document.createElement('div');
      card.className = `card ${unlocked ? '' : 'locked'}`;
      card.style.setProperty('--accent', o.accent);
      const bar = (label, v) => `<div class="stat"><span>${label}</span><div class="sbar"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div></div>`;
      card.innerHTML = `
        <div class="c-diff ${o.difficulty}">${DIFFICULTY[o.difficulty].label}</div>
        <div class="c-title">${o.title}</div>
        <div class="c-name">${esc(o.name)}</div>
        <div class="c-style"><b class="c-fs">${styleOf(o.fightStyle).name}</b> · ${o.style}</div>
        ${bar('HEALTH', o.stats.health / 170)}
        ${bar('POWER', (o.stats.power - 0.5) / 0.95)}
        ${bar('SPEED', (o.stats.speed - 0.5) / 0.8)}
        ${bar('DEFENSE', (o.stats.defense - 0.5) / 0.8)}
        <div class="c-blurb">${o.blurb}</div>
        <div class="c-reward"><span class="cash">$${o.reward.cash}</span><span class="rep">+${o.reward.rep} REP</span><span>+${o.reward.xp} XP</span></div>
        ${d.wins[o.id] ? `<div class="c-beaten">DEFEATED ×${d.wins[o.id]}</div>` : ''}
        ${unlocked ? '' : `<div class="c-lock">LOCKED<small>${this.prog.lockReason(o)}</small></div>`}`;
      card.addEventListener('mouseenter', () => this.h.onPreview(o));
      card.addEventListener('focus', () => this.h.onPreview(o));
      this._activatable(card);
      card.addEventListener('click', () => {
        if (!unlocked) return;
        this._click();
        this.h.onPick(o);
      });
      wrap.appendChild(card);
    });
  }

  renderCrucible() {
    if (!this.cru) this.cru = { warrior: KRONARI[0], opp: KRONARI[2] };
    const sel = this.cru;
    const card = (k, role) => {
      const el = document.createElement('div');
      const chosen = sel[role] === k;
      el.className = `card kronari ${chosen ? 'chosen' : ''}`;
      el.style.setProperty('--accent', k.accent);
      const bar = (label, v) => `<div class="stat"><span>${label}</span><div class="sbar"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div></div>`;
      el.innerHTML = `
        <div class="c-title">${k.title}</div>
        <div class="c-name">${esc(k.name)}</div>
        <div class="c-style"><b class="c-fs">${styleOf(k.fightStyle).name}</b> · ${k.style}</div>
        ${bar('HEALTH', k.stats.health / 1300)}
        ${bar('POWER', (k.stats.power - 0.5) / 0.95)}
        ${bar('SPEED', (k.stats.speed - 0.5) / 0.8)}
        ${bar('DEFENSE', (k.stats.defense - 0.5) / 0.8)}
        <div class="c-blurb">${k.blurb}</div>
        <div class="c-reward"><span>${k.stats.health} HP</span><span class="cash">${ATTACKS[styleOf(k.fightStyle).special].name}</span></div>
        ${chosen ? `<div class="c-diff cru-tag">${role === 'warrior' ? 'YOU' : 'OPPONENT'}</div>` : ''}`;
      this._activatable(el);
      el.addEventListener('click', () => {
        sel[role] = k;
        this._click();
        if (role === 'opp') this.h.onPreview(k);
        this.renderCrucible();
        const again = $(`cru-${role}`).querySelector(`[data-id="${k.id}"]`);
        if (again) again.focus({ focusVisible: true });
      });
      el.dataset.id = k.id;
      return el;
    };
    for (const role of ['warrior', 'opp']) {
      const wrap = $(`cru-${role}`);
      wrap.innerHTML = '';
      for (const k of KRONARI) wrap.appendChild(card(k, role));
    }
    $('cru-go').textContent = `ENTER THE CRUCIBLE: ${sel.warrior.title} VS ${sel.opp.title}`;
    $('cru-wins').textContent = this.prog.data.crucibleWins ? `CRUCIBLE KILLS: ${this.prog.data.crucibleWins}` : '';
  }

  renderTournament() {
    const t = this.h.getTournament();
    $('tourney-wallet').innerHTML = this._wallet();
    const names = ['ROUND 1', 'ROUND 2', 'QUARTERFINAL', 'SEMIFINAL', 'ELIMINATOR', 'FINAL'];
    $('bracket').innerHTML = OPPONENTS.map((o, i) => {
      let cls = '';
      let st = '';
      if (t) {
        if (i < t.round) {
          cls = 'done';
          st = 'WON';
        } else if (i === t.round && !t.done) {
          cls = 'current';
          st = 'NEXT';
        }
      }
      return `<li class="${cls}"><span class="rd">${names[i] || `ROUND ${i + 1}`}</span><span style="color:${o.accent}">${o.title}</span><span class="st">${st}</span></li>`;
    }).join('');
    const p = this.h.tournamentPrize;
    $('tourney-prize').textContent = `GRAND PRIZE: $${p.cash.toLocaleString()} · +${p.rep} REP · +${p.xp} XP${this.prog.data.tournamentWins ? `  —  TITLES WON: ${this.prog.data.tournamentWins}` : ''}`;
    $('tourney-go').textContent = t ? `CONTINUE — FIGHT ${t.round + 1}` : 'START TOURNAMENT';
    $('tourney-forfeit').classList.toggle('hidden', !t);
  }

  renderUpgrades() {
    const d = this.prog.data;
    $('up-wallet').innerHTML = this._wallet();
    const list = $('upgrade-list');
    list.innerHTML = '';
    for (const u of UPGRADES) {
      const lvl = d.upgrades[u.id];
      const cost = upgradeCost(u.id, lvl);
      const row = document.createElement('div');
      row.className = 'up-row';
      row.innerHTML = `
        <div class="up-icon">${u.icon}</div>
        <div><div class="up-name">${u.name}</div><div class="up-desc">${u.desc} per level</div>
          <div class="pips">${Array.from({ length: MAX_UPGRADE }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
        <button class="btn up-buy" ${cost == null || d.cash < cost ? 'disabled' : ''}>${cost == null ? 'MAXED' : `BUY<span class="cost">$${cost}</span>`}</button>`;
      row.querySelector('button').addEventListener('click', () => {
        if (this.h.onBuy(u.id)) {
          this.audio.play('purchase');
          this.renderUpgrades();
          const rows = $('upgrade-list').querySelectorAll('.up-row');
          const i = UPGRADES.indexOf(u);
          const b = rows[i] && rows[i].querySelector('button');
          if (b && !b.disabled) b.focus({ focusVisible: true });
          else this._focusFirst();
        }
      });
      list.appendChild(row);
    }
    const s = playerStats(d);
    const note = document.createElement('div');
    note.className = 'upgrade-note';
    note.style.gridColumn = '1 / -1';
    note.innerHTML = `CURRENT: <b>${s.maxHealth}</b> HP · <b>${s.maxStamina}</b> STAMINA · <b>${Math.round(s.power * 100)}%</b> POWER · <b>${Math.round(s.speed * 100)}%</b> SPEED · <b>${Math.round(s.regen * 100)}%</b> REGEN · <b>${Math.round(s.meterGain * 100)}%</b> METER GAIN. Earn cash by winning fights.`;
    list.appendChild(note);
  }

  renderFighter() {
    const d = this.prog.data;
    $('f-name').value = d.name === 'NO NAME' ? '' : d.name;
    $('f-name').placeholder = 'NO NAME';
    const L = d.look;
    const opts = $('f-options');
    const swatchRow = (label, key) => `<div class="opt-row"><div class="lbl">${label}</div><div class="swatches">${LOOK_OPTIONS[key].map((c) => `<div class="swatch ${L[key] === c ? 'sel' : ''}" data-k="${key}" data-v="${c}" style="background:${c}"></div>`).join('')}</div></div>`;
    const chipRow = (label, key) => `<div class="opt-row"><div class="lbl">${label}</div><div class="swatches">${LOOK_OPTIONS[key].map((c) => `<div class="chip ${L[key] === c ? 'sel' : ''}" data-k="${key}" data-v="${c}">${c.toUpperCase()}</div>`).join('')}</div></div>`;
    const st = styleOf(d.style);
    opts.innerHTML = `
      <div class="opt-row"><div class="lbl">FIGHTING STYLE</div><div class="swatches">${STYLE_ORDER.map((id) => `<div class="chip ${st.id === id ? 'sel' : ''}" data-style="${id}">${STYLES[id].name}</div>`).join('')}</div>
        <div class="style-info"><div><span>SPECIAL [E]</span><b>${ATTACKS[st.special].name}</b></div><div><span>STYLE MOVE [L]</span><b>${ATTACKS[st.move].name}</b></div><p>${st.blurb}</p></div></div>
      ${swatchRow('SKIN', 'skin')}
      ${chipRow('HAIR', 'hair')}
      ${swatchRow('HAIR COLOR', 'hairColor')}
      ${chipRow('TOP', 'top')}
      ${swatchRow('TOP COLOR', 'topColor')}
      ${swatchRow('SHORTS', 'shorts')}
      ${chipRow('EXTRA', 'accessory')}
      <div class="opt-row"><div class="lbl">BUILD</div>
        HEIGHT <input type="range" min="0.93" max="1.08" step="0.01" value="${L.build.height}" data-b="height" />
        BULK <input type="range" min="0.86" max="1.2" step="0.01" value="${L.build.bulk}" data-b="bulk" /></div>`;
    opts.querySelectorAll('[data-k], [data-style]').forEach((el) => this._activatable(el));
    opts.querySelectorAll('[data-style]').forEach((el) => el.addEventListener('click', () => {
      d.style = el.dataset.style;
      this._click();
      this.prog.save();
      this.h.onStyleChange();
      this.renderFighter();
      const again = opts.querySelector(`[data-style="${el.dataset.style}"]`);
      if (again) again.focus({ focusVisible: true });
    }));
    opts.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('click', () => {
      L[el.dataset.k] = el.dataset.v;
      if (el.dataset.k === 'accessory') L.accessoryColor = el.dataset.v === 'chain' ? '#f5c518' : '#ffffff';
      this._click();
      this.prog.save();
      this.h.onLookChange();
      this.renderFighter();
      const again = opts.querySelector(`[data-k="${el.dataset.k}"][data-v="${el.dataset.v}"]`);
      if (again) again.focus({ focusVisible: true });
    }));
    opts.querySelectorAll('[data-b]').forEach((el) => el.addEventListener('change', () => {
      L.build[el.dataset.b] = parseFloat(el.value);
      this.prog.save();
      this.h.onLookChange();
    }));
    const s = playerStats(d);
    const need = xpForLevel(d.level);
    $('f-stats').innerHTML = `
      <div><span>LEVEL</span><span>${d.level}</span></div><div><span>XP</span><span>${d.xp} / ${need}</span></div>
      <div class="xpbar"><i style="width:${Math.min(100, (d.xp / need) * 100)}%"></i></div>
      <div><span>RECORD</span><span>${d.record.w}W - ${d.record.l}L</span></div><div><span>${FIGHT.deathMatch ? 'KILLS' : 'KNOCKOUTS'}</span><span>${d.record.ko}</span></div>
      <div><span>CASH</span><span>$${d.cash}</span></div><div><span>REPUTATION</span><span>${d.rep}</span></div>
      <div><span>MAX HEALTH</span><span>${s.maxHealth}</span></div><div><span>MAX STAMINA</span><span>${s.maxStamina}</span></div>
      <div><span>POWER</span><span>${Math.round(s.power * 100)}%</span></div><div><span>SPEED</span><span>${Math.round(s.speed * 100)}%</span></div>
      <div><span>STYLE</span><span>${styleOf(d.style).name}</span></div><div><span>TITLES</span><span>${d.tournamentWins}</span></div><div><span>STATUS</span><span>${d.champion ? 'CHAMPION' : d.record.w ? 'CONTENDER' : 'UNKNOWN'}</span></div>`;
  }

  renderSettings() {
    const s = this.prog.data.settings;
    const body = $('settings-body');
    const slider = (key, label, min, max, step, fmt = (v) => `${Math.round(v * 100)}`) =>
      `<div class="set-row"><span>${label}</span><span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-s="${key}" /><span class="val">${fmt(s[key])}</span></span></div>`;
    body.innerHTML = `
      ${slider('master', 'MASTER VOLUME', 0, 1, 0.05)}
      ${slider('music', 'MUSIC VOLUME', 0, 1, 0.05)}
      ${slider('sfx', 'EFFECTS & CROWD', 0, 1, 0.05)}
      ${slider('sensitivity', 'MOUSE SENSITIVITY', 0.3, 2.5, 0.05)}
      ${slider('shake', 'CAMERA SHAKE', 0, 1.5, 0.05)}
      <div class="set-row"><span>INVERT MOUSE Y</span><input type="checkbox" data-c="invertY" ${s.invertY ? 'checked' : ''} /></div>
      <div class="set-row"><span>BLOOD</span><input type="checkbox" data-c="blood" ${s.blood !== false ? 'checked' : ''} /></div>
      <div class="set-row"><span>EXTREME GORE (DISMEMBERMENT, BROKEN BONES)</span><input type="checkbox" data-c="gore" ${s.gore !== false ? 'checked' : ''} /></div>
      <div class="set-row"><span>DAMAGE NUMBERS</span><input type="checkbox" data-c="damageNumbers" ${s.damageNumbers ? 'checked' : ''} /></div>
      <div class="set-row"><span>GRAPHICS QUALITY</span><select data-q="quality"><option value="high" ${s.quality === 'high' ? 'selected' : ''}>HIGH</option><option value="low" ${s.quality === 'low' ? 'selected' : ''}>LOW (FASTER)</option></select></div>
      <div class="set-row"><span>RESET CAREER</span><button class="btn danger" id="reset-btn">RESET PROGRESS</button></div>
      <p class="dim" style="font-size:12px">Graphics quality changes the crowd size and shadow resolution after a reload. Progress is saved in this browser only.</p>`;
    body.querySelectorAll('[data-s]').forEach((el) => el.addEventListener('input', () => {
      s[el.dataset.s] = parseFloat(el.value);
      el.nextElementSibling.textContent = Math.round(s[el.dataset.s] * 100);
      this.h.onSettings(s);
    }));
    body.querySelectorAll('[data-c]').forEach((el) => el.addEventListener('change', () => {
      s[el.dataset.c] = el.checked;
      this.h.onSettings(s);
    }));
    body.querySelector('[data-q]').addEventListener('change', (e) => {
      s.quality = e.target.value;
      this.h.onSettings(s);
    });
    let armed = false;
    $('reset-btn').addEventListener('click', (e) => {
      if (!armed) {
        armed = true;
        e.target.textContent = 'CLICK AGAIN TO CONFIRM';
        return;
      }
      this.h.onResetProgress();
      e.target.textContent = 'PROGRESS RESET';
    });
  }

  // -------------------------------------------------------------------------------------------
  // Fight presentation

  vsBanner(playerName, profile, tourney, crucible = false) {
    $('vs-p').textContent = playerName;
    $('vs-o').textContent = profile.name;
    $('vs-o-title').textContent = profile.title;
    $('vs-o-style').textContent = `${profile.style.toUpperCase()} · ${DIFFICULTY[profile.difficulty].label}`;
    $('vs-tourney').textContent = crucible ? `${CRUCIBLE.name} · NO CLOCK · NO MERCY` : tourney ? `${tourney.name} — FIGHT ${tourney.round + 1} OF ${tourney.opponents.length}` : FIGHT.deathMatch ? 'DEATH MATCH · NO RULES · NO MERCY' : 'UNSANCTIONED BOUT';
    $('vs').classList.remove('hidden');
  }

  hideVs() {
    $('vs').classList.add('hidden');
  }

  /** Remove any transient fight overlays (VS splash, big text, count). */
  clearOverlays() {
    this.hideVs();
    clearTimeout(this._bigT);
    clearTimeout(this._bigT2);
    this.el.big.className = '';
    this.el.big.textContent = '';
    this.hideCount();
  }

  showHud(match) {
    this.el.hud.classList.remove('hidden');
    this.el.training.classList.toggle('hidden', match.mode !== 'training');
    this.el.timer.classList.toggle('hidden', match.mode === 'training');
    this.setTrainingMode('idle');
    this._kdP = this._kdO = -1;
  }

  hideHud() {
    this.clearOverlays();
    this.el.hud.classList.add('hidden');
    this.el.combo.classList.remove('show');
    this.el.notify.innerHTML = '';
    this.hint('', false);
    this.hideCount();
  }

  setTrainingMode(m) {
    this.el.tpMode.textContent = { idle: 'PASSIVE', block: 'BLOCKING', fight: 'SPARRING' }[m];
  }

  updateHud(game) {
    const p = game.player;
    const o = game.opp;
    const m = game.match;
    if (!o || !m) return;
    const e = this.el;
    const set = (el, frac) => {
      const v = Math.max(0, Math.min(1, frac)).toFixed(4);
      if (el._v !== v) {
        el.style.transform = `scaleX(${v})`;
        el._v = v;
      }
    };
    set(e.pHp, p.health / p.stats.maxHealth);
    set(e.pGhost, p.displayHealth / p.stats.maxHealth);
    set(e.pSt, p.stamina / p.stats.maxStamina);
    set(e.pSp, p.special / FIGHTER.specialMax);
    set(e.oHp, o.health / o.stats.maxHealth);
    set(e.oGhost, o.displayHealth / o.stats.maxHealth);
    set(e.oSt, o.stamina / o.stats.maxStamina);
    set(e.oSp, o.special / FIGHTER.specialMax);
    e.pHp.classList.toggle('low', p.health / p.stats.maxHealth < 0.25);
    e.oHp.classList.toggle('low', o.health / o.stats.maxHealth < 0.25);
    e.pSt.classList.toggle('tired', p.exhausted);
    e.oSt.classList.toggle('tired', o.exhausted);
    const pr = p.specialReady;
    e.pSp.parentElement.classList.toggle('ready', pr);
    e.pSp.parentElement.parentElement.classList.toggle('ready', pr);
    const lbl = p.specialCooldown > 0 ? `RECHARGE ${Math.ceil(p.specialCooldown)}` : pr ? 'SPECIAL READY [E]' : 'SPECIAL';
    if (this._spl !== lbl) {
      $('hud-p-sp-label').textContent = lbl;
      this._spl = lbl;
    }
    e.oSp.parentElement.classList.toggle('ready', o.specialReady);
    if (e.pName.textContent !== p.name) e.pName.textContent = p.name;
    if (e.oName.textContent !== o.title) e.oName.textContent = o.title;
    const t = m.suddenDeath ? 'SUDDEN DEATH' : Number.isFinite(m.timeLeft) ? fmtTime(m.timeLeft) : '∞';
    if (e.timer.textContent !== t) e.timer.textContent = t;
    e.timer.classList.toggle('urgent', (m.timeLeft < 15 || m.suddenDeath) && m.mode !== 'training');
    e.timer.classList.toggle('sd', !!m.suddenDeath);
    const sub = m.mode === 'crucible' ? CRUCIBLE.name : m.mode === 'training' ? 'TRAINING' : m.tournament ? `FIGHT ${m.tournament.round + 1} / ${m.tournament.opponents.length}` : o.name;
    if (e.oppTitle.textContent !== sub) e.oppTitle.textContent = sub;
    if (this._kdP !== p.knockdowns) {
      this._kdP = p.knockdowns;
      e.pKd.innerHTML = Array.from({ length: FIGHT.maxKnockdowns }, (_, i) => `<span class="${i < p.knockdowns ? 'on' : ''}"></span>`).join('');
    }
    if (this._kdO !== o.knockdowns) {
      this._kdO = o.knockdowns;
      e.oKd.innerHTML = Array.from({ length: FIGHT.maxKnockdowns }, (_, i) => `<span class="${i < o.knockdowns ? 'on' : ''}"></span>`).join('');
    }
    const locked = game.lockPref;
    if (this._lk !== locked) {
      this._lk = locked;
      e.lock.textContent = locked ? '◎ LOCKED ON  [Q]' : '○ FREE CAMERA  [Q]';
      e.lock.classList.toggle('off', !locked);
    }
    // combo display fades when the chain expires
    if (p.combo < 2 && e.combo.classList.contains('show') && !this._comboHold) e.combo.classList.remove('show');
  }

  combo(n, lvl) {
    const e = this.el;
    if (n < 2) return;
    e.comboN.textContent = n;
    e.combo.classList.add('show');
    e.combo.classList.toggle('hot', n >= 5);
    e.combo.classList.toggle('fire', n >= 10);
    e.combo.classList.remove('bump');
    void e.combo.offsetWidth;
    e.combo.classList.add('bump');
    e.combo.style.transform = `scale(${Math.min(1.6, 1 + n * 0.04 + lvl * 0.03)})`;
    if (n === 3 || n === 5 || n === 10 || n === 15) this.notify(`${n} HIT COMBO!`, n >= 10 ? 'special big' : 'good');
  }

  comboBreak() {
    this.el.combo.classList.remove('show');
  }

  notify(text, cls = '', life = 1.2) {
    const n = document.createElement('div');
    n.className = `note ${cls}`;
    n.textContent = text;
    n.style.setProperty('--life', `${life}s`);
    this.el.notify.prepend(n);
    while (this.el.notify.children.length > 4) this.el.notify.lastChild.remove();
    setTimeout(() => n.remove(), (life + 0.4) * 1000);
  }

  bigText(text, cls = '', dur = 1.4) {
    const b = this.el.big;
    clearTimeout(this._bigT);
    clearTimeout(this._bigT2);
    b.className = '';
    b.textContent = text;
    void b.offsetWidth;
    b.className = `show ${cls}`;
    this._bigT = setTimeout(() => b.classList.add('hide'), dur * 1000);
    this._bigT2 = setTimeout(() => {
      b.className = '';
    }, dur * 1000 + 450);
  }

  count(n) {
    const c = this.el.count;
    c.textContent = n;
    c.classList.remove('show');
    void c.offsetWidth;
    c.classList.add('show');
  }

  hideCount() {
    this.el.count.classList.remove('show');
  }

  hint(text, on) {
    this.el.hint.textContent = text;
    this.el.hint.classList.toggle('show', !!on);
  }

  showPause(on) {
    if (on) this.show('pause');
    else this.show(null);
  }

  // -------------------------------------------------------------------------------------------
  // Results

  showResults({ result, stats, summary, profile, tournament, perfect, crucible }) {
    this.clearOverlays();
    const won = result.won;
    const title = $('r-title');
    const lethal = FIGHT.deathMatch && result.ko && (!!summary || !!crucible);
    title.textContent = won ? (tournament && tournament.done ? 'CHAMPION' : 'VICTORY') : lethal ? 'YOU DIED' : 'DEFEAT';
    title.className = `results-title ${won ? 'win' : 'lose'}`;
    const how = result.ko ? (result.tko ? 'T.K.O.' : 'KNOCKOUT') : 'JUDGES\' DECISION';
    $('r-sub').textContent = lethal
      ? `${won ? 'KILLED' : 'KILLED BY'} ${profile.title} · ${fmtTime(stats.time)}${perfect ? ' · UNTOUCHED' : ''}`
      : `${won ? 'DEFEATED' : 'LOST TO'} ${profile.title} BY ${how} · ${fmtTime(stats.time)}${perfect ? ' · UNTOUCHED' : ''}`;
    const acc = stats.thrown ? Math.round((stats.landed / stats.thrown) * 100) : 0;
    const row = (a, b) => `<div><span>${a}</span><span>${b}</span></div>`;
    $('r-stats').innerHTML = `<h4>FIGHT STATS</h4>
      ${row('Strikes landed', `${stats.landed} / ${stats.thrown}`)}
      ${row('Accuracy', `${acc}%`)}
      ${row('Damage dealt', Math.round(stats.damage))}
      ${row('Damage taken', Math.round(stats.oppDamage))}
      ${row('Max combo', stats.maxCombo)}
      ${row('Knockdowns scored', Math.max(0, stats.knockdowns - (won && result.ko ? 1 : 0)))}
      ${row('Counters', stats.counters)}
      ${row('Perfect blocks', stats.perfectBlocks)}
      ${row('Perfect dodges', stats.perfectDodges)}
      ${row('Specials used', stats.specials)}
      ${row('Bones broken', stats.bonesBroken || 0)}
      ${stats.fatal ? row('Fatal blows', stats.fatal) : ''}`;
    let rw = '<h4>REWARDS</h4>';
    if (summary) {
      rw += summary.lines.map(([k, v]) => row(k, `$${v}`)).join('');
      rw += `<div class="tot"><span class="cash">+$${summary.cash}</span><span class="rep">${summary.rep >= 0 ? '+' : ''}${summary.rep} REP</span><span class="xp">+${summary.xp} XP</span></div>`;
      if (summary.levelUps) rw += `<div class="lvl">LEVEL UP! NOW LEVEL ${summary.level}</div>`;
      for (const u of summary.unlocked) rw += `<div class="unlock">NEW OPPONENT UNLOCKED: ${u}</div>`;
      if (tournament && tournament.done) rw += `<div class="unlock">TOURNAMENT CHAMPION! +$${tournament.prize.cash} · +${tournament.prize.rep} REP</div>`;
      if (tournament && tournament.eliminated) rw += '<div class="unlock" style="color:var(--red)">ELIMINATED FROM THE TOURNAMENT</div>';
    } else if (crucible) rw += `<div><span>${CRUCIBLE.name}</span><span>EXHIBITION</span></div><div><span>Fought as</span><span>${crucible.title}</span></div><div><span>Crucible kills</span><span>${this.prog.data.crucibleWins || 0}</span></div><div class="dim" style="font-size:12px">No purse here: Kronari don't fight for money.</div>`;
    else rw += '<div><span>Training session</span><span>—</span></div>';
    $('r-rewards').innerHTML = rw;

    const actions = $('r-actions');
    actions.innerHTML = '';
    const btn = (label, fn, primary = false) => {
      const b = document.createElement('button');
      b.className = `btn ${primary ? 'primary' : ''}`;
      b.textContent = label;
      b.addEventListener('click', () => {
        this._click();
        fn();
      });
      actions.appendChild(b);
    };
    if (crucible) {
      btn('REMATCH', () => this.h.onRematch(), true);
      btn('THE CRUCIBLE', () => this.h.onResultsGo('crucible'));
      btn('MENU', () => this.h.onResultsGo('menu'));
    } else if (tournament && !tournament.done && !tournament.eliminated) {
      btn('NEXT FIGHT', () => this.h.onTournamentNext(), true);
      btn('UPGRADES', () => this.h.onResultsGo('upgrades'));
      btn('MENU', () => this.h.onResultsGo('menu'));
    } else if (tournament) {
      btn('MENU', () => this.h.onResultsGo('menu'), true);
      btn('UPGRADES', () => this.h.onResultsGo('upgrades'));
    } else {
      btn(won ? 'NEXT OPPONENT' : 'CHOOSE OPPONENT', () => this.h.onResultsGo('select'), true);
      btn('REMATCH', () => this.h.onRematch());
      btn('UPGRADES', () => this.h.onResultsGo('upgrades'));
      btn('MENU', () => this.h.onResultsGo('menu'));
    }
    this.show('results');
  }
}
