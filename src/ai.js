// Opponent AI. Produces the same intent objects as the keyboard/mouse player, so any controller
// (local AI, local human, remote human) can drive any fighter.
// States: IDLE, APPROACH, ATTACK, COMBO, DEFEND, DODGE, RETREAT, COUNTER, RECOVER
import { DIFFICULTY, FIGHTER } from './config.js';
import { emptyIntent } from './fighter.js';

const rand = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;

const PLANS = {
  jabs: ['light', 'light'],
  oneTwoKick: ['light', 'light', 'heavy'],
  jabKick: ['light', 'heavy'],
  fourPiece: ['light', 'light', 'light', 'light'],
  spinFinisher: ['light', 'light', 'light', 'heavy'],
  haymaker: ['heavy'],
  hayHook: ['heavy', 'light', 'light'],
  pokes: ['light'],
};

export class AIController {
  constructor(profile, difficultyKey = profile.difficulty || 'normal') {
    this.profile = profile;
    this.d = { ...DIFFICULTY[difficultyKey] };
    this.p = { aggression: 0.6, heavyPref: 0.3, kickPref: 0.3, range: 1.25, specialUse: 0.5, evasive: 0, defensive: 0, ...profile.personality };
    this.mode = 'fight'; // training: 'idle' | 'block' | 'fight'
    this.intent = emptyIntent();
    this.state = 'IDLE';
    this.visited = new Set(['IDLE']); // every state entered (debug/tests)
    this.timer = rand(0.3, 0.8);
    this.stateTime = 0;
    this.plan = [];
    this.planIdx = 0;
    this.lastSerial = -1;
    this.lastPlayerState = 'idle';
    this.reaction = null;
    this.punishedSerial = -1;
    this.strafeDir = chance(0.5) ? 1 : -1;
    this.strafeTimer = 0;
    this.mods = { aggression: 0, heavy: 0, block: 0, counter: 0, combo: 0 };
    this.strategy = 'balanced';
    this.strategyTimer = 7;
    this.mem = { time: 0, block: 0, attacks: 0, heavies: 0, dodges: 0 };
    this.seenKnockdowns = 0;
    this.events = null;
  }

  setState(s, timer = 0) {
    this.visited.add(s);
    this.state = s;
    this.timer = timer;
    this.stateTime = 0;
  }

