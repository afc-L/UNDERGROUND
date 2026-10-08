// Fighter simulation: state machine, movement, stamina, special meter and pose selection.
// A Fighter is driven only by an "intent" object each frame (see input.js / ai.js), so a
// networked opponent could be driven by remote intents with no changes here.
import * as THREE from 'three';
import { FIGHTER, ARENA } from './config.js';
import { ATTACKS, chainAttack } from './attacks.js';
import { FighterModel } from './fighterModel.js';
import {
  GUARD, RELAXED, BLOCK, DODGE, HIT_HEAD, HIT_BODY, STAGGER, DOWN, KNEEL, VICTORY, DEFEATED, TAUNT,
  POSE_SIZE, IDX, approachPose, lerpPose,
} from './poses.js';

export function emptyIntent() {
  return { moveX: 0, moveZ: 0, sprint: false, block: false, light: false, heavy: false, dodge: false, special: false, lock: true };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const smooth = (t) => t * t * (3 - 2 * t);

export class Fighter {
  /**
   * @param {object} o { id, name, title, look, accent, stats:{maxHealth,maxStamina,power,speed,attackSpeed,defense,regen,recovery,meterGain,cooldown} }
   */
  constructor(o) {
    this.id = o.id;
    this.name = o.name;
    this.title = o.title || o.name;
    this.isPlayer = !!o.isPlayer;
    this.accent = o.accent || '#ffffff';
    this.stats = {
      maxHealth: FIGHTER.maxHealth, maxStamina: FIGHTER.maxStamina, power: 1, speed: 1, attackSpeed: 1,
      defense: 1, regen: 1, recovery: 1, meterGain: 1, cooldown: 1, ...o.stats,
    };
    this.model = new FighterModel(o.look, this.accent);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3(); // knockback / impulses
    this.moveVel = new THREE.Vector3(); // walking
    this.pose = Float32Array.from(GUARD);
    this._target = new Float32Array(POSE_SIZE);
    this.reset();
  }

  reset() {
    const s = this.stats;
    this.health = s.maxHealth;
    this.displayHealth = s.maxHealth;
    this.stamina = s.maxStamina;
    this.special = 0;
    this.specialCooldown = 0;
    this.balance = 0;
    this.balanceDelay = 0;
    this.state = 'idle';
    this.stateTime = 0;
    this.stateDur = 0;
    this.attack = null;
    this.attackTime = 0;
    this.attackHit = false;
    this.attackResolved = false;
    this.attackSerial = 0;
    this.attackCounter = false;
    this.buffer = null;
    this.bufferTime = 0;
    this.blockStart = -10;
    this.clock = 0;
    this.counterTimer = 0;
    this.invuln = 0;
    this.dodgeDir = new THREE.Vector3();
    this.dodgeCooldown = 0;
    this.staminaDelay = 0;
    this.knockdowns = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.lockOn = true;
    this.sprinting = false;
    this.walkPhase = 0;
    this.stepped = false;
    this.mash = 0;
    this.hitSide = 0;
    this.hitHigh = true;
    this.inFight = false;
    this.facing = 0;
    this.vel.set(0, 0, 0);
    this.moveVel.set(0, 0, 0);
    this.pose.set(GUARD);
    this.model.glow = 0;
    this.model.setBlood(0);
    this.stat = { thrown: 0, landed: 0, damage: 0, maxCombo: 0, knockdowns: 0, counters: 0, perfectBlocks: 0, perfectDodges: 0, blocked: 0, specials: 0 };
  }

  get exhausted() {
    return this.stamina < this.stats.maxStamina * FIGHTER.lowStamina;
  }
  /** Multiplier applied to damage/speed while tired (smoothly down to 0.7 at empty). */
  get fatigue() {
    const f = this.stamina / (this.stats.maxStamina * FIGHTER.lowStamina);
    return f >= 1 ? 1 : 0.7 + 0.3 * f;
  }
  get canAct() {
    return this.state === 'idle' || this.state === 'block';
  }
  get isDown() {
    return this.state === 'knockdown' || this.state === 'down' || this.state === 'ko' || this.state === 'getup';
  }
  get forward() {
    return { x: Math.sin(this.facing), z: Math.cos(this.facing) };
  }
  /** Lying on the mat and kickable (a short moment after hitting the floor). */
  get groundTarget() {
    return this.state === 'down' || (this.state === 'knockdown' && this.stateTime > 0.3);
  }

  /** Where a downed fighter's torso is: the body falls backwards, away from where they faced. */
  groundPoint(out = { x: 0, z: 0 }) {
    out.x = this.pos.x - Math.sin(this.facing) * 0.8;
    out.z = this.pos.z - Math.cos(this.facing) * 0.8;
    return out;
  }

  get specialReady() {
    return this.special >= FIGHTER.specialMax && this.specialCooldown <= 0;
  }
  /** Attack phase: 'startup' | 'active' | 'recovery' */
  get attackPhase() {
    if (!this.attack) return null;
    const t = this.attackTime;
    const a = this.attack;
    const sp = this.attackRate;
    if (t < a.startup / sp) return 'startup';
    if (t < (a.startup + a.active) / sp) return 'active';
    return 'recovery';
  }

  setState(s, dur = 0) {
    this.state = s;
    this.stateTime = 0;
    this.stateDur = dur;
    if (s !== 'attack') {
      this.attack = null;
      this.model.glow = 0;
    }
  }

  useStamina(n) {
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaDelay = FIGHTER.staminaRegenDelay;
  }

  addMeter(n) {
    if (this.specialCooldown > 0) n *= 0.5;
    this.special = Math.min(FIGHTER.specialMax, this.special + n * this.stats.meterGain);
  }

  faceToward(x, z, dt, rate = FIGHTER.turnRate) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    const d = wrapAngle(want - this.facing);
    const step = rate * dt;
    this.facing = wrapAngle(this.facing + clamp(d, -step, step));
  }

  startAttack(atk, events) {
    const cost = atk.stamina;
    this.attackExhausted = this.stamina < cost;
    this.useStamina(cost);
    this.attack = atk;
    this.state = 'attack';
    this.stateTime = 0;
    this.attackTime = 0;
    this.attackHit = false;
    this.attackResolved = false;
    this.attackSerial++;
    this.attackCounter = this.counterTimer > 0;
    this.attackRate = this.stats.attackSpeed * (this.attackExhausted ? 0.75 : 1) * (0.85 + 0.15 * this.fatigue);
    this.stat.thrown++;
    if (atk.kind === 'special') {
      this.special = 0;
      this.specialCooldown = FIGHTER.specialCooldown * this.stats.cooldown;
      this.stat.specials++;
      this.model.glow = 1;
    }
    events.push({ type: 'attackStart', attacker: this, attack: atk });
  }

  /**
   * Advance one frame.
   * @param {number} dt scaled sim time
   * @param {object} intent see emptyIntent()
   * @param {Fighter} opp
   * @param {Array} events output event list
   */
  update(dt, intent, opp, events) {
    this.stateTime += dt;
    this.clock += dt;
    this.counterTimer = Math.max(0, this.counterTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.specialCooldown = Math.max(0, this.specialCooldown - dt);
    this.staminaDelay -= dt;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    this.balanceDelay -= dt;
    if (this.balanceDelay <= 0) this.balance = Math.max(0, this.balance - FIGHTER.balanceDecay * dt);
    this.stepped = false;
    this.lockOn = intent.lock !== false;

    // Input buffer: presses are remembered briefly so combos feel forgiving.
    if (intent.special) this._buffer('special');
    else if (intent.heavy) this._buffer('heavy');
    else if (intent.light) this._buffer('light');
    if (this.buffer) {
      this.bufferTime -= dt;
      if (this.bufferTime <= 0) this.buffer = null;
    }
    if ((intent.light || intent.heavy) && this.isDown) this.mash++;

    const s = this.stats;
    let moveScale = 0;
    let faceOpp = this.lockOn && opp && !opp.isDown;
    const toOppX = opp ? opp.pos.x - this.pos.x : 0;
    const toOppZ = opp ? opp.pos.z - this.pos.z : 0;
    const distOpp = Math.hypot(toOppX, toOppZ);

    switch (this.state) {
      case 'idle':
      case 'block': {
        if (intent.block && this.state !== 'block') {
          this.state = 'block';
          this.stateTime = 0;
          this.blockStart = this.clock;
        } else if (!intent.block && this.state === 'block') {
          this.state = 'idle';
          this.stateTime = 0;
        }
        if (this.inFight && this._tryAct(intent, events, opp)) break;
        moveScale = this.state === 'block' ? FIGHTER.blockMoveMult : 1;
        if (this.state === 'block') this.useStaminaSoft(FIGHTER.blockHoldCost * dt);
        break;
      }
      case 'attack': {
        const a = this.attack;
        const rate = this.attackRate;
        this.attackTime += dt;
        const t = this.attackTime * rate;
        // Track the opponent during startup (aim assist) so attacks don't whiff from small drift.
        const gp = a.ground && opp ? opp.groundPoint() : null;
        const aimX = gp ? gp.x : opp && opp.pos.x;
        const aimZ = gp ? gp.z : opp && opp.pos.z;
        const aimDist = gp ? Math.hypot(gp.x - this.pos.x, gp.z - this.pos.z) : distOpp;
        if (opp && t < a.startup && aimDist < 4.5) this.faceToward(aimX, aimZ, dt, a.kind === 'special' ? 20 : 9);
        faceOpp = false;
        // Lunge forward
        if (a.lunge > 0 && t > a.startup * a.lungeStart && t < a.startup + a.active) {
          const stopDist = gp ? 0.85 : FIGHTER.radius * 2 + 0.25;
          if (!opp || aimDist > stopDist) {
            const f = this.forward;
            const sp = a.lunge * rate;
            this.pos.x += f.x * sp * dt;
            this.pos.z += f.z * sp * dt;
          }
        }
        // Whiff check at end of active window
        if (!this.attackResolved && t >= a.startup + a.active) {
          this.attackResolved = true;
          if (!this.attackHit) events.push({ type: 'whiff', attacker: this, attack: a });
        }
        // Chain into the next move during the cancel window (or right after a hit lands)
        const recStart = a.startup + a.active;
        const inCancel = t >= recStart && t <= recStart + a.recovery * a.cancel;
        const earlyHitCancel = this.attackHit && t >= a.startup + a.active * 0.5;
        if (this.buffer && (inCancel || earlyHitCancel)) {
          let next = null;
          if (this.buffer === 'special' && this.specialReady) next = ATTACKS.special;
          else if (this.buffer !== 'special') next = chainAttack(a, this.buffer);
          if (next) {
            this.buffer = null;
            this.startAttack(next, events);
            break;
          }
        }
        // Dodge-cancel recovery after a landed hit
        if (intent.dodge && this.attackHit && t >= recStart && this._canDodge()) {
          this._startDodge(intent, opp, events);
          break;
        }
        if (t >= a.total) this.setState('idle');
        break;
      }
      case 'dodge': {
        const k = 1 - this.stateTime / FIGHTER.dodgeTime;
        const sp = FIGHTER.dodgeSpeed * Math.max(0, k) * (0.9 + 0.1 * s.speed);
        this.pos.x += this.dodgeDir.x * sp * dt;
        this.pos.z += this.dodgeDir.z * sp * dt;
        if (this.stateTime >= FIGHTER.dodgeTime) {
          this.setState('idle');
          this.dodgeCooldown = FIGHTER.dodgeCooldown;
        }
        break;
      }
      case 'hitstun':
      case 'blockstun':
      case 'stagger':
        if (this.stateTime >= this.stateDur) this.setState(intent.block && this.state === 'blockstun' ? 'block' : 'idle');
        break;
      case 'knockdown':
        if (this.stateTime >= 0.75) this.setState('down');
        break;
      case 'getup':
        if (this.stateTime >= 0.75) {
          this.setState('idle');
          this.invuln = 0.35;
        }
        break;
      case 'intro':
      case 'victory':
      case 'defeated':
      case 'down':
      case 'ko':
      default:
        break;
    }

    // Walking
    let wantX = 0;
    let wantZ = 0;
    this.sprinting = false;
    if (moveScale > 0) {
      const mag = Math.min(1, Math.hypot(intent.moveX, intent.moveZ));
      if (mag > 0.05) {
        let speed = (this.lockOn ? FIGHTER.strafeSpeed : FIGHTER.walkSpeed) * s.speed;
        if (intent.sprint && this.state === 'idle' && this.stamina > 1) {
          speed = FIGHTER.sprintSpeed * s.speed;
          this.sprinting = true;
          this.useStaminaSoft(FIGHTER.sprintCost * dt);
        }
        speed *= moveScale * (0.75 + 0.25 * this.fatigue);
        wantX = (intent.moveX / Math.max(mag, 1e-6)) * mag * speed;
        wantZ = (intent.moveZ / Math.max(mag, 1e-6)) * mag * speed;
        if (!faceOpp || this.sprinting) {
          const tf = Math.atan2(wantX, wantZ);
          const d = wrapAngle(tf - this.facing);
          this.facing = wrapAngle(this.facing + clamp(d, -10 * dt, 10 * dt));
        }
      }
    }
    if (faceOpp && opp && !this.sprinting && (this.state === 'idle' || this.state === 'block' || this.state === 'blockstun')) {
      this.faceToward(opp.pos.x, opp.pos.z, dt);
    }
    const acc = 1 - Math.exp(-14 * dt);
    this.moveVel.x += (wantX - this.moveVel.x) * acc;
    this.moveVel.z += (wantZ - this.moveVel.z) * acc;
    this.pos.x += (this.moveVel.x + this.vel.x) * dt;
    this.pos.z += (this.moveVel.z + this.vel.z) * dt;
    const damp = Math.exp(-(this.isDown ? 5 : 7) * dt);
    this.vel.multiplyScalar(damp);

    // Stamina regen
    if (this.staminaDelay <= 0 && !this.sprinting) {
      let r = FIGHTER.staminaRegen * s.regen;
      if (this.state === 'block') r *= 0.35;
      else if (this.isDown) r *= 1.6;
      this.stamina = Math.min(s.maxStamina, this.stamina + r * dt);
    }
    // Health bar trailing value for the HUD
    this.displayHealth += (this.health - this.displayHealth) * (1 - Math.exp(-3 * dt));
    if (this.displayHealth < this.health) this.displayHealth = this.health;
  }

  useStaminaSoft(n) {
    // continuous drains (blocking/sprinting) delay regen but less harshly
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaDelay = Math.max(this.staminaDelay, 0.25);
  }

  _buffer(kind) {
    this.buffer = kind;
    this.bufferTime = 0.28;
  }

  _groundDist(opp) {
    const gp = opp.groundPoint();
    return Math.hypot(gp.x - this.pos.x, gp.z - this.pos.z);
  }

  _canDodge() {
    return this.dodgeCooldown <= 0 && this.stamina >= 6;
  }

  _tryAct(intent, events, opp) {
    if (intent.dodge && this._canDodge()) {
      this._startDodge(intent, opp, events);
      return true;
    }
    if (this.buffer) {
      let atk = null;
      if (this.buffer === 'special') {
        if (this.specialReady) atk = ATTACKS.special;
        else events.push({ type: 'specialNotReady', fighter: this });
      } else if (opp && opp.groundTarget && this._groundDist(opp) < 2.2) {
        atk = this.buffer === 'heavy' ? ATTACKS.soccerKick : ATTACKS.stomp;
      } else atk = chainAttack(null, this.buffer);
      this.buffer = null;
      if (atk) {
        if (atk.ground) {
          const gp = opp.groundPoint();
          this.faceToward(gp.x, gp.z, 1, 1.5);
        } else if (opp && !opp.isDown) this.faceToward(opp.pos.x, opp.pos.z, 1, 1.2);
        this.startAttack(atk, events);
        return true;
      }
    }
    return false;
  }

  _startDodge(intent, opp, events) {
    let dx = intent.moveX;
    let dz = intent.moveZ;
    const m = Math.hypot(dx, dz);
    if (m < 0.1) {
      // no direction: step back away from the opponent (or backwards)
      const f = this.forward;
      dx = -f.x;
      dz = -f.z;
    } else {
      dx /= m;
      dz /= m;
    }
    this.dodgeDir.set(dx, 0, dz);
    this.useStamina(this.stamina < FIGHTER.dodgeCost ? this.stamina : FIGHTER.dodgeCost);
    this.setState('dodge', FIGHTER.dodgeTime);
    this.invuln = FIGHTER.dodgeIFrames;
    this.dodgePerfectUsed = false;
    events.push({ type: 'dodge', fighter: this });
  }

  // --- Reactions (called by combat) ----------------------------------------------------------

  applyHitstun(dur, high, side) {
    this.hitHigh = high;
    this.hitSide = side;
    this.setState('hitstun', dur);
  }

  stagger(dur) {
    this.setState('stagger', dur);
  }

  knockDown() {
    this.knockdowns++;
    this.setState('knockdown');
    this.balance = 0;
    this.mash = 0;
    this.combo = 0;
  }

  knockOut() {
    this.setState('ko');
    this.health = 0;
  }

  getUp() {
    this.setState('getup');
    this.invuln = 1.1;
  }

  // --- Animation -------------------------------------------------------------------------------

  animate(dt, time) {
    const T = this._target;
    let rate = 12;
    let spinYaw = 0;
    const speed = Math.hypot(this.moveVel.x, this.moveVel.z);

    switch (this.state) {
      case 'idle':
      case 'intro': {
        T.set(this.inFight || this.state === 'idle' ? GUARD : RELAXED);
        if (this.state === 'intro') T.set(this.introPose || GUARD);
        // breathing + bounce
        const bob = Math.sin(time * (this.inFight ? 7 : 2.2)) * (this.inFight ? 0.022 : 0.012);
        T[IDX.pelvisY] += bob - (this.exhausted ? 0.05 : 0);
        T[IDX.spine] += Math.sin(time * 2.2) * 0.02 + (this.exhausted ? 0.18 : 0);
        T[IDX.lSh] += Math.sin(time * 3.1) * 0.05 + (this.exhausted ? 0.35 : 0);
        T[IDX.rSh] += Math.sin(time * 3.1 + 1) * 0.05 + (this.exhausted ? 0.3 : 0);
        this._walkCycle(T, speed, dt);
        rate = 11;
        break;
      }
      case 'block':
      case 'blockstun':
        T.set(BLOCK);
        if (this.state === 'blockstun') {
          T[IDX.spine] -= 0.12;
          T[IDX.root + 1] -= 0.06;
        }
        this._walkCycle(T, speed, dt);
        rate = 22;
        break;
      case 'attack': {
        const a = this.attack;
        const t = this.attackTime * this.attackRate;
        if (t < a.startup) {
          const p = t / a.startup;
          if (p < 0.65) {
            T.set(a.windup);
            rate = a.kind === 'light' ? 30 : 16;
          } else {
            lerpPose(T, a.windup, a.strike, smooth((p - 0.65) / 0.35));
            rate = 38;
          }
        } else if (t < a.startup + a.active) {
          T.set(a.strike);
          rate = 45;
        } else {
          T.set(a.strike);
          const p = (t - a.startup - a.active) / a.recovery;
          lerpPose(T, a.strike, GUARD, smooth(Math.min(1, p * 1.2)));
          rate = 18;
        }
        if (a.spin) {
          const p = Math.min(1, t / (a.startup + a.active));
          spinYaw = a.spin * Math.PI * 2 * smooth(p);
          if (p >= 1) spinYaw = 0;
        }
        if (a.kind === 'special') this.model.glow = t < a.startup + a.active ? 1 : Math.max(0, 1 - (t - a.startup - a.active) * 3);
        break;
      }
      case 'dodge': {
        T.set(DODGE);
        // lean into the dodge direction (relative to facing)
        const f = this.forward;
        const side = this.dodgeDir.x * f.z - this.dodgeDir.z * f.x; // + = left
        const back = -(this.dodgeDir.x * f.x + this.dodgeDir.z * f.z);
        T[IDX.spine + 2] = -side * 0.5;
        T[IDX.spine] = 0.45 - back * 0.55;
        T[IDX.tilt + 1] = -side * 0.15;
        rate = 26;
        break;
      }
      case 'hitstun': {
        const p = this.stateTime / Math.max(0.01, this.stateDur);
        if (p < 0.55) {
          T.set(this.hitHigh ? HIT_HEAD : HIT_BODY);
          T[IDX.head + 1] += this.hitSide * 0.55;
          T[IDX.spine + 1] += this.hitSide * 0.25;
          rate = 30;
        } else {
          T.set(GUARD);
          rate = 10;
        }
        break;
      }
      case 'stagger':
        T.set(STAGGER);
        T[IDX.spine + 2] += Math.sin(this.stateTime * 9) * 0.2;
        T[IDX.head + 2] += Math.sin(this.stateTime * 7) * 0.25;
        T[IDX.pelvisY] += Math.sin(this.stateTime * 11) * 0.03;
        rate = 10;
        break;
      case 'knockdown':
      case 'ko': {
        T.set(DOWN);
        const p = this.stateTime;
        if (p < 0.12) {
          T.set(STAGGER);
          rate = 20;
        } else rate = 7.5;
        // small bounce when hitting the floor
        if (p > 0.45 && p < 0.65) T[IDX.root] += Math.sin(((p - 0.45) / 0.2) * Math.PI) * 0.07;
        break;
      }
      case 'down':
        T.set(DOWN);
        T[IDX.spine] += Math.sin(time * 3) * 0.03;
        T[IDX.head] += Math.sin(time * 1.3) * 0.08;
        rate = 5;
        break;
      case 'getup':
        T.set(this.stateTime < 0.4 ? KNEEL : GUARD);
        rate = this.stateTime < 0.4 ? 9 : 12;
        break;
      case 'victory': {
        T.set(this.stateTime % 3 < 2 ? VICTORY : TAUNT);
        const j = Math.abs(Math.sin(time * 6)) * 0.1;
        T[IDX.root] += j;
        T[IDX.lSh] += Math.sin(time * 6) * 0.15;
        T[IDX.rSh] -= Math.sin(time * 6) * 0.15;
        rate = 8;
        break;
      }
      case 'defeated':
        T.set(DEFEATED);
        rate = 4;
        break;
      default:
        T.set(GUARD);
    }

    approachPose(this.pose, T, 1 - Math.exp(-rate * dt));
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
    this.model.apply(this.pose, spinYaw);
    this.model.updateFx(dt);
  }

  _walkCycle(T, speed, dt) {
    if (speed < 0.2) return;
    const f = this.forward;
    // movement relative to facing: forward/back and lateral components
    const fw = (this.moveVel.x * f.x + this.moveVel.z * f.z) / speed;
    const prev = this.walkPhase;
    this.walkPhase += dt * speed * (this.sprinting ? 2.2 : 2.9);
    if (Math.floor(prev / Math.PI) !== Math.floor(this.walkPhase / Math.PI)) this.stepped = true;
    const s = Math.sin(this.walkPhase);
    const amp = Math.min(1, speed / 3) * (this.sprinting ? 0.85 : 0.45);
    const dir = fw >= -0.3 ? 1 : -1;
    T[IDX.lHip] += s * amp * dir;
    T[IDX.rHip] -= s * amp * dir;
    T[IDX.lKn] += Math.max(0, -s) * amp * 1.3;
    T[IDX.rKn] += Math.max(0, s) * amp * 1.3;
    T[IDX.pelvisY] -= Math.abs(Math.cos(this.walkPhase)) * 0.035 * amp;
    if (this.sprinting) {
      T[IDX.spine] += 0.25;
      T[IDX.lSh] -= s * 0.6;
      T[IDX.rSh] += s * 0.6;
    }
  }

  /** Clamp inside the cage. Returns impact speed if the fighter was slammed into the fence. */
  clampToArena() {
    const r = Math.hypot(this.pos.x, this.pos.z);
    const R = ARENA.radius;
    if (r > R) {
      const nx = this.pos.x / r;
      const nz = this.pos.z / r;
      this.pos.x = nx * R;
      this.pos.z = nz * R;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn > 0) {
        this.vel.x -= nx * vn * 1.6;
        this.vel.z -= nz * vn * 1.6;
        return vn;
      }
    }
    return 0;
  }
}
