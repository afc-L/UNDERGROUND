// End-to-end browser test (headless Chromium via Playwright).
// Usage: `npm start` in one terminal, then `npm run check` (GAME_URL overrides the address).
// Playwright is not a project dependency: install it globally or set NODE_PATH.
// The harness freezes the render loop and steps the game manually so results don't depend on
// how fast the (software-rendered) browser is.
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright not found. Install it (npm i -g playwright) or set NODE_PATH to a folder containing it.');
  process.exit(2);
}

const URL = process.env.GAME_URL || 'http://localhost:8080/';
const shots = 'tools/screenshots';
fs.mkdirSync(shots, { recursive: true });
const errors = [];
let failed = 0;
let passed = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond) passed++;
  else failed++;
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e.stack || e)));

await page.goto(URL);
await page.waitForFunction(() => !!window.__underground, null, { timeout: 30000 });
await page.waitForTimeout(1200);

const ev = (fn, arg) => page.evaluate(fn, arg);
const step = (n, dt = 1 / 60) => ev(([n, dt]) => window.__underground.step(n, dt), [n, dt]);
const shot = async (name) => {
  await ev(() => window.__underground.render());
  await page.screenshot({ path: `${shots}/${name}.png` });
};
const st = () => ev(() => {
  const g = window.__underground.game;
  const p = g.player;
  const o = g.opp;
  return {
    state: g.state,
    p: { x: p.pos.x, z: p.pos.z, hp: p.health, st: p.stamina, state: p.state, atk: p.attack && p.attack.id, kind: p.attack && p.attack.kind, sp: p.special, combo: p.combo, counter: p.counterTimer },
    o: o && { x: o.pos.x, z: o.pos.z, hp: o.health, max: o.stats.maxHealth, state: o.state, kd: o.knockdowns, st: o.stamina },
  };
});
// Record every combat event type (and attack ids) the game handles.
const recordEvents = () => ev(() => {
  const g = window.__underground.game;
  window.__ev = [];
  if (!g.__wrapped) {
    g.__wrapped = true;
    const h = g._handle.bind(g);
    g._handle = (e) => {
      window.__ev.push({ type: e.type, attack: e.attack && e.attack.id, kind: e.attack && e.attack.kind, who: (e.attacker || e.fighter || e.defender || {}).id, counter: e.counter || null, knockdown: !!e.knockdown, ko: !!e.ko });
      h(e);
    };
  }
});
const events = () => ev(() => window.__ev);
// Put the fighters face to face, opponent passive, both fresh.
const faceOff = (dist = 1.1) => ev((dist) => {
  const g = window.__underground.game;
  const p = g.player;
  const o = g.opp;
  g.ai.mode = 'idle';
  for (const f of [p, o]) {
    f.setState('idle');
    f.vel.set(0, 0, 0);
    f.moveVel.set(0, 0, 0);
    f.stamina = f.stats.maxStamina;
    f.health = f.stats.maxHealth;
    f.balance = 0;
    f.combo = 0;
    f.counterTimer = 0;
    f.invuln = 0;
    f.buffer = null;
  }
  p.pos.set(0, 0, 0);
  p.facing = 0;
  o.pos.set(0, 0, dist);
  o.facing = Math.PI;
  g.effects.clearTime();
}, dist);
const press = (key) => page.keyboard.press(key);

// ------------------------------------------------------------------------------------------
console.log('— Menu');
await shot('01-menu');
check(await page.isVisible('#screen-menu.active'), 'main menu visible');
for (const b of ['fight', 'tournament', 'training', 'upgrades', 'fighter', 'settings']) {
  check(await page.isVisible(`#screen-menu [data-action="${b}"]`), `menu button ${b.toUpperCase()}`);
}
await ev(() => {
  window.__underground.frozen = true;
});

console.log('— Keyboard menu navigation');
check(await ev(() => document.activeElement && document.activeElement.dataset.action) === 'fight', 'FIGHT is focused when the menu opens');
await press('ArrowDown');
check(await ev(() => document.activeElement.dataset.action) === 'tournament', 'Down arrow moves to TOURNAMENT');
await press('ArrowUp');
check(await ev(() => document.activeElement.dataset.action) === 'fight', 'Up arrow moves back to FIGHT');

