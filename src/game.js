// Match orchestration. Owns the fighters, runs the simulation (controllers → fighters → combat),
// and turns combat events into feedback: sound, particles, hit-stop, slow motion, camera,
// crowd and HUD. Fight flow: intro → fight ⇄ knockdown → ko/decision → results.
import * as THREE from 'three';
import { SIM, FIGHT, FIGHTER, OPPONENTS, TRAINING_DUMMY, TOURNAMENT } from './config.js';
import { ATTACKS } from './attacks.js';
import { Fighter, emptyIntent } from './fighter.js';
import { Combat } from './combat.js';
import { AIController } from './ai.js';
import { Arena } from './arena.js';
import { Effects } from './effects.js';
import { CameraRig } from './camera.js';
import { FighterModel } from './fighterModel.js';
import { playerStats, opponentStats } from './upgrades.js';
import { TAUNT, GUARD } from './poses.js';

const HITSTOP = [0, 0.03, 0.045, 0.065, 0.09, 0.12, 0.14];

export class Game {
  constructor({ renderer, scene, camera, audio, progression, ui, input, dom }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.prog = progression;
    this.ui = ui;
    this.input = input;
    this.state = 'menu';
    this.arena = new Arena(scene, progression.data.settings.quality);
    this.effects = new Effects(scene, camera, dom);
    this.rig = new CameraRig(camera);
    this.combat = new Combat();
    this.events = [];
    this.timers = [];
    this.excite = 0.2;
    this.exciteBase = 0.2;
    this.time = 0;
    this.lockPref = true;
    this.match = null;
    this.player = null;
    this.opp = null;
    this.preview = null;
    this.shadowboxT = 1;
    this.noIntent = emptyIntent();
    this._v = new THREE.Vector3();
    this.buildPlayer();
    this.applySettings(progression.data.settings);
    this.toMenu();
  }

  // -------------------------------------------------------------------------------------------
  // Setup