  /** @returns intent for this frame */
  update(dt, me, opp, events) {
    const I = this.intent;
    I.moveX = I.moveZ = 0;
    I.light = I.heavy = I.dodge = I.special = I.sprint = false;
    I.lock = true;
    this.events = events;
    this.stateTime += dt;
    this.timer -= dt;

    if (!opp || !me.inFight) {
      I.block = false;
      return I;
    }
    if (this.mode === 'idle') {
      I.block = false;
      return I;
    }
    if (this.mode === 'block') {
      I.block = !me.isDown;
      return I;
    }

    const dx = opp.pos.x - me.pos.x;
    const dz = opp.pos.z - me.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const nx = dx / dist;
    const nz = dz / dist;
    const stam = me.stamina / me.stats.maxStamina;
    const d = this.d;
    const p = this.p;

    this._observe(dt, me, opp);

    // Downed / stunned: nothing to do but plan the recovery
    if (me.isDown) {
      I.block = false;
      return I;
    }
    if (me.knockdowns !== this.seenKnockdowns && me.canAct) {
      // just got back up from a knockdown: cover up and buy time
      this.seenKnockdowns = me.knockdowns;
      this.reaction = null;
      this.setState('RECOVER', rand(0.6, 1.2) * (1.2 - d.reaction));
    }
    if (me.state === 'hitstun' || me.state === 'stagger') {
      I.block = false;
      if (this.state === 'COMBO' || this.state === 'ATTACK') this.setState('IDLE', rand(0.05, 0.25));
      // good AIs guard up right after taking hits
      if (chance(d.blockChance * 0.6 * dt * 10) && this.state !== 'DEFEND') this.setState('DEFEND', rand(0.4, 0.8));
      return I;
    }

    // ---- Reactive defense against a new incoming attack ----
    if (opp.state === 'attack' && opp.attackSerial !== this.lastSerial) {
      this.lastSerial = opp.attackSerial;
      if (dist < opp.attack.range + 2.2 && this.state !== 'COMBO') {
        const heavy = opp.attack.kind !== 'light';
        let block = (d.blockChance + this.mods.block + (p.defensive || 0)) * (heavy ? 1.1 : 0.85);
        let dodge = d.dodgeChance + (p.evasive || 0) + (heavy ? 0.1 : 0);
        if (me.stamina < FIGHTER.dodgeCost) dodge = 0;
        const roll = Math.random();
        let action = null;
        if (roll < dodge) action = 'dodge';
        else if (roll < dodge + block) action = 'block';
        if (action) this.reaction = { action, at: d.reaction * rand(0.75, 1.25), counter: chance(d.counterChance + this.mods.counter) };
      }
    }
    if (this.reaction) {
      this.reaction.at -= dt;
      if (this.reaction.at <= 0) {
        const r = this.reaction;
        this.reaction = null;
        const threat = opp.state === 'attack' && opp.attackPhase !== 'recovery';
        if (threat && (me.canAct || me.state === 'attack')) {
          if (r.action === 'dodge' && me.canAct) {
            // sidestep (perpendicular) or back-step
            const side = chance(0.5) ? 1 : -1;
            const back = chance(0.35);
            I.moveX = back ? -nx : -nz * side;
            I.moveZ = back ? -nz : nx * side;
            I.dodge = true;
            this.afterDefense = r.counter;
            this.setState('DODGE', FIGHTER.dodgeTime + 0.05);
            return I;
          }
          if (r.action === 'block' && me.canAct) {
            this.afterDefense = r.counter;
            this.setState('DEFEND', 0.5);
          }
        }
      }
    }

    // ---- Punish whiffed attacks ----
    if (opp.state === 'attack' && opp.attackPhase === 'recovery' && !opp.attackHit && opp.attackSerial !== this.punishedSerial &&
      dist < 2.3 && me.canAct && this.state !== 'COMBO') {
      this.punishedSerial = opp.attackSerial;
      if (chance(d.counterChance + this.mods.counter)) this.setState('COUNTER', 0);
    }

    // ---- State machine ----
    I.block = false;
    switch (this.state) {
      case 'IDLE': {
        this._strafe(dt, nx, nz, dist, 0.55);
        if (this.timer <= 0) this._think(me, opp, dist, stam);
        break;
      }
      case 'APPROACH': {
        I.moveX = nx;
        I.moveZ = nz;
        I.sprint = dist > 4.5 && stam > 0.5 && p.aggression > 0.6;
        // weave a little so the approach isn't a straight line
        const w = Math.sin(this.stateTime * 3) * 0.35;
        I.moveX += -nz * w * this.strafeDir;
        I.moveZ += nx * w * this.strafeDir;
        if (dist <= this._range() + 0.15) this._startOffense(me, opp, dist, stam);
        else if (this.timer <= 0) this._think(me, opp, dist, stam);
        // keep guard up while closing in on a dangerous opponent
        if (opp.state === 'attack' && dist < 2.4 && chance(d.blockChance)) I.block = true;
        break;
      }
      case 'ATTACK':
      case 'COMBO': {
        this._runCombo(me, opp, dist);
        break;
      }
      case 'DEFEND': {
        I.block = true;
        if (dist < 1.0) {
          I.moveX = -nx * 0.4;
          I.moveZ = -nz * 0.4;
        }
        const oppDone = opp.state !== 'attack' || opp.attackPhase === 'recovery';
        if (this.afterDefense && oppDone && me.canAct && this.stateTime > 0.12) {
          this.afterDefense = false;
          this.setState('COUNTER', 0);
        } else if (this.timer <= 0 && oppDone) {
          this.setState('IDLE', rand(0.05, 0.3) * (1.5 - p.aggression));
        }
        break;
      }
      case 'DODGE': {
        if (this.timer <= 0 && me.canAct) {
          if (this.afterDefense || me.counterTimer > 0) {
            this.afterDefense = false;
            this.setState('COUNTER', 0);
          } else this.setState('IDLE', rand(0.1, 0.4));
        }
        break;
      }
      case 'RETREAT': {
        I.moveX = -nx * 0.8;
        I.moveZ = -nz * 0.8;
        this._strafe(dt, nx, nz, dist, 0.8);
        if (dist < 1.8 && opp.state === 'attack') I.block = true;
        if (this.timer <= 0 || (stam > 0.7 && this.stateTime > 0.8)) this.setState('IDLE', rand(0.1, 0.3));
        break;
      }
      case 'RECOVER': {
        I.block = dist < 2.5;
        I.moveX = -nx * 0.6;
        I.moveZ = -nz * 0.6;
        this._strafe(dt, nx, nz, dist, 0.6);
        if (this.timer <= 0) this.setState('IDLE', 0.1);
        break;
      }
      case 'COUNTER': {
        if (!me.canAct) break;
        if (dist > this._range() + 0.9) {
          this.setState('APPROACH', 1.2);
          break;
        }
        const plans = me.counterTimer > 0 ? ['haymaker', 'hayHook', 'oneTwoKick'] : ['oneTwoKick', 'jabKick', 'haymaker', 'jabs'];
        this._beginPlan(PLANS[plans[(Math.random() * plans.length) | 0]]);
        if (this.events) this.events.push({ type: 'aiState', fighter: me, state: 'COUNTER' });
        break;
      }
      default:
        this.setState('IDLE', 0.3);
    }
    return I;
  }