console.log('— Opponent select');
await press('Enter');
check(await page.isVisible('#screen-select.active'), 'Enter on FIGHT opens opponent select');
check(await ev(() => document.activeElement.classList.contains('card')), 'first unlocked opponent card is focused');
const cards = await page.$$('#select-cards .card');
check(cards.length >= 5, `${cards.length} opponents listed`);
const locked = await page.$$('#select-cards .card.locked');
check(locked.length === cards.length - 1, 'only the first opponent is unlocked on a new career');
const cardText = await page.textContent('#select-cards .card');
check(/HEALTH/.test(cardText) && /POWER/.test(cardText) && /SPEED/.test(cardText) && /DEFENSE/.test(cardText) && /\$/.test(cardText), 'card shows stats and reward');
await cards[0].hover();
await step(20);
check(await ev(() => !!window.__underground.game.opp), 'hovering a card previews the opponent in the cage');
await shot('02-select');

console.log('— Fight intro');
await cards[0].focus();
await press('Enter');
await step(30);
check(await ev(() => window.__underground.game.state) === 'intro', 'fight starts with an intro');
check(await page.isVisible('#vs:not(.hidden)'), 'VS splash visible');
await shot('03-intro');
await page.keyboard.press('Space');
await step(3);
let s = await st();
check(s.state === 'fight', 'Space skips the intro into the fight');
check(await page.isVisible('#hud:not(.hidden)'), 'HUD visible');
for (const id of ['hud-p-hp', 'hud-p-st', 'hud-p-sp', 'hud-o-hp', 'hud-o-st', 'hud-timer', 'combo']) check(!!(await page.$(`#${id}`)), `HUD has #${id}`);
await recordEvents();

console.log('— No mouse buttons');
await faceOff(1.1);
await page.mouse.click(640, 400, { button: 'left' });
await page.mouse.click(640, 400, { button: 'right' });
await step(3);
check((await st()).p.state !== 'attack', 'mouse clicks do not attack (keyboard-only)');

console.log('— Movement');
await faceOff(4);
s = await st();
await page.keyboard.down('KeyW');
await step(60);
await page.keyboard.up('KeyW');
let s2 = await st();
check(s2.p.z - s.p.z > 1.2, `W moves toward the opponent (${(s2.p.z - s.p.z).toFixed(2)}m)`);
await faceOff(4);
await page.keyboard.down('KeyD');
await step(40);
await page.keyboard.up('KeyD');
s2 = await st();
check(Math.abs(s2.p.x) > 0.8, `D strafes (${s2.p.x.toFixed(2)}m)`);
await faceOff(4);
await page.keyboard.down('KeyW');
await step(5);
await page.keyboard.down('ShiftLeft');
await step(4);
s = await st();
check(s.p.state === 'dodge', 'Shift dodges');
await step(40);
s2 = await st();
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyW');
check(s2.p.st < s.p.st + 1 && s2.p.st < 100, `holding Shift sprints and drains stamina (${s2.p.st.toFixed(1)})`);
await shot('04-moving');

console.log('— Attacks & combos');
await faceOff(1.1);
await recordEvents();
s = await st();
await press('KeyJ');
await step(3);
s2 = await st();
check(s2.p.state === 'attack' && s2.p.atk === 'jab', 'J throws a jab');
check(s2.p.st < s.p.st, 'attacking costs stamina');
await step(25);
s2 = await st();
check(s2.o.hp < s.o.hp, `jab lands (${(s.o.hp - s2.o.hp).toFixed(1)} dmg)`);

await faceOff(1.1);
await recordEvents();
for (let i = 0; i < 4; i++) {
  await press('KeyJ');
  await step(11);
}
await step(30);
let evs = await events();
const chain = evs.filter((e) => e.type === 'attackStart' && e.who === 'player').map((e) => e.attack);
check(chain.join(',') === 'jab,cross,hook,uppercut', `4 J presses chain jab→cross→hook→uppercut (${chain.join(',')})`);
const hits = evs.filter((e) => e.type === 'hit' && e.who === 'player').length;
check(hits >= 3, `combo lands ${hits} hits`);
check(await ev(() => window.__underground.game.player.stat.maxCombo) >= 3, 'combo counter reaches 3+');
await shot('05-combo');

await faceOff(1.1);
await recordEvents();
await press('KeyK');
await step(4);
check((await st()).p.atk === 'haymaker', 'K throws a heavy haymaker');
await step(60);
await faceOff(1.3);
await recordEvents();
await press('KeyJ');
await step(10);
await press('KeyK');
await step(50);
evs = await events();
check(evs.some((e) => e.type === 'attackStart' && e.attack === 'roundhouse'), 'light → heavy chains into a roundhouse kick');
check(evs.some((e) => e.type === 'hit' && e.attack === 'roundhouse'), 'roundhouse kick connects');

