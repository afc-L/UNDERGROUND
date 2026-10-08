// Combat resolution: hit detection, blocking, perfect blocks, perfect dodges, counters, balance,
// knockdowns and knockouts. It mutates the two fighters and reports everything as events so
// presentation (effects/audio/camera/UI) stays completely separate from the rules.
import * as THREE from 'three';
import { FIGHTER, METER, FIGHT } from './config.js';

const _v = new THREE.Vector3();

function angleTo(from, to) {
  const want = Math.atan2(to.pos.x - from.pos.x, to.pos.z - from.pos.z);
  let d = want - from.facing;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** Point where a strike lands on the defender (world space). */
export function impactPoint(attacker, defender, attack, out = new THREE.Vector3()) {
  const h = defender.model.height;
  const y = attack.height === 'mid' ? h * 0.62 : h * 0.88;
  const dx = attacker.pos.x - defender.pos.x;
  const dz = attacker.pos.z - defender.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  return out.set(defender.pos.x + (dx / d) * 0.28, y, defender.pos.z + (dz / d) * 0.28);
}

export class Combat {
  constructor() {
    this.trainingInfinite = false;
    this.damageMult = 1; // e.g. sudden death, The Crucible
    this.knockbackMult = 1; // The Crucible: super strength sends people flying
  }

  /** Resolve both fighters' attacks against each other, then separate bodies. */
  resolve(a, b, events) {
    this._attack(a, b, events);
    this._attack(b, a, events);
    this._separate(a, b, events);
  }

  _attack(att, def, events) {
    if (att.state !== 'attack' || att.attackHit) return;
    const atk = att.attack;
    const t = att.attackTime * att.attackRate;
    if (t < atk.startup || t > atk.startup + atk.active) return;

    if (atk.ground) {
      this._groundHit(att, def, atk, events);
      return;
    }
    const dist = Math.hypot(def.pos.x - att.pos.x, def.pos.z - att.pos.z);
    const reach = atk.range + FIGHTER.radius * 0.6;
    if (dist > reach) return;
    if (angleTo(att, def) > (atk.arc * Math.PI) / 360 + 0.15) return;

    if (def.isDown || def.state === 'victory' || def.state === 'defeated') return;

    // Dodge i-frames: the attack passes through. First one per attack is a "perfect dodge".
    if (def.invuln > 0) {
      if (def.state === 'dodge' && !def.dodgePerfectUsed) {
        def.dodgePerfectUsed = true;
        def.counterTimer = FIGHTER.counterWindow;
        def.addMeter(METER.perfectDodge);
        def.stat.perfectDodges++;
        events.push({ type: 'perfectDodge', fighter: def, attacker: att, attack: atk });
      }
      return;
    }

    att.attackHit = true;
    const point = impactPoint(att, def, atk, new THREE.Vector3());
    const dirX = (def.pos.x - att.pos.x) / (dist || 1);
    const dirZ = (def.pos.z - att.pos.z) / (dist || 1);

    // ---- Blocking (must be facing the attacker) ----
    const blocking = (def.state === 'block' || def.state === 'blockstun') && angleTo(def, att) < 1.75;
    if (blocking && atk.kind === 'special') {
      // Specials can't be blocked: the guard is smashed open and some damage gets through
      const chip = atk.damage * att.stats.power * 0.3 * FIGHT.damageScale * this.damageMult;
      def.health = Math.max(1, def.health - chip);
      def.stamina = 0;
      def.staminaDelay = 0.8;
      def.stagger(1.0);
      def.balance = Math.min(FIGHTER.balanceMax * 0.9, def.balance + 40);
      def.vel.set(dirX * atk.knockback * 0.6, 0, dirZ * atk.knockback * 0.6);
      def.model.flash = 0.8;
      att.stat.landed++;
      att.stat.damage += chip;
      events.push({ type: 'guardBreak', attacker: att, defender: def, attack: atk, point, special: true });
      return;
    }
    if (blocking && atk.effect === 'takedown') {
      // takedown stuffed: the shooter eats a sprawl and is left open
      att.stagger(0.6);
      def.stat.blocked++;
      events.push({ type: 'block', attacker: att, defender: def, attack: atk, point, stuffed: true });
      return;
    }
    if (blocking) {
      const sinceBlock = def.clock - def.blockStart;
      if (def.state === 'block' && sinceBlock <= FIGHTER.parryWindow && atk.kind !== 'special') {
        // Perfect block: no damage, attacker is thrown off balance, defender gets a counter window
        def.counterTimer = FIGHTER.counterWindow;
        def.addMeter(METER.perfectBlock);
        def.stat.perfectBlocks++;
        if (!atk.armor) att.stagger(atk.kind === 'heavy' ? 0.6 : 0.42);
        att.vel.set(-dirX * 2.5, 0, -dirZ * 2.5);
        events.push({ type: 'parry', attacker: att, defender: def, attack: atk, point });
        return;
      }
      const chip = atk.damage * att.stats.power * 0.1;
      const cost = atk.damage * 1.4 + atk.guardDamage;
      def.useStamina(cost / def.stats.defense);
      def.health = Math.max(1, def.health - chip);
      def.stat.blocked++;
      def.vel.set(dirX * atk.knockback * 0.45, 0, dirZ * atk.knockback * 0.45);
      if (def.stamina <= 0) {
        def.stagger(0.85);
        def.balance = Math.min(FIGHTER.balanceMax * 0.9, def.balance + 30);
        events.push({ type: 'guardBreak', attacker: att, defender: def, attack: atk, point });
      } else {
        def.setState('blockstun', atk.blockstun);
        events.push({ type: 'block', attacker: att, defender: def, attack: atk, point });
      }
      return;
    }

    // ---- Throw (suplex): grab now, the damage lands with the slam ----
    if (atk.throw) {
      def.grabbedBy(att);
      att.setState('throwing', 1.15);
      att.stat.landed++;
      if (att.attackCounter) att.stat.counters++;
      events.push({ type: 'grab', attacker: att, defender: def, attack: atk, point });
      return;
    }

    // ---- Clean hit ----
    let mult = att.stats.power * (att.attackExhausted ? 0.75 : 1) * att.fatigue * att.wearPower / def.stats.defense;
    let counter = null;
    if (att.attackCounter) {
      counter = 'COUNTER';
      mult *= 1.5;
    } else if (def.state === 'attack' && def.attackPhase === 'startup' && !def.attack.armor) {
      counter = 'COUNTER HIT';
      mult *= 1.25;
    }
    // Combo scaling keeps long strings strong but not instant-kill
    const combo = att.comboTimer > 0 ? att.combo + 1 : 1;
    if (combo > 4) mult *= Math.max(0.6, 1 - (combo - 4) * 0.06);
    const damage = Math.max(1, atk.damage * mult * FIGHT.damageScale * this.damageMult);

    att.combo = combo;
    att.comboTimer = FIGHT.comboTimeout;
    att.stat.maxCombo = Math.max(att.stat.maxCombo, combo);
    att.stat.landed++;
    att.stat.damage += Math.min(damage, def.health);
    if (counter) att.stat.counters++;
    att.addMeter(METER.hit * atk.meter + (counter ? METER.counter : 0));
    def.addMeter(METER.takenHit);
    def.combo = 0;
    def.comboTimer = 0;

    def.health -= damage;
    if (this.trainingInfinite && def.health < 1) def.health = 1;
    def.model.flash = Math.min(1, 0.4 + atk.impact * 0.15);
    def.balance += atk.balance * (counter ? 1.3 : 1);
    def.balanceDelay = FIGHTER.balanceDelay;

    const kb = atk.knockback * (counter ? 1.3 : 1) * this.knockbackMult;
    def.vel.set(dirX * kb, 0, dirZ * kb);
    // attacker recoil on big hits
    if (atk.impact >= 3) att.vel.set(-dirX * 0.8, 0, -dirZ * 0.8);

    const ev = { type: 'hit', attacker: att, defender: def, attack: atk, damage, counter, combo, point, impact: atk.impact + (counter ? 1 : 0) };

    if (def.health <= 0) {
      def.health = 0;
      def.knockOut();
      def.facing = Math.atan2(att.pos.x - def.pos.x, att.pos.z - def.pos.z);
      def.vel.set(dirX * (kb + 3), 0, dirZ * (kb + 3));
      ev.ko = true;
      att.stat.knockdowns++;
      events.push(ev);
      return;
    }

    // Armor: the special move shrugs off interruptions (damage still applies)
    if (def.state === 'attack' && def.attack.armor) {
      events.push(ev);
      return;
    }

    if (atk.effect === 'liver') {
      def.useStamina(35);
      ev.liver = true;
    }
    if (atk.effect === 'cut') {
      def.bleed = Math.max(def.bleed, 6);
      ev.cut = true;
    }
    const heavyish = atk.impact >= 2 || atk.kind !== 'light';
    const takedown = atk.effect === 'takedown';
    if (atk.kind === 'special' || takedown || (def.balance >= FIGHTER.balanceMax && heavyish)) {
      def.knockDown(!takedown);
      ev.takedown = takedown;
      def.facing = Math.atan2(att.pos.x - def.pos.x, att.pos.z - def.pos.z);
      def.vel.set(dirX * (kb + 2), 0, dirZ * (kb + 2));
      att.stat.knockdowns++;
      ev.knockdown = true;
      events.push(ev);
      if (def.knockdowns >= FIGHT.maxKnockdowns && !this.trainingInfinite && !FIGHT.deathMatch) ev.tko = true;
      return;
    }
    if (def.balance >= FIGHTER.balanceMax || atk.effect === 'stagger') {
      if (def.balance >= FIGHTER.balanceMax) def.balance = FIGHTER.balanceMax * 0.8;
      def.stagger(0.75);
      ev.stagger = true;
    } else {
      def.applyHitstun(atk.hitstun * (counter ? 1.25 : 1), atk.height === 'high', -atk.side);
    }
    events.push(ev);
  }

  /** The suplex lands: the thrown fighter is slammed into the mat behind the thrower. */
  slam(att, def, events) {
    if (def.state !== 'thrown') return;
    const atk = att.specialAtk && att.specialAtk.throw ? att.specialAtk : null;
    const base = atk ? atk.damage : 30;
    const mult = att.stats.power * att.fatigue * att.wearPower / def.stats.defense;
    const damage = Math.max(1, base * mult * FIGHT.damageScale * this.damageMult);
    att.stat.damage += Math.min(damage, def.health);
    att.addMeter(METER.counter);
    def.addMeter(METER.takenHit);
    def.health -= damage;
    if (this.trainingInfinite && def.health < 1) def.health = 1;
    def.model.flash = 1;
    def.facing = att.facing;
    const point = new THREE.Vector3(def.pos.x, 0.35, def.pos.z);
    const ev = { type: 'hit', attacker: att, defender: def, attack: atk || { id: 'slam', name: 'SLAM', kind: 'special', sound: 'punchHeavy', impact: 5 }, damage, counter: null, combo: 1, point, impact: 5, slam: true };
    if (def.health <= 0) {
      def.health = 0;
      def.knockOut();
      def.stateTime = 0.5;
      ev.ko = true;
    } else {
      def.knockDown();
      def.stateTime = 0.5; // already on the mat
      ev.knockdown = true;
    }
    att.stat.knockdowns++;
    events.push(ev);
  }

  /** Stomps and kicks on a downed fighter: no blocking, no dodging, no getting up mid-hit. */
  _groundHit(att, def, atk, events) {
    if (!def.groundTarget) return;
    const gp = def.groundPoint();
    const dx = gp.x - att.pos.x;
    const dz = gp.z - att.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > atk.range + 0.25) return;
    let ang = Math.atan2(dx, dz) - att.facing;
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    if (Math.abs(ang) > (atk.arc * Math.PI) / 360 + 0.2) return;

    att.attackHit = true;
    const mult = att.stats.power * (att.attackExhausted ? 0.75 : 1) * att.fatigue * att.wearPower / def.stats.defense;
    const damage = Math.max(1, atk.damage * mult * FIGHT.damageScale * this.damageMult);
    const combo = att.comboTimer > 0 ? att.combo + 1 : 1;
    att.combo = combo;
    att.comboTimer = FIGHT.comboTimeout;
    att.stat.maxCombo = Math.max(att.stat.maxCombo, combo);
    att.stat.landed++;
    att.stat.damage += Math.min(damage, def.health);
    att.stat.groundHits = (att.stat.groundHits || 0) + 1;
    att.addMeter(METER.hit * atk.meter);
    def.health -= damage;
    if (this.trainingInfinite && def.health < 1) def.health = 1;
    def.model.flash = 0.7;
    const nx = dist > 1e-4 ? dx / dist : 0;
    const nz = dist > 1e-4 ? dz / dist : 0;
    def.vel.set(nx * atk.knockback * this.knockbackMult, 0, nz * atk.knockback * this.knockbackMult);
    def.mash = Math.max(0, def.mash - 2); // getting kicked makes it harder to get up
    const point = new THREE.Vector3(gp.x, 0.28, gp.z);
    const ev = { type: 'hit', attacker: att, defender: def, attack: atk, damage, counter: null, combo, point, impact: atk.impact, ground: true };
    if (def.health <= 0) {
      def.health = 0;
      def.knockOut();
      ev.ko = true;
      att.stat.knockdowns++;
    }
    events.push(ev);
  }

  _separate(a, b, events) {
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    const min = FIGHTER.radius * 2;
    // no body collision with someone lying on the mat: you can step over (and onto) them
    const lying = (f) => f.state === 'knockdown' || f.state === 'down' || f.state === 'ko' || f.state === 'thrown' || f.state === 'throwing';
    if (d < min && !lying(a) && !lying(b)) {
      const nx = d > 1e-4 ? dx / d : 1;
      const nz = d > 1e-4 ? dz / d : 0;
      const push = (min - d) / 2;
      // a downed fighter doesn't get shoved; the standing one steps around
      const wa = a.isDown ? 0 : b.isDown ? 1 : 0.5;
      const wb = 1 - wa;
      a.pos.x -= nx * push * 2 * wa;
      a.pos.z -= nz * push * 2 * wa;
      b.pos.x += nx * push * 2 * wb;
      b.pos.z += nz * push * 2 * wb;
    }
    for (const f of [a, b]) {
      const slam = f.clampToArena();
      if (slam > 3.5) events.push({ type: 'fence', fighter: f, speed: slam, point: _v.set(f.pos.x, 1.2, f.pos.z).clone() });
    }
  }
}