  applySettings(s) {
    this.rig.sensitivity = s.sensitivity;
    this.rig.invertY = s.invertY;
    this.rig.shakeScale = s.shake;
    this.effects.showNumbers = s.damageNumbers;
    this.effects.bloodOn = s.blood !== false;
    FighterModel.bloodEnabled = s.blood !== false;
    if (!this.effects.bloodOn) this.effects.clearBlood();
    for (const f of [this.player, this.opp]) if (f) f.model.setBlood(f.inFight ? 1 - f.health / f.stats.maxHealth : 0);
    this.audio.setVolumes(s);
    const hi = s.quality === 'high';
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hi ? 1.75 : 1));
    this.arena.mainLight.castShadow = true;
    this.arena.shaft.visible = hi;
  }

  buildPlayer() {
    const d = this.prog.data;
    if (this.player) this.player.model.dispose();
    this.player = new Fighter({ id: 'player', name: d.name, title: d.name, look: d.look, accent: '#ff2a6d', isPlayer: true, stats: playerStats(d) });
    this.scene.add(this.player.model.root);
  }

  refreshPlayerStats() {
    this.player.stats = { ...this.player.stats, ...playerStats(this.prog.data) };
    this.player.name = this.player.title = this.prog.data.name;
  }

  _makeOpponent(profile) {
    if (this.opp) this.opp.model.dispose();
    this.opp = new Fighter({ id: profile.id, name: profile.name, title: profile.title, look: profile.look, accent: profile.accent, stats: opponentStats(profile) });
    this.scene.add(this.opp.model.root);
    return this.opp;
  }

  // -------------------------------------------------------------------------------------------
  // Menu / preview states

  toMenu() {
    this.state = 'menu';
    this.match = null;
    this.input.enabled = false;
    this.input.unlockPointer();
    this.effects.clearTime();
    this.rig.endCinematic();
    this.rig.mode = 'menu';
    this.timers = [];
    this.refreshPlayerStats();
    this.player.reset();
    this.menuHome = new THREE.Vector3(-0.9, 0, 0.4);
    this.player.pos.copy(this.menuHome);
    this.player.facing = 0.6;
    this.player.state = 'intro';
    this.player.introPose = GUARD;
    if (this.opp) {
      this.opp.model.dispose();
      this.opp = null;
    }
    this.exciteBase = 0.18;
    this.audio.setMusic('menu');
  }

  /** Show an opponent standing in the cage (opponent select screen). */
  previewOpponent(profile) {
    if (this.state !== 'menu') return;
    if (!profile) {
      if (this.opp) this.opp.model.dispose();
      this.opp = null;
      return;
    }
    if (this.opp && this.opp.id === profile.id) return;
    const o = this._makeOpponent(profile);
    o.pos.set(1.3, 0, -0.3);
    o.facing = -2.2;
    o.state = 'intro';
    o.introPose = TAUNT;
  }

  focusPlayer(on) {
    if (this.state !== 'menu') return;
    this.rig.mode = on ? 'focus' : 'menu';
    if (on) this.menuHome.set(0, 0, 0);
    else this.menuHome.set(-0.9, 0, 0.4);
    this.player.pos.copy(this.menuHome);
    this.player.facing = on ? 0 : 0.6;
  }

  // -------------------------------------------------------------------------------------------
  // Fight setup

  /** mode: 'fight' | 'tournament' | 'training' */
  startFight(profile, mode = 'fight', tournament = null) {
    this.timers = [];
    this.input.endFrame(); // drop presses left over from the menus
    this.refreshPlayerStats();
    const p = this.player;
    const o = this._makeOpponent(profile);
    p.reset();
    o.reset();
    p.pos.set(0, 0, -3);
    p.facing = 0;
    o.pos.set(0, 0, 3);
    o.facing = Math.PI;
    p.state = o.state = 'intro';
    p.introPose = GUARD;
    o.introPose = TAUNT;
    this.ai = new AIController(profile, mode === 'training' ? 'easy' : profile.difficulty);
    if (mode === 'training') this.ai.mode = 'idle';
    this.combat.trainingInfinite = mode === 'training';
    this.combat.damageMult = 1;
    this.effects.clearBlood();
    this.match = {
      mode, profile, tournament,
      timeLeft: FIGHT.duration, elapsed: 0,
      over: false, result: null, lastHitReal: 0,
      count: 0, countTimer: 0, getUpAt: 0, downed: null,
      specialWarned: 0, trainingRegen: 0,
    };
    this.effects.clearTime();
    this.rig.mode = 'fight';
    this.rig.orbitOffset = 0;
    this.rig.yaw = 0;
    this.rig.pos.set(6, 6, 6);
    this.lockPref = true;
    this.exciteBase = 0.3;
    this.excite = 0.6;
    this.audio.setMusic('tense');
    this.audio.crowdReact('cheer', 0.8);

    if (mode === 'training') {
      this._beginFighting();
      this.ui.bigText('TRAINING', 'small', 1.2);
      return;
    }
    // Intro: sweeping camera, VS banner, then FIGHT!
    this.state = 'intro';
    this.rig.cinematic('intro', { angle0: 0.6 }, 3.0);
    this.ui.vsBanner(this.prog.data.name, profile, tournament);
    this.input.enabled = true;
    this.after(3.0, () => this._fightCall());
  }

  skipIntro() {
    if (this.state !== 'intro') return;
    this.timers = [];
    this.rig.endCinematic();
    this._fightCall();
  }

  _fightCall() {
    this.ui.hideVs();
    this.audio.play('bell', { vol: 0.9, reverb: 0.5 });
    this.ui.bigText('FIGHT!', 'fight', 0.9);
    this.audio.crowdReact('roar', 0.9);
    this.excite = 0.8;
    this._beginFighting();
  }

  _beginFighting() {
    this.state = 'fight';
    this.rig.endCinematic();
    this.player.inFight = this.opp.inFight = true;
    this.player.setState('idle');
    this.opp.setState('idle');
    this.input.enabled = true;
    this.audio.setMusic('fight');
    this.ui.showHud(this.match);
  }

  restart() {
    if (!this.match) return;
    const { profile, mode, tournament } = this.match;
    this.state = 'menu';
    this.startFight(profile, mode, tournament);
  }

  quitFight() {
    this.ui.hideHud();
    this.toMenu();
  }

  setPaused(on) {
    if (on && (this.state === 'fight' || this.state === 'knockdown' || this.state === 'intro')) {
      this.pausedFrom = this.state;
      this.state = 'paused';
      this.input.unlockPointer();
      this.ui.showPause(true, this.match);
    } else if (!on && this.state === 'paused') {
      this.state = this.pausedFrom;
      this.ui.showPause(false);
    }
  }

  after(sec, fn) {
    this.timers.push({ t: sec, fn });
  }

  // -------------------------------------------------------------------------------------------
  // Main loop

  update(realDt) {
    realDt = Math.min(realDt, 0.1);
    this.time += realDt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= realDt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }

    const paused = this.state === 'paused';
    const scale = paused ? 0 : this.effects.timeScale(realDt);
    const dt = Math.min(realDt, SIM.maxDt) * scale;

    if (this.state === 'menu') this._menuUpdate(dt);
    else if (!paused) this._fightUpdate(dt, realDt);

    // Animation + presentation
    if (!paused) {
      this.player.animate(dt, this.time);
      if (this.opp) this.opp.animate(dt, this.time);
      this.excite += (this.exciteBase - this.excite) * Math.min(1, realDt * 0.6);
      this.arena.update(realDt, Math.min(1, this.excite));
      this.arena.shaft.visible = this.state === 'menu' && this.prog.data.settings.quality === 'high';
      this.audio.setExcitement(Math.min(1, this.excite));
      this.effects.update(dt, realDt, window.innerWidth, window.innerHeight);
      if (this.player.stepped && this.state !== 'menu') this.audio.play('footstep', { vol: 0.25, rate: 0.9 + Math.random() * 0.2, reverb: 0.05 });
    }
    this.rig.update(paused ? 0 : realDt, {
      player: this.player, opp: this.opp, locked: this.lockPref && !!this.opp && !this.opp.isDown,
      bodies: this.state === 'menu' ? null : [this.player.pos, this.opp && this.opp.pos],
    });
    if (this.match && this.state !== 'menu') this.ui.updateHud(this);
  }

  _menuUpdate(dt) {
    // shadowboxing in the cage behind the menus
    const p = this.player;
    this.shadowboxT -= dt;
    if (p.state === 'attack') {
      p.update(dt, this.noIntent, null, this.events);
      if (p.state === 'idle') p.state = 'intro';
    } else {
      p.pos.lerp(this.menuHome, Math.min(1, dt * 3));
    }
    if (p.state !== 'attack' && this.shadowboxT <= 0 && this.rig.mode === 'menu') {
      this.shadowboxT = 0.6 + Math.random() * 1.6;
      const list = [ATTACKS.jab, ATTACKS.cross, ATTACKS.jab, ATTACKS.hook, ATTACKS.uppercut, ATTACKS.roundhouse];
      p.stamina = p.stats.maxStamina;
      p.startAttack(list[(Math.random() * list.length) | 0], this.events);
    }
    for (const ev of this.events) if (ev.type === 'attackStart') this.audio.play('whoosh', { vol: 0.15, reverb: 0.3 });
    this.events.length = 0;
  }

  _playerIntent() {
    const inp = this.input;
    const I = this.playerIntent || (this.playerIntent = emptyIntent());
    const b = this.rig.basis();
    let mx = 0;
    let mz = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) mz += 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) mz -= 1;
    if (inp.down('KeyD') || inp.down('ArrowRight')) mx += 1;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) mx -= 1;
    I.moveX = b.fx * mz + b.rx * mx;
    I.moveZ = b.fz * mz + b.rz * mx;
    const l = Math.hypot(I.moveX, I.moveZ);
    if (l > 1) {
      I.moveX /= l;
      I.moveZ /= l;
    }
    const shift = inp.down('ShiftLeft') || inp.down('ShiftRight');
    I.dodge = inp.hit('ShiftLeft') || inp.hit('ShiftRight');
    I.sprint = shift && !I.dodge;
    I.block = inp.down('Space');
    I.light = inp.hit('KeyJ');
    I.heavy = inp.hit('KeyK');
    I.special = inp.hit('KeyE') || inp.hit('KeyL');
    if (inp.hit('KeyQ')) {
      this.lockPref = !this.lockPref;
      this.ui.notify(this.lockPref ? 'LOCK-ON' : 'FREE CAMERA', 'small');
    }
    I.lock = this.lockPref;
    return I;
  }

  _fightUpdate(dt, realDt) {
    const m = this.match;
    const p = this.player;
    const o = this.opp;
    const inp = this.input;
    this.rig.mouse(inp.mouseDX, inp.mouseDY, this.lockPref);

    if (this.state === 'intro') {
      if (inp.hit('Space') || inp.hit('Enter') || inp.hit('KeyJ')) this.skipIntro();
      p.update(dt, this.noIntent, o, this.events);
      o.update(dt, this.noIntent, p, this.events);
      this.events.length = 0;
      inp.endFrame();
      return;
    }

    const live = this.state === 'fight' || this.state === 'knockdown';
    const pi = live ? (this.autopilot ? this.autopilot.update(dt, p, o, this.events) : this._playerIntent()) : this.noIntent;
    if (this.state === 'knockdown' && !p.isDown) {
      // while the opponent is down: move in and stomp / kick them (no special)
      pi.special = false;
    }
    if (m.mode === 'training') this._trainingKeys();
    const oi = this.state === 'fight' || this.state === 'knockdown' ? this.ai.update(dt, o, p, this.events) : this.noIntent;

    p.update(dt, pi, o, this.events);
    o.update(dt, oi, p, this.events);
    this.combat.resolve(p, o, this.events);

    if (this.state === 'fight' && m.mode !== 'training') {
      m.timeLeft -= dt;
      m.elapsed += dt;
      if (m.timeLeft <= 0) {
        m.timeLeft = 0;
        if (FIGHT.deathMatch) this._suddenDeath();
        else this._decision();
      }
    }
    if (m.mode === 'training') this._trainingUpdate(dt);
    if (this.state === 'knockdown') this._knockdownUpdate(dt, realDt);

    // special move aura + ready cue
    for (const f of [p, o]) {
      if (f.state === 'attack' && f.attack.kind === 'special') {
        const t = f.attackTime * f.attackRate;
        if (t < f.attack.startup + f.attack.active) {
          this.effects.aura(this._v.set(f.pos.x, 1.1, f.pos.z), f.accent, 2);
          this.effects.trail(f.model.gloveWorld(1, this._v), f.accent);
        }
      }
      if (f.specialReady && !f._readyCued) {
        f._readyCued = true;
        if (f === p) {
          this.audio.play('meterReady', { vol: 0.8 });
          this.ui.notify('SPECIAL READY — PRESS E', 'special');
        }
      } else if (!f.specialReady) f._readyCued = false;
    }

    for (const ev of this.events) this._handle(ev);
    this.events.length = 0;
    inp.endFrame();
  }

  _trainingKeys() {
    const inp = this.input;
    const modes = { Digit1: 'idle', Digit2: 'block', Digit3: 'fight' };
    for (const k in modes) {
      if (inp.hit(k)) {
        this.ai.mode = modes[k];
        this.ui.notify(`PARTNER: ${{ idle: 'PASSIVE', block: 'BLOCKING', fight: 'SPARRING' }[modes[k]]}`, 'small');
        this.ui.setTrainingMode(modes[k]);
      }
    }
    if (inp.hit('KeyR')) {
      this.player.special = FIGHTER.specialMax;
      this.player.specialCooldown = 0;
      this.player.stamina = this.player.stats.maxStamina;
      this.ui.notify('METER FILLED', 'small');
    }
  }

  _trainingUpdate(dt) {
    const o = this.opp;
    const p = this.player;
    this.match.trainingRegen += dt;
    if (this.match.trainingRegen > 2.5) {
      o.health = Math.min(o.stats.maxHealth, o.health + dt * 60);
      p.health = Math.min(p.stats.maxHealth, p.health + dt * 60);
    }
    if (p.health < 2) p.health = p.stats.maxHealth * 0.5;
    if (p.state !== 'knockdown' && p.state !== 'down') p.knockdowns = 0; // no lasting wear in training
    if (o.state !== 'knockdown' && o.state !== 'down') o.knockdowns = 0;
  }

  // -------------------------------------------------------------------------------------------
  // Event → feedback

  _handle(ev) {
    const fx = this.effects;
    const au = this.audio;
    const p = this.player;
    const pan = (pos) => {
      const b = this.rig.basis();
      return Math.max(-0.8, Math.min(0.8, ((pos.x - this.camera.position.x) * b.rx + (pos.z - this.camera.position.z) * b.rz) * 0.25));
    };
    switch (ev.type) {
      case 'attackStart': {
        const a = ev.attack;
        au.play('whoosh', { vol: a.kind === 'light' ? 0.25 : 0.45, rate: a.kind === 'light' ? 1.2 : 0.8, pan: pan(ev.attacker.pos) });
        if (ev.attacker === p && a.kind !== 'light') this.rig.zoom = Math.max(this.rig.zoom, 0.35);
        if (a.kind === 'special') {
          au.play('specialCharge', { vol: 1 });
          fx.slowmo(0.35, 0.55);
          const def = ev.attacker === p ? this.opp : p;
          this.rig.cinematic('special', { a: ev.attacker, b: def, side: Math.random() < 0.5 ? 1 : -1 }, 0.85);
          fx.speedLines(0.8);
          this.ui.notify(ev.attacker === p ? 'UNDERGROUND BREAKER!' : `${ev.attacker.title}: SPECIAL!`, 'special big');
          this.excite = Math.max(this.excite, 0.85);
          au.crowdReact('ooh', 0.8);
        }
        break;
      }
      case 'whiff':
        if (ev.attack.kind !== 'light' && Math.random() < 0.4) au.crowdReact('ooh', 0.3);
        break;
      case 'hit':
        this._onHit(ev, pan);
        break;
      case 'block':
        au.play('block', { vol: 0.6 + ev.attack.impact * 0.1, pan: pan(ev.point) });
        fx.impact(ev.point, 1, 0x9ec9ff, null);
        this.rig.addTrauma(0.05 + ev.attack.impact * 0.03);
        fx.hitstop(0.02);
        break;
      case 'parry': {
        au.play('parry', { vol: 0.9 });
        fx.impact(ev.point, 3, 0x7fdcff);
        fx.slowmo(0.4, 0.3);
        fx.screenFlash(0.18);
        this.rig.addTrauma(0.18);
        this.ui.notify(ev.defender === p ? 'PERFECT BLOCK!' : 'PARRIED!', ev.defender === p ? 'good' : 'bad');
        au.crowdReact('ooh', 0.6);
        this.excite += 0.15;
        break;
      }
      case 'guardBreak':
        au.play('guardBreak', { vol: 1 });
        fx.impact(ev.point, 3, 0xff8a3d);
        this.rig.addTrauma(0.3);
        fx.hitstop(0.08);
        this.ui.notify('GUARD BREAK!', ev.defender === p ? 'bad' : 'good');
        au.crowdReact('ooh', 0.8);
        this.excite += 0.2;
        break;
      case 'perfectDodge':
        au.play('dodge', { vol: 0.8 });
        au.play('slowmo', { vol: 0.5 });
        fx.slowmo(0.3, 0.4);
        this.rig.addTrauma(0.05);
        if (ev.fighter === p) this.ui.notify('PERFECT DODGE!', 'good');
        this.excite += 0.1;
        break;
      case 'dodge':
        au.play('dodge', { vol: 0.45, pan: pan(ev.fighter.pos) });
        fx.dustBurst(ev.fighter.pos.x, ev.fighter.pos.z, 6, 0.4);
        break;
      case 'fence':
        au.play('fence', { vol: Math.min(1, ev.speed / 8) });
        this.arena.rattleFence(ev.point.x, ev.point.z, Math.min(1, ev.speed / 8));
        this.rig.addTrauma(0.2);
        au.crowdReact('cheer', 0.5);
        this.excite += 0.15;
        break;
      case 'specialNotReady':
        if (ev.fighter === p && this.time - this.match.specialWarned > 1) {
          this.match.specialWarned = this.time;
          this.ui.notify(p.specialCooldown > 0 ? `SPECIAL RECHARGING ${Math.ceil(p.specialCooldown)}s` : 'SPECIAL METER NOT FULL', 'small');
        }
        break;
      case 'aiAdapt':
        if (this.match.mode !== 'training') this.ui.notify(ev.text.toUpperCase(), 'small warn');
        break;
      default:
        break;
    }
  }

  _onHit(ev, pan) {
    const fx = this.effects;
    const au = this.audio;
    const p = this.player;
    const a = ev.attack;
    const lvl = Math.min(6, ev.impact + (ev.combo >= 5 ? 1 : 0));
    const dir = this._v.set(ev.defender.pos.x - ev.attacker.pos.x, 0, ev.defender.pos.z - ev.attacker.pos.z).normalize().clone();
    const color = a.kind === 'special' ? ev.attacker.accent : ev.counter ? 0xffe14d : 0xffc870;
    au.play(a.sound, { vol: Math.min(1.3, 0.55 + lvl * 0.12), rate: 0.9 + Math.random() * 0.2, pan: pan(ev.point), reverb: 0.15 + lvl * 0.06 });
    if (lvl >= 4) au.play('impactHuge', { vol: 0.6 + (lvl - 4) * 0.25, reverb: 0.5 });
    fx.impact(ev.point, lvl, color, dir, { blood: true });
    ev.defender.model.setBlood(1 - Math.max(0, ev.defender.health) / ev.defender.stats.maxHealth);
    fx.hitstop(HITSTOP[lvl]);
    fx.damageNumber(ev.point, ev.damage, `${ev.counter ? 'counter' : ''} ${lvl >= 4 ? 'big' : ''} ${ev.defender === p ? 'taken' : ''}`);
    this.rig.addTrauma(0.06 + lvl * 0.075 + (ev.counter ? 0.1 : 0));
    this.rig.punch(lvl * 1.1);
    this.match.trainingRegen = 0;

    // HIT → SLOW MOTION → SHAKE → IMPACT → REACTION → NORMAL SPEED for the big ones
    if (lvl >= 4 && !ev.knockdown && !ev.ko) {
      fx.slowmo(0.3, 0.32 + (lvl - 4) * 0.1);
      fx.screenFlash(0.2 + (lvl - 4) * 0.12);
      fx.speedLines(0.6);
    } else if (lvl >= 3) fx.screenFlash(0.08);

    if (ev.defender === p) {
      fx.screenHurt(0.15 + lvl * 0.08);
      this.ui.comboBreak();
    } else {
      this.ui.combo(ev.combo, lvl);
    }
    if (ev.counter) {
      this.ui.notify(`${ev.counter}!`, ev.attacker === p ? 'good' : 'bad');
      au.play('parry', { vol: 0.35 });
    }
    if (ev.ground && ev.attacker === p && ev.combo === 1) this.ui.notify(a.name, 'small');
    if (ev.stagger) this.ui.notify(ev.defender === p ? 'STAGGERED' : 'THEY\'RE HURT!', ev.defender === p ? 'bad' : 'good');

    // crowd
    const exc = 0.04 + lvl * 0.05 + (ev.counter ? 0.1 : 0) + (ev.combo >= 5 ? 0.1 : 0);
    this.excite = Math.min(1.2, this.excite + exc);
    if (lvl >= 3 || ev.combo === 5 || ev.combo === 10) au.crowdReact(lvl >= 4 ? 'roar' : 'cheer', 0.3 + lvl * 0.12);

    if (ev.ko) this._beginKO(ev.attacker, ev.defender, false);
    else if (ev.knockdown) this._beginKnockdown(ev.defender, ev.attacker, ev.tko);
  }

  // -------------------------------------------------------------------------------------------
  // Knockdown sequence

  _beginKnockdown(down, up, tko) {
    const m = this.match;
    const fx = this.effects;
    this.state = 'knockdown';
    m.downed = down;
    m.up = up;
    m.count = 0;
    m.countTimer = -1.0; // first count after the fall
    m.tko = tko;
    fx.slowmo(0.25, 1.0);
    fx.screenFlash(0.45);
    fx.speedLines(1);
    this.rig.addTrauma(0.7);
    this.rig.punch(8);
    this.rig.cinematic('knockdown', { a: down, b: up }, 1.6); // then back to the fight camera so the standing fighter can move in
    this.audio.play('impactHuge', { vol: 1, reverb: 0.6 });
    this.audio.play('slowmo', { vol: 0.6 });
    this.audio.crowdReact('roar', 1.1);
    this.excite = 1.15;
    this.ui.bigText(tko ? 'KNOCKDOWN!' : 'KNOCKDOWN!', 'kd', 1.6);
    this.ui.comboBreak();
    this.after(0.55, () => {
      this.audio.play('bodyfall', { vol: 1, reverb: 0.5 });
      fx.dustBurst(down.pos.x - Math.sin(down.facing) * 0.9, down.pos.z - Math.cos(down.facing) * 0.9, 26, 1);
      this.rig.addTrauma(0.3);
    });
    // how long they stay down
    const hp = down.health / down.stats.maxHealth;
    if (down === this.player) m.getUpAt = 3 + down.knockdowns;
    else m.getUpAt = Math.round(Math.min(8, 2 + down.knockdowns + (1 - hp) * 3 + Math.random()));
    m.getUpAt = Math.max(2, Math.round(m.getUpAt / down.stats.recovery));
    if (down === this.player) this.ui.hint('MASH J / K TO GET UP FASTER!', true);
    else if (m.mode !== 'training') this.after(1.2, () => {
      if (this.state === 'knockdown' && m.downed && m.downed.state === 'down') this.ui.notify('THEY\'RE DOWN: J STOMP · K KICK', 'small warn', 1.8);
    });
  }

  _knockdownUpdate(dt, realDt) {
    const m = this.match;
    const down = m.downed;
    if (down.state === 'getup') return;
    if (down.state !== 'down' && down.state !== 'knockdown') {
      // back on their feet after the get-up animation: resume the fight
      this.state = 'fight';
      this.rig.endCinematic();
      this.ui.notify('FIGHT!', 'small');
      this.audio.play('bell', { vol: 0.4 });
      this.excite = 0.7;
      return;
    }
    if (down.state !== 'down') return;
    // No referee and no count: the downed fighter gets up after a few beats (mashing helps the player)
    m.countTimer += realDt;
    let target = m.getUpAt;
    if (down === this.player) target = Math.max(2, m.getUpAt - Math.floor(down.mash / 4));
    if (m.countTimer >= FIGHT.countInterval) {
      m.countTimer = 0;
      m.count++;
      if (m.count % 2 === 0) this.audio.crowdReact('cheer', 0.25);
      if (m.tko && m.count >= 3) {
        this.ui.hideCount();
        this._beginKO(m.up, down, true);
        return;
      }
      if (!m.tko && m.count >= target) {
        this.ui.hideCount();
        this.ui.hint('', false);
        down.getUp();
        // recovery: get some wind back
        down.health = Math.min(down.stats.maxHealth, down.health + down.stats.maxHealth * 0.03 * down.stats.recovery);
        down.stamina = Math.max(down.stamina, down.stats.maxStamina * 0.65);
        down.balance = 0;
        this.audio.crowdReact('cheer', 0.6);
        if (m.mode !== 'training') {
          const pct = Math.round((1 - down.wearPower) * 100);
          this.ui.notify(down === this.player ? `YOU'RE WEAKENED (-${pct}% POWER)` : `THEY'RE WEAKENED (-${pct}% POWER)`, down === this.player ? 'bad' : 'good', 1.8);
        }
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // Knockout / decision / results

  _beginKO(winner, loser, tko) {
    const m = this.match;
    if (m.over) return;
    m.over = true;
    m.result = { won: winner === this.player, ko: true, tko, winner, loser };
    this.state = 'ko';
    this.input.enabled = false;
    this.input.unlockPointer();
    if (loser.state !== 'ko') loser.knockOut();
    winner.setState('idle');
    winner.inFight = false;
    const fx = this.effects;
    fx.slowmo(0.18, 1.8);
    fx.screenFlash(0.9);
    fx.speedLines(1);
    this.rig.addTrauma(1);
    this.rig.punch(12);
    this.rig.cinematic('ko', { a: loser, b: winner }, 0);
    this.audio.play('impactHuge', { vol: 1.2, reverb: 0.8 });
    this.audio.play('slowmo', { vol: 0.8 });
    this.audio.crowdReact('roar', 1.4);
    this.after(0.4, () => this.audio.play('bellTriple', { vol: 1, reverb: 0.6 }));
    this.after(0.6, () => this.audio.play('bodyfall', { vol: 1 }));
    const lethal = FIGHT.deathMatch && m.mode !== 'training';
    if (lethal) {
      loser.model.setBlood(1);
      fx.bloodSpray(this._v.set(loser.pos.x, loser.model.height * 0.85, loser.pos.z).clone(), 6, this._v.set(loser.pos.x - winner.pos.x, 0, loser.pos.z - winner.pos.z).normalize().clone());
    }
    this.after(0.7, () => {
      // the body falls backwards: head ends up behind the feet
      if (lethal) fx.bloodPool(loser.pos.x - Math.sin(loser.facing) * 1.3, loser.pos.z - Math.cos(loser.facing) * 1.3, 1.5);
      fx.dustBurst(loser.pos.x, loser.pos.z, 30, 1.2);
      this.arena.cameraFlashes();
      this.audio.crowdReact('roar', 1.4);
    });
    this.excite = 1.3;
    this.exciteBase = 0.9;
    this.ui.hideCount();
    this.ui.hint('', false);
    const koText = lethal ? (loser === this.player ? 'YOU DIED' : 'FINISHED') : tko ? 'T.K.O.' : 'KNOCKOUT';
    this.after(0.35, () => this.ui.bigText(koText, 'ko', 2.4));
    this.after(2.8, () => this._celebrate(winner, loser));
  }

  _suddenDeath() {
    const m = this.match;
    if (m.suddenDeath) return;
    m.suddenDeath = true;
    this.combat.damageMult = FIGHT.suddenDeathDamage;
    this.audio.play('bellTriple', { vol: 1 });
    this.audio.crowdReact('roar', 1.2);
    this.excite = 1.1;
    this.exciteBase = 0.6;
    this.ui.bigText('SUDDEN DEATH', 'kd', 1.8);
    this.ui.notify('ALL DAMAGE INCREASED', 'bad');
  }

  _decision() {
    const m = this.match;
    if (m.over) return;
    m.over = true;
    const p = this.player;
    const o = this.opp;
    const ph = p.health / p.stats.maxHealth;
    const oh = o.health / o.stats.maxHealth;
    const won = Math.abs(ph - oh) > 0.01 ? ph > oh : p.stat.damage >= o.stat.damage;
    const winner = won ? p : o;
    const loser = won ? o : p;
    m.result = { won, ko: false, tko: false, winner, loser, decision: true };
    this.state = 'ko';
    this.input.enabled = false;
    this.input.unlockPointer();
    this.audio.play('bellTriple', { vol: 1 });
    this.ui.bigText('TIME!', 'kd', 1.6);
    this.audio.crowdReact('cheer', 0.8);
    for (const f of [p, o]) {
      f.inFight = false;
      if (!f.isDown) f.setState('idle');
    }
    this.after(1.8, () => {
      this.ui.bigText(`JUDGES' DECISION`, 'small', 1.2);
    });
    this.after(3.0, () => this._celebrate(winner, loser));
  }

  _celebrate(winner, loser) {
    winner.setState('victory');
    if (!loser.isDown) loser.setState('defeated');
    this.rig.cinematic('victory', { a: winner }, 0);
    this.ui.bigText(winner === this.player ? 'VICTORY' : 'DEFEAT', winner === this.player ? 'win' : 'lose', 2.2);
    this.audio.play(winner === this.player ? 'victory' : 'defeat', { vol: 0.9 });
    this.audio.setMusic(winner === this.player ? 'menu' : 'tense');
    this.after(2.6, () => this._results());
  }

  _results() {
    const m = this.match;
    const r = m.result;
    const p = this.player;
    const stats = { ...p.stat, time: m.elapsed, oppLanded: this.opp.stat.landed, oppDamage: this.opp.stat.damage };
    const perfect = r.won && this.opp.stat.damage < 0.5;
    let summary = null;
    let tourney = null;
    if (m.mode !== 'training') {
      summary = this.prog.award({ opponent: m.profile, won: r.won, ko: r.ko, tko: r.tko, perfect, stats, tournament: !!m.tournament });
      if (m.tournament) {
        tourney = m.tournament;
        if (r.won) {
          tourney.round++;
          if (tourney.round >= tourney.opponents.length) {
            tourney.done = true;
            tourney.prize = this.prog.awardTournament();
          }
        } else tourney.eliminated = true;
      }
    }
    this.state = 'results';
    this.ui.hideHud();
    this.ui.showResults({ result: r, stats, summary, profile: m.profile, tournament: tourney, perfect });
  }
}

/** Build a fresh tournament run. */
export function newTournament() {
  return { name: TOURNAMENT.name, opponents: OPPONENTS.map((o) => o.id), round: 0, done: false, eliminated: false };
}

export { OPPONENTS, TRAINING_DUMMY };