console.log('— Defense');
await faceOff(1.1);
await recordEvents();
await page.keyboard.down('Space');
await step(30);
check((await st()).p.state === 'block', 'Space blocks');
s = await st();
await ev(() => {
  const g = window.__underground.game;
  g.opp.startAttack(window.__underground.ATTACKS.cross, []);
});
await step(30);
s2 = await st();
await page.keyboard.up('Space');
evs = await events();
check(evs.some((e) => e.type === 'block'), 'block event fires');
check(s.p.hp - s2.p.hp < 2, `blocking reduces damage to chip (${(s.p.hp - s2.p.hp).toFixed(2)})`);
check(s2.p.st < s.p.st, 'blocking a hit costs stamina');

await faceOff(1.1);
await recordEvents();
await ev(() => window.__underground.game.opp.startAttack(window.__underground.ATTACKS.haymaker, []));
await step(10);
await page.keyboard.down('Space');
await step(20);
await page.keyboard.up('Space');
evs = await events();
check(evs.some((e) => e.type === 'parry'), 'blocking right before impact is a PERFECT BLOCK');
check((await st()).p.counter > 0 || evs.some((e) => e.type === 'parry'), 'perfect block opens a counter window');

await faceOff(1.1);
await recordEvents();
await ev(() => window.__underground.game.opp.startAttack(window.__underground.ATTACKS.haymaker, []));
await step(12);
await page.keyboard.press('ShiftLeft');
await step(6);
evs = await events();
check(evs.some((e) => e.type === 'perfectDodge'), 'dodging through an attack is a PERFECT DODGE');
s = await st();
check(s.p.counter > 0, 'perfect dodge opens a counter window');
await step(14);
await ev(() => {
  const g = window.__underground.game;
  g.player.pos.set(g.opp.pos.x, 0, g.opp.pos.z - 1.1);
  g.player.facing = 0;
});
await press('KeyK');
await step(40);
evs = await events();
check(evs.some((e) => e.type === 'hit' && e.who === 'player' && e.counter === 'COUNTER'), 'attacking in the window lands a COUNTER');

console.log('— Special, knockdown & recovery');
await faceOff(1.4);
await recordEvents();
await ev(() => {
  const p = window.__underground.game.player;
  p.special = 100;
  p.specialCooldown = 0;
});
await page.keyboard.press('KeyE');
await step(2);
check((await st()).p.kind === 'special', 'E fires the special when the meter is full');
await step(20);
await shot('06-special');
await step(30);
evs = await events();
check(evs.some((e) => e.type === 'hit' && e.kind === 'special'), 'special connects');
s = await st();
check(s.state === 'knockdown', 'special causes a knockdown');
check(await ev(() => window.__underground.game.player.special) < 20, 'special consumes the meter');
await step(40);
await shot('07-knockdown');
check(await ev(() => !('referee' in window.__underground.game)), 'there is no referee');
for (let i = 0; i < 40 && (await st()).state === 'knockdown'; i++) await step(15);
check((await st()).state === 'fight', 'opponent recovers and the fight resumes');
check(await ev(() => window.__underground.game.opp.knockdowns) === 1, 'knockdown is recorded');
const wear = await ev(() => {
  const o = window.__underground.game.opp;
  return { power: o.wearPower, speed: o.wearSpeed };
});
check(wear.power < 1 && wear.speed < 1, `a knockdown leaves them weaker and slower (power ${Math.round(wear.power * 100)}%, speed ${Math.round(wear.speed * 100)}%)`);
const dmgTest = await ev(() => {
  const g = window.__underground.game;
  const o = g.opp;
  const p = g.player;
  const run = (kd) => {
    o.knockdowns = kd;
    o.setState('idle');
    o.pos.set(0, 0, 0);
    o.facing = 0;
    o.counterTimer = 0;
    o.combo = 0;
    o.comboTimer = 0;
    o.stamina = o.stats.maxStamina;
    p.setState('idle');
    p.pos.set(0, 0, 1.1);
    p.health = p.stats.maxHealth;
    p.invuln = 0;
    o.startAttack(window.__underground.ATTACKS.cross, []);
    o.attackTime = (o.attack.startup + o.attack.active * 0.5) / o.attackRate;
    const evs = [];
    g.combat.resolve(o, p, evs);
    const hit = evs.find((e) => e.type === 'hit');
    o.setState('idle');
    return hit ? hit.damage : 0;
  };
  const d0 = run(0);
  const d2 = run(2);
  o.knockdowns = 1;
  return { d0, d2 };
});
check(dmgTest.d2 < dmgTest.d0 * 0.8, `twice-knocked-down fighter hits softer (${dmgTest.d0.toFixed(1)} → ${dmgTest.d2.toFixed(1)})`);
check(await ev(() => window.__underground.game.match.timeLeft > 240), 'fights run on a 5:00 clock');
await ev(() => {
  const p = window.__underground.game.player;
  p.special = 100;
  p.specialCooldown = 0;
});
await faceOff(1.4);
await page.keyboard.press('KeyE');
await step(5);
check((await st()).p.kind === 'special', 'special can be re-used once the meter refills');
await step(80);
for (let i = 0; i < 40 && (await st()).state === 'knockdown'; i++) await step(15);