  _range() {
    return 1.15 + (this.p.range - 1.2) * 0.8;
  }

  _strafe(dt, nx, nz, dist, amount) {
    const I = this.intent;
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = rand(0.8, 2.2);
      if (chance(0.5)) this.strafeDir *= -1;
    }
    I.moveX += -nz * this.strafeDir * amount;
    I.moveZ += nx * this.strafeDir * amount;
    // hold preferred distance
    const want = this._range() + 0.6;
    const k = Math.max(-1, Math.min(1, (dist - want) * 1.2)) * 0.6;
    I.moveX += nx * k;
    I.moveZ += nz * k;
  }

  _think(me, opp, dist, stam) {
    const d = this.d;
    const p = this.p;
    const aggr = Math.min(1, p.aggression + this.mods.aggression);
    if (d.staminaSmart && stam < 0.22 && aggr < 0.9) {
      this.setState('RETREAT', rand(1.2, 2.2));
      return;
    }
    if (me.specialReady && chance(p.specialUse * d.specialUse) && dist < 3.2) {
      const opening = opp.state !== 'block' || opp.state === 'stagger' || (opp.state === 'attack' && opp.attackPhase === 'recovery');
      if (opening || chance(0.35)) {
        this.intent.special = true;
        this.setState('COMBO', 0);
        this.plan = [];
        this.planIdx = 0;
        return;
      }
    }
    // pressure a tired or staggered opponent
    const oppTired = opp.stamina / opp.stats.maxStamina < 0.3 || opp.state === 'stagger';
    if (dist > this._range() + 0.7) {
      if (chance(aggr + (oppTired ? 0.3 : 0)) || dist > 4.5) this.setState('APPROACH', rand(1.5, 3));
      else this.setState('IDLE', rand(0.3, 0.8) * d.thinkRate * 3);
      return;
    }
    const r = Math.random();
    if (r < aggr * 0.85 + (oppTired ? 0.25 : 0)) this._startOffense(me, opp, dist, stam);
    else if (r < aggr * 0.85 + 0.35 + (p.defensive || 0)) this.setState('DEFEND', rand(0.4, 1.0));
    else if (chance(0.4)) this.setState('RETREAT', rand(0.5, 1.1));
    else this.setState('IDLE', rand(0.3, 0.7) * d.thinkRate * 2.5);
  }

  _startOffense(me, opp, dist, stam) {
    const d = this.d;
    const p = this.p;
    const heavy = Math.min(0.9, p.heavyPref + this.mods.heavy);
    let opts;
    if (this.strategy === 'patient') opts = ['pokes', 'jabs', 'jabKick'];
    else if (d.comboLength <= 2) opts = chance(heavy) ? ['haymaker', 'jabKick'] : ['jabs', 'pokes', 'jabKick'];
    else {
      opts = ['jabs', 'oneTwoKick', 'fourPiece'];
      if (chance(p.kickPref)) opts.push('jabKick', 'oneTwoKick');
      if (chance(heavy)) opts.push('haymaker', 'hayHook');
      if (d.comboLength >= 4) opts.push('spinFinisher', 'fourPiece');
    }
    if (d.staminaSmart && stam < 0.35) opts = ['pokes', 'jabs'];
    const plan = PLANS[opts[(Math.random() * opts.length) | 0]];
    this._beginPlan(plan.slice(0, Math.max(1, d.comboLength + this.mods.combo)));
  }

  _beginPlan(plan) {
    this.plan = plan;
    this.planIdx = 0;
    this.setState('ATTACK', 0);
    this.comboHit = false;
  }

  _runCombo(me, opp, dist) {
    const I = this.intent;
    const d = this.d;
    if (this.planIdx === 0) {
      if (!me.canAct) {
        if (this.stateTime > 1) this.setState('IDLE', 0.2);
        return;
      }
      if (dist > this._range() + 0.5) {
        I.moveX = (opp.pos.x - me.pos.x) / dist;
        I.moveZ = (opp.pos.z - me.pos.z) / dist;
        if (this.stateTime > 1.2) this.setState('IDLE', 0.2);
        return;
      }
      if (this.plan.length === 0) {
        this.setState('IDLE', 0.3);
        return;
      }
      this._press(this.plan[this.planIdx++]);
      this.state = 'COMBO';
      this.visited.add('COMBO');
      return;
    }
    if (me.state === 'attack') {
      const a = me.attack;
      const t = me.attackTime * me.attackRate;
      if (me.attackHit) this.comboHit = true;
      if (this.planIdx < this.plan.length && !me.buffer && t >= a.startup + a.active * 0.6) {
        // continue if the last hit connected, otherwise only sometimes (good AIs don't overcommit)
        const keepGoing = me.attackHit || (me.attackResolved ? chance(d.comboChance * 0.4) : true);
        if (keepGoing && (me.attackHit || chance(d.comboChance))) this._press(this.plan[this.planIdx++]);
        else this.planIdx = this.plan.length;
      }
      return;
    }
    if (me.canAct) {
      // combo over: back off or reset depending on personality
      if (this.p.aggression > 0.85 && chance(0.5)) this.setState('IDLE', rand(0.05, 0.2));
      else if (chance(0.45)) this.setState('RETREAT', rand(0.4, 0.9));
      else if (chance(this.d.blockChance)) this.setState('DEFEND', rand(0.3, 0.6));
      else this.setState('IDLE', rand(0.1, 0.4));
    }
  }

  _press(kind) {
    if (kind === 'light') this.intent.light = true;
    else this.intent.heavy = true;
  }

  /** Hard AI watches the player's habits and switches strategy. */
  _observe(dt, me, opp) {
    const m = this.mem;
    m.time += dt;
    if (opp.state === 'block') m.block += dt;
    if (opp.state === 'attack' && opp.attackSerial !== this._obsSerial) {
      this._obsSerial = opp.attackSerial;
      m.attacks++;
      if (opp.attack.kind !== 'light') m.heavies++;
    }
    if (opp.state === 'dodge' && this.lastPlayerState !== 'dodge') m.dodges++;
    this.lastPlayerState = opp.state;
    if (!this.d.reads) return;
    this.strategyTimer -= dt;
    if (this.strategyTimer > 0) return;
    this.strategyTimer = rand(6, 9);
    const blockRatio = m.block / Math.max(1, m.time);
    const atkRate = m.attacks / Math.max(1, m.time);
    let s = 'balanced';
    if (blockRatio > 0.32) s = 'guardbreak';
    else if (atkRate > 1.1) s = 'counter';
    else if (m.dodges / Math.max(1, m.time) > 0.25) s = 'patient';
    else if (opp.health / opp.stats.maxHealth < me.health / me.stats.maxHealth - 0.2) s = 'pressure';
    m.time = m.block = m.attacks = m.heavies = m.dodges = 0;
    if (s === this.strategy) return;
    this.strategy = s;
    const mods = {
      balanced: { aggression: 0, heavy: 0, block: 0, counter: 0, combo: 0 },
      guardbreak: { aggression: 0.2, heavy: 0.4, block: -0.1, counter: 0, combo: 0 },
      counter: { aggression: -0.3, heavy: 0, block: 0.2, counter: 0.2, combo: 0 },
      patient: { aggression: -0.1, heavy: -0.2, block: 0.05, counter: 0.1, combo: -1 },
      pressure: { aggression: 0.3, heavy: 0.1, block: -0.1, counter: 0, combo: 1 },
    };
    this.mods = mods[s];
    const text = {
      guardbreak: 'is going after your guard',
      counter: 'is waiting to counter',
      patient: 'is reading your dodges',
      pressure: 'smells blood',
      balanced: 'resets',
    }[s];
    if (this.events) this.events.push({ type: 'aiAdapt', fighter: me, text: `${me.title} ${text}` });
  }
}