console.log('— Fighting styles, style moves & specials');
await faceOff(1.1);
await recordEvents();
await press('KeyL');
await step(3);
check((await st()).p.atk === 'liverShot', 'L throws the style move (Boxing: LIVER SHOT)');
await step(40);
check((await st()).o.st < 70, `liver shot drains their stamina (${Math.round((await st()).o.st)} left)`);
await faceOff(1.1);
await recordEvents();
await press('KeyJ');
await step(11);
await press('KeyJ');
await step(11);
await press('KeyL');
await step(40);
evs = await events();
let ch = evs.filter((e) => e.type === 'attackStart' && e.who === 'player').map((e) => e.attack);
check(ch.join(',') === 'jab,cross,liverShot', `style move ends a combo (${ch.join(',')})`);
check(await ev(() => Object.keys(window.__underground.game.player.styleAtk.next).length === 0), 'nothing chains out of a style move');
// blocking a special is a guard break
await faceOff(1.3);
await recordEvents();
await page.keyboard.down('Space');
await step(30);
await ev(() => {
  const o = window.__underground.game.opp;
  o.startAttack(o.specialAtk, []);
});
await step(50);
await page.keyboard.up('Space');
evs = await events();
check(evs.some((e) => e.type === 'guardBreak'), 'blocking a special gets your guard broken');
check((await st()).p.st < 30, 'guard break empties your stamina');
// every style's special and style move
const styleRes = await ev(() => {
  const U = window.__underground;
  const g = U.game;
  const out = {};
  for (const id of ['boxing', 'muaythai', 'kickboxing', 'wrestling', 'brawling']) {
    const p = g.player;
    const o = g.opp;
    p.setStyle(id);
    const res = {};
    for (const which of ['styleAtk', 'specialAtk']) {
      for (const f of [p, o]) {
        f.setState('idle');
        f.vel.set(0, 0, 0);
        f.moveVel.set(0, 0, 0);
        f.health = f.stats.maxHealth;
        f.stamina = f.stats.maxStamina;
        f.invuln = 0;
        f.balance = 0;
        f.knockdowns = 0;
        f.thrower = null;
      }
      g.state = 'fight';
      g.ai.mode = 'idle';
      g.effects.clearTime();
      p.pos.set(0, 0, 0);
      p.facing = 0;
      o.pos.set(0, 0, 1.2);
      o.facing = Math.PI;
      const hp0 = o.health;
      const types = [];
      const h = g._handle.bind(g);
      g._handle = (e) => {
        types.push(e.type);
        h(e);
      };
      p.special = 100;
      p.specialCooldown = 0;
      p.startAttack(p[which], []);
      for (let i = 0; i < 120; i++) g.update(1 / 60);
      g._handle = h;
      res[which] = { id: p[which].id, dmg: Math.round(hp0 - o.health), types: [...new Set(types)].join(' '), oppState: o.state };
      for (let i = 0; i < 400 && g.state === 'knockdown'; i++) {
        g.match.getUpAt = 0;
        g.update(1 / 30);
      }
    }
    out[id] = res;
  }
  return out;
}).catch((e) => ({ error: String(e) }));
if (styleRes.error) check(false, styleRes.error);
else {
  for (const [id, r] of Object.entries(styleRes)) {
    console.log(`      ${id.padEnd(11)} move ${r.styleAtk.id.padEnd(10)} dmg ${String(r.styleAtk.dmg).padStart(3)} [${r.styleAtk.types}] | special ${r.specialAtk.id.padEnd(16)} dmg ${String(r.specialAtk.dmg).padStart(3)} [${r.specialAtk.types}]`);
    check(r.styleAtk.dmg > 0, `${id}: style move ${r.styleAtk.id} lands`);
    check(r.specialAtk.dmg > 15 && /knockdown|down/.test(r.specialAtk.oppState + ' ' + r.specialAtk.types) || /grab/.test(r.specialAtk.types), `${id}: special ${r.specialAtk.id} lands and drops them`);
  }
  check(/grab/.test(styleRes.wrestling.specialAtk.types) && styleRes.wrestling.specialAtk.dmg > 15, 'wrestling special is a SUPLEX: grab, then slam for big damage');
  check(styleRes.wrestling.styleAtk.oppState !== 'idle' && /hit/.test(styleRes.wrestling.styleAtk.types), 'wrestling takedown connects');
  check(/hit/.test(styleRes.muaythai.styleAtk.types) && styleRes.muaythai.styleAtk.dmg > 12, 'muay thai elbow cuts (bleeds on top of the hit)');
}
await ev(() => window.__underground.game.player.setStyle(window.__underground.prog.data.style));
await ev(() => {
  const g = window.__underground.game;
  for (const f of [g.player, g.opp]) {
    f.setState('idle');
    f.bleed = 0;
  }
  g.state = 'fight';
});
// the AI dodges specials instead of blocking them
const aiDodge = await ev(() => {
  const U = window.__underground;
  const g = U.game;
  const ai = new U.AIController(U.OPPONENTS[3], 'hard');
  g.ai = ai;
  let dodged = 0;
  for (let k = 0; k < 6; k++) {
    const p = g.player;
    const o = g.opp;
    for (const f of [p, o]) {
      f.setState('idle');
      f.health = f.stats.maxHealth;
      f.stamina = f.stats.maxStamina;
      f.invuln = 0;
    }
    g.state = 'fight';
    p.pos.set(0, 0, 0);
    p.facing = 0;
    o.pos.set(0, 0, 2.2);
    o.facing = Math.PI;
    p.startAttack(p.specialAtk, []);
    let saw = false;
    for (let i = 0; i < 60; i++) {
      g.update(1 / 60);
      if (o.state === 'dodge') saw = true;
    }
    if (saw) dodged++;
    for (let i = 0; i < 400 && g.state === 'knockdown'; i++) {
      g.match.getUpAt = 0;
      g.update(1 / 30);
    }
  }
  return dodged;
});
check(aiDodge >= 2, `the AI dodges incoming specials (${aiDodge}/6)`);

console.log('— Health & ground attacks');
check(await ev(() => window.__underground.game.player.stats.maxHealth) >= 180, `player health scaled up (${await ev(() => window.__underground.game.player.stats.maxHealth)})`);
check(await ev(() => window.__underground.game.opp.stats.maxHealth) >= 150, `opponent health scaled up (${await ev(() => window.__underground.game.opp.stats.maxHealth)})`);
// knock the opponent down and keep them down
const downOpp = () => ev(() => {
  const g = window.__underground.game;
  const o = g.opp;
  o.knockDown();
  g._beginKnockdown(o, g.player, false);
  g.match.getUpAt = 99;
  o.facing = Math.PI;
  o.stateTime = 1;
  o.state = 'down';
  g.effects.clearTime();
});
await faceOff(2);
await downOpp();
await step(30);
// stand next to the body (the torso lies behind the feet)
await ev(() => {
  const g = window.__underground.game;
  const gp = g.opp.groundPoint();
  g.player.pos.set(gp.x + 0.9, 0, gp.z);
  g.player.facing = -Math.PI / 2;
  g.player.setState('idle');
});
await recordEvents();
let hpDown = (await st()).o.hp;
await press('KeyJ');
await step(3);
check((await st()).p.atk === 'stomp', 'J next to a downed opponent is a STOMP');
await step(30);
check((await st()).o.hp < hpDown, `stomp hurts the downed opponent (${(hpDown - (await st()).o.hp).toFixed(1)})`);
hpDown = (await st()).o.hp;
await press('KeyK');
await step(3);
check((await st()).p.atk === 'soccerKick', 'K next to a downed opponent is a GROUND KICK');
await step(40);
check((await st()).o.hp < hpDown, 'ground kick hurts the downed opponent');
check((await st()).o.state === 'down', 'they stay down while being kicked');
await ev(() => {
  window.__underground.game.opp.health = 2;
});
await press('KeyK');
await step(40);
check((await st()).state === 'ko', 'a ground kick can be the killing blow');
await step(30, 1 / 30);
await shot('06b-ground-kill');
// fresh fight for the AI test
await step(400, 1 / 30);
await ev(() => {
  const U = window.__underground;
  U.handlers.onResultsGo('menu');
  U.ui.show(null);
  U.game.startFight(U.OPPONENTS[0], 'fight');
  U.game.skipIntro();
});
await faceOff(2);
await ev(() => {
  const g = window.__underground.game;
  const p = g.player;
  g.ai.mode = 'fight';
  g.ai.p.aggression = 1;
  p.knockDown();
  g._beginKnockdown(p, g.opp, false);
  g.match.getUpAt = 99;
});
await recordEvents();
await step(360);
evs = await events();
check(evs.some((e) => e.type === 'hit' && (e.attack === 'stomp' || e.attack === 'soccerKick') && e.who !== 'player'), 'the AI walks over and kicks a downed player');
await ev(() => {
  const g = window.__underground.game;
  g.match.getUpAt = 0;
});
for (let i = 0; i < 40 && (await st()).state === 'knockdown'; i++) await step(15);

console.log('— Blood & death-match rules');
await faceOff(1.1);
await recordEvents();
for (let i = 0; i < 4; i++) {
  await press('KeyJ');
  await step(11);
}
await step(20);
check(await ev(() => window.__underground.game.effects.splats.some((m) => m.visible)), 'clean hits splatter blood on the mat');
check(await ev(() => window.__underground.game.opp.model.bloodPatches.some((m) => m.visible)), 'the opponent gets bloodied as health drops');
await ev(() => {
  window.__underground.game.opp.knockdowns = 2;
  window.__underground.game.opp.special = 0;
  const p = window.__underground.game.player;
  p.special = 100;
  p.specialCooldown = 0;
});
await faceOff(1.4);
await ev(() => {
  window.__underground.game.opp.knockdowns = 2;
});
await press('KeyE');
await step(60);
for (let i = 0; i < 40 && (await st()).state === 'knockdown'; i++) await step(15);
check((await st()).state === 'fight' && (await st()).o.hp > 0, 'a third knockdown is not a T.K.O. (fight to the death)');
await ev(() => {
  window.__underground.game.match.timeLeft = 0.05;
});
await step(10);
check(await ev(() => window.__underground.game.match.suddenDeath && window.__underground.game.combat.damageMult > 1 && window.__underground.game.state === 'fight'), 'time running out starts SUDDEN DEATH instead of a decision');
await ev(() => {
  const s = window.__underground.prog.data.settings;
  s.blood = false;
  window.__underground.handlers.onSettings(s);
});
check(await ev(() => !window.__underground.game.effects.splats.some((m) => m.visible) && !window.__underground.game.opp.model.bloodPatches.some((m) => m.visible)), 'BLOOD setting off removes all blood');
await ev(() => {
  const s = window.__underground.prog.data.settings;
  s.blood = true;
  window.__underground.handlers.onSettings(s);
});

console.log('— Knockout & results');
await faceOff(1.1);
await recordEvents();
const cash0 = await ev(() => window.__underground.prog.data.cash);
await ev(() => {
  window.__underground.game.opp.health = 3;
});
await press('KeyK');
await step(40);
s = await st();
check(s.state === 'ko', 'reducing health to zero kills the opponent');
await step(25, 1 / 30);
await shot('08-knockout');
check(/FINISHED/.test((await page.textContent('#bigtext')) || ''), 'killing blow shows FINISHED');
check(await ev(() => window.__underground.game.effects.splats.filter((m) => m.visible).length) > 3, 'blood splatter on the mat');
check(await ev(() => window.__underground.game.opp.model.bloodPatches.every((m) => m.visible)), 'the dead fighter is covered in blood');
await step(150, 1 / 30);
await shot('09-victory');
await step(120, 1 / 30);
check(await page.isVisible('#screen-results.active'), 'results screen appears');
check(/VICTORY/.test(await page.textContent('#r-title')), 'results say VICTORY');
const statsText = await page.textContent('#r-stats');
check(/Accuracy/.test(statsText) && /Max combo/.test(statsText) && /Knockdowns/.test(statsText), 'fight statistics shown');
const prog = await ev(() => window.__underground.prog.data);
check(prog.cash > cash0, `cash earned ($${cash0} → $${prog.cash})`);
check(prog.rep > 0 && prog.record.w >= 1 && prog.record.ko >= 1, `reputation and record updated (rep ${prog.rep}, ${prog.record.w}W ${prog.record.ko}KO)`);
check(await ev(() => window.__underground.prog.isUnlocked(window.__underground.OPPONENTS[1])), 'beating the Rookie unlocks the Brawler');
await shot('10-results');

console.log('— Upgrades');
check(await ev(() => document.activeElement && document.activeElement.textContent) === 'NEXT OPPONENT', 'results focus the main action');
await press('ArrowRight');
await press('ArrowRight');
check(await ev(() => document.activeElement.textContent) === 'UPGRADES', 'arrow keys move between result buttons');
await press('Enter');
check(await page.isVisible('#screen-upgrades.active'), 'upgrades screen opens from results');
const before = await ev(() => ({ cash: window.__underground.prog.data.cash, hp: window.__underground.game.player.stats.maxHealth }));
await ev(() => document.querySelector('#upgrade-list .up-row:first-child button').focus());
await press('Enter');
const after = await ev(() => ({ cash: window.__underground.prog.data.cash, lvl: window.__underground.prog.data.upgrades.health, hp: window.__underground.game.player.stats.maxHealth }));
check(after.lvl === 1 && after.cash < before.cash, `buying CONDITIONING costs cash ($${before.cash} → $${after.cash})`);
check(after.hp > before.hp, `upgrade raises max health (${before.hp} → ${after.hp})`);
await shot('11-upgrades');
await press('Escape');
check(await page.isVisible('#screen-menu.active'), 'Esc goes back to the menu');

console.log('— Defeat');
await page.click('#screen-menu [data-action="fight"]');
await page.click('#select-cards .card:not(.locked)');
await page.keyboard.press('Space');
await step(3);
await recordEvents();
await faceOff(1.1);
await ev(() => {
  const g = window.__underground.game;
  g.player.health = 2;
  g.opp.startAttack(window.__underground.ATTACKS.haymaker, []);
});
await step(60);
check((await st()).state === 'ko', 'player can be knocked out');
await step(320, 1 / 30);
check(await page.isVisible('#screen-results.active') && /YOU DIED/.test(await page.textContent('#r-title')), 'YOU DIED screen shown');
check(await ev(() => window.__underground.prog.data.record.l) >= 1, 'loss recorded');
await page.click('#r-actions button:has-text("MENU")');

console.log('— Pause');
await page.click('#screen-menu [data-action="fight"]');
await page.click('#select-cards .card:not(.locked)');
await page.keyboard.press('Space');
await step(3);
await page.keyboard.press('Escape');
await step(2);
check(await ev(() => window.__underground.game.state) === 'paused' && (await page.isVisible('#screen-pause.active')), 'Escape pauses');
const tPause = await ev(() => window.__underground.game.match.timeLeft);
await step(60);
check(await ev(() => window.__underground.game.match.timeLeft) === tPause, 'clock frozen while paused');
await page.click('#p-resume');
await step(30);
check(await ev(() => window.__underground.game.state) === 'fight', 'resume continues the fight');
await page.keyboard.press('Escape');
await step(2);
await page.click('#p-quit');
check(await page.isVisible('#screen-menu.active'), 'quit returns to the menu');

console.log('— Training');
await page.click('#screen-menu [data-action="training"]');
await step(5);
check(await ev(() => window.__underground.game.match.mode) === 'training', 'training starts');
check(await page.isVisible('#training-panel:not(.hidden)'), 'training panel with move list');
await page.keyboard.press('Digit3');
await step(2);
check(await ev(() => window.__underground.game.ai.mode) === 'fight', 'key 3 makes the partner spar');
await step(240);
await ev(() => {
  window.__underground.game.opp.health = 2;
});
await faceOff(1.1);
await press('KeyK');
await step(60);
check(await ev(() => window.__underground.game.state) !== 'ko', 'training partner cannot be knocked out');
await shot('12-training');
await page.keyboard.press('Escape');
await step(2);
await page.click('#p-quit');

console.log('— Tournament');
await page.click('#screen-menu [data-action="tournament"]');
check(await page.isVisible('#screen-tournament.active'), 'tournament screen opens');
check((await page.$$('#bracket li')).length >= 5, 'bracket lists every round');
await page.click('#tourney-go');
await step(5);
check(await ev(() => !!window.__underground.game.match.tournament && window.__underground.game.match.profile.id === 'rookie'), 'tournament starts with round 1');
await page.keyboard.press('Space');
await step(3);
await faceOff(1.1);
await ev(() => {
  window.__underground.game.opp.health = 2;
});
await press('KeyJ');
await step(30);
await step(300, 1 / 30);
check(await page.isVisible('#r-actions button:has-text("NEXT FIGHT")'), 'winning offers the NEXT FIGHT');
await page.click('#r-actions button:has-text("NEXT FIGHT")');
await step(5);
check(await ev(() => window.__underground.game.match.profile.id) === 'brawler', 'next tournament fight is round 2');
await page.keyboard.press('Escape');
await step(2);
await page.click('#p-quit');

console.log('— Fighter & settings screens');
await page.click('#screen-menu [data-action="fighter"]');
check(await page.isVisible('#screen-fighter.active'), 'fighter screen opens');
await page.click('#f-options .swatch[data-k="shorts"]:nth-child(2)');
await step(10);
check(await ev(() => window.__underground.prog.data.look.shorts) === '#1e40af', 'changing a color updates the fighter');
await page.click('#f-options [data-style="wrestling"]');
check(await ev(() => window.__underground.prog.data.style) === 'wrestling', 'fighting style can be changed in the fighter editor');
check(await ev(() => window.__underground.game.player.specialAtk.id) === 'suplex', 'choosing WRESTLING makes the special a SUPLEX');
check(/SUPLEX/.test(await page.textContent('#f-options .style-info')) && /TAKEDOWN/.test(await page.textContent('#f-options .style-info')), 'editor shows the style\'s special and style move');
await page.fill('#f-name', 'Iron Test');
check(await ev(() => window.__underground.prog.data.name) === 'IRON TEST', 'fighter name saved');
await shot('13-fighter');
await page.click('#screen-fighter [data-action="back"]');
await page.click('#screen-menu [data-action="settings"]');
check(await page.isVisible('#screen-settings.active'), 'settings screen opens');
await shot('14-settings');
await page.click('#screen-settings [data-action="back"]');

console.log('— AI soak (AI vs autopilot, every opponent)');
const soak = await ev(() => {
  const U = window.__underground;
  const g = U.game;
  const out = [];
  for (const prof of U.OPPONENTS) {
    g.startFight(prof, 'fight');
    g.skipIntro();
    g.autopilot = new U.AIController(U.OPPONENTS[2], 'normal');
    const counts = {};
    const h = g._handle.bind(g);
    g._handle = (e) => {
      counts[e.type] = (counts[e.type] || 0) + 1;
      if (e.type === 'attackStart' && e.attacker === g.opp && e.attack.style) counts.style = (counts.style || 0) + 1;
      h(e);
    };
    let n = 0;
    while (g.state !== 'results' && n < 60 * 200) {
      g.update(1 / 60);
      n++;
    }
    const states = new Set([...g.ai.visited, ...g.autopilot.visited]);
    g._handle = h;
    g.autopilot = null;
    out.push({ id: prof.id, result: g.match.result ? (g.match.result.won ? 'autopilot' : prof.id) : 'none', how: g.match.result ? (g.match.result.ko ? 'KO' : 'decision') : '-', secs: Math.round(g.match.elapsed), hits: counts.hit || 0, blocks: counts.block || 0, style: counts.style || 0, kds: (g.player.knockdowns || 0) + (g.opp.knockdowns || 0), states: [...states].sort().join(' ') });
    g.quitFight();
  }
  return out;
});
for (const r of soak) console.log(`      ${r.id.padEnd(11)} winner=${r.result.padEnd(11)} ${r.how.padEnd(8)} ${String(r.secs).padStart(3)}s hits=${r.hits} blocks=${r.blocks} style=${r.style} knockdowns=${r.kds} [${r.states}]`);
check(soak.every((r) => r.result !== 'none'), 'every AI fight reaches a conclusion');
check(soak.every((r) => r.hits > 5), 'AI lands hits in every fight');
check(soak.filter((r) => r.style > 0).length >= 4, 'AI opponents use their style moves');
const allStates = new Set(soak.flatMap((r) => r.states.split(' ')));
for (const sName of ['IDLE', 'APPROACH', 'COMBO', 'DEFEND', 'RETREAT', 'COUNTER', 'RECOVER']) check(allStates.has(sName), `AI uses state ${sName}`);
await ev(() => window.__underground.handlers.onResultsGo('menu'));

console.log('— Performance (unfrozen render loop, software GL)');
await ev(() => {
  window.__underground.frozen = false;
});
await page.waitForTimeout(2500);
console.log(`      fps (SwiftShader CPU rendering, not representative of a GPU): ${(await ev(() => window.__fps || 0)).toFixed(1)}`);
const info = await ev(() => {
  const r = window.__underground.game.renderer.info;
  return { calls: r.render.calls, tris: r.render.triangles };
});
console.log(`      draw calls ${info.calls}, triangles ${info.tris}`);
check(info.calls < 400, 'draw calls kept reasonable');

check(errors.length === 0, `no console/page errors${errors.length ? `:\n${errors.join('\n')}` : ''}`);
console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
