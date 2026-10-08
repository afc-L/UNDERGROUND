// Attack definitions: timing (seconds), damage, reach and the two key poses each move blends between.
// `next` is the combo tree: pressing light/heavy during the cancel window chains into that move.
import { GUARD, makePose } from './poses.js';

const A = (spec) => {
  const atk = {
    kind: 'light',
    limb: 'punch',
    height: 'high',
    side: 0, // -1 = sweeps from the left, +1 = from the right (hit reaction direction)
    arc: 70,
    lunge: 0,
    lungeStart: 0.4, // fraction of startup when the forward step begins
    hitstun: 0.25,
    blockstun: 0.16,
    knockback: 1.5,
    impact: 1, // 1..5 drives the strength of visual/audio feedback
    balance: 8,
    guardDamage: 0,
    meter: 1,
    cancel: 0.75, // fraction of recovery during which a chain input is accepted
    next: {},
    spin: 0,
    armor: false,
    sound: 'punchLight',
    ...spec,
  };
  atk.windup = makePose(spec.windup || {}, GUARD);
  atk.strike = makePose(spec.strike || {}, GUARD);
  atk.total = atk.startup + atk.active + atk.recovery;
  return atk;
};

export const ATTACKS = {
  jab: A({
    id: 'jab', name: 'JAB', side: -1,
    startup: 0.085, active: 0.06, recovery: 0.16,
    damage: 4, stamina: 6, range: 1.3, arc: 60, lunge: 2.2,
    hitstun: 0.26, knockback: 1.2, balance: 6,
    next: { light: 'cross', heavy: 'roundhouse' },
    windup: { spine: [0.18, -0.1, 0], lSh: [-1.1, 0.1, -0.3], lEl: -2.2 },
    strike: { root: [0, 0.08, 0], spine: [0.2, -0.45, 0], head: [0.1, 0.6, 0], lSh: [-1.55, 0.55, 0], lEl: -0.08, lHip: [-0.5, 0.35, 0.1] },
  }),
  cross: A({
    id: 'cross', name: 'CROSS', side: 1,
    startup: 0.11, active: 0.06, recovery: 0.2,
    damage: 6, stamina: 8, range: 1.4, arc: 60, lunge: 2.6,
    hitstun: 0.3, knockback: 1.8, balance: 9,
    next: { light: 'hook', heavy: 'roundhouse' },
    windup: { spine: [0.15, -0.35, 0], rSh: [-0.9, 0.3, 0.4], rEl: -2.3 },
    strike: { root: [0, 0.12, 0], spine: [0.22, 0.42, 0], head: [0.1, 0.0, 0], pelvis: [0, 0.05, 0], rSh: [-1.55, -0.12, 0], rEl: -0.06, rHip: [0.35, 0.6, -0.1], rKn: 0.25 },
  }),
  hook: A({
    id: 'hook', name: 'HOOK', side: -1,
    startup: 0.14, active: 0.07, recovery: 0.24,
    damage: 8, stamina: 10, range: 1.25, arc: 95, lunge: 1.6,
    hitstun: 0.34, knockback: 2.4, impact: 2, balance: 13, sound: 'punchMed',
    next: { light: 'uppercut', heavy: 'spinKick' },
    windup: { spine: [0.15, 0.35, 0], head: [0.1, 0.0, 0], lSh: [-0.2, 0.7, 1.45], lEl: -1.5 },
    strike: { root: [0, 0.06, 0], spine: [0.2, 0.45, -0.1], head: [0.1, -0.1, 0], pelvis: [0, 0.1, 0], lSh: [-0.15, -0.75, 1.45], lEl: -1.45, lHip: [-0.4, 0.6, 0.1] },
  }),
  uppercut: A({
    id: 'uppercut', name: 'UPPERCUT', side: 1,
    startup: 0.16, active: 0.07, recovery: 0.34,
    damage: 11, stamina: 13, range: 1.2, arc: 65, lunge: 1.3,
    hitstun: 0.45, knockback: 3.6, impact: 3, balance: 22, sound: 'punchHeavy',
    next: { heavy: 'spinKick' },
    windup: { pelvisY: -0.22, spine: [0.4, 0.1, 0.15], rSh: [-0.35, 0, 0.25], rEl: -1.95, lHip: [-0.5, 0.35, 0.1], lKn: 0.7, rKn: 0.7 },
    strike: { root: [0.04, 0.08, 0], pelvisY: 0.0, spine: [-0.15, 0.45, -0.1], head: [-0.15, -0.1, 0], rSh: [-1.35, -0.15, 0.1], rEl: -1.75, lKn: 0.2, rKn: 0.2 },
  }),
  haymaker: A({
    id: 'haymaker', name: 'HAYMAKER', kind: 'heavy', side: 1,
    startup: 0.3, active: 0.08, recovery: 0.4,
    damage: 15, stamina: 19, range: 1.5, arc: 70, lunge: 4.2, lungeStart: 0.55,
    hitstun: 0.5, blockstun: 0.32, knockback: 5, impact: 3, balance: 30, guardDamage: 12, meter: 1.4, sound: 'punchHeavy',
    next: { light: 'hook' },
    windup: { spine: [-0.05, -0.6, 0], head: [0.05, 0.6, 0], pelvisY: -0.04, rSh: [-0.7, 0.3, -1.25], rEl: -1.8, lSh: [-1.2, 0.2, -0.4] },
    strike: { root: [0, 0.25, 0], pelvisY: -0.14, spine: [0.45, 0.55, 0], head: [0.2, -0.2, 0], pelvis: [0, 0.15, 0], rSh: [-1.9, -0.3, 0.1], rEl: -0.25, lHip: [-0.75, 0.35, 0.1], lKn: 0.7, rHip: [0.5, 0.6, -0.1], rKn: 0.2 },
  }),
  roundhouse: A({
    id: 'roundhouse', name: 'ROUNDHOUSE', kind: 'heavy', limb: 'kick', height: 'mid', side: 1,
    startup: 0.25, active: 0.08, recovery: 0.36,
    damage: 13, stamina: 17, range: 1.8, arc: 110, lunge: 1.4,
    hitstun: 0.45, blockstun: 0.3, knockback: 5.4, impact: 3, balance: 28, guardDamage: 10, meter: 1.3, sound: 'kick',
    next: { light: 'cross' },
    windup: { pelvis: [0, 0.2, 0], spine: [-0.1, -0.2, 0], rHip: [-0.9, 0.6, -0.5], rKn: 1.75, lKn: 0.3, rSh: [-0.4, 0, -0.2], rEl: -1.6 },
    strike: { pelvis: [0, 0.65, 0], spine: [-0.32, -0.3, 0.15], head: [0.1, -0.3, 0], rHip: [0, 1.2, -1.45], rKn: 0.12, lHip: [0, 0.1, 0.08], lKn: 0.25, rSh: [-0.2, 0, -0.6], rEl: -1.1, lSh: [-1.3, 0.2, -0.4] },
  }),
  spinKick: A({
    id: 'spinKick', name: 'SPINNING HEEL KICK', kind: 'heavy', limb: 'kick', side: 1,
    startup: 0.33, active: 0.09, recovery: 0.44,
    damage: 18, stamina: 24, range: 1.85, arc: 130, lunge: 2.6,
    hitstun: 0.6, blockstun: 0.36, knockback: 7, impact: 4, balance: 45, guardDamage: 16, meter: 1.7, spin: -1, sound: 'kick',
    windup: { pelvisY: -0.1, pelvis: [0, 0.3, 0], spine: [0.1, 0.2, 0], rHip: [-0.5, 0.4, -0.4], rKn: 1.6 },
    strike: { pelvis: [0, 0.75, 0], spine: [-0.38, -0.3, 0.2], head: [0.1, -0.4, 0], rHip: [0, 1.3, -1.6], rKn: 0.05, lKn: 0.3, rSh: [-0.3, 0, -0.8], rEl: -0.9, lSh: [-0.6, 0, 0.5] },
  }),
  // Ground attacks: only used on a downed opponent (pressing J / K next to them)
  stomp: A({
    id: 'stomp', name: 'STOMP', ground: true, limb: 'kick', height: 'low', side: 1,
    startup: 0.17, active: 0.08, recovery: 0.3,
    damage: 6, stamina: 9, range: 1.1, arc: 80, lunge: 1.2,
    knockback: 0.6, impact: 2, balance: 0, meter: 0.8, sound: 'kick',
    next: { light: 'stomp', heavy: 'soccerKick' },
    windup: { spine: [0.15, 0, 0], rHip: [-1.3, 0.2, -0.1], rKn: 1.9, lKn: 0.25, lSh: [-0.6, 0, 0.6], lEl: -1.2, rSh: [-0.5, 0, -0.6], rEl: -1.2 },
    strike: { spine: [0.4, 0, 0], head: [0.45, 0, 0], pelvisY: -0.06, rHip: [-0.55, 0.1, -0.05], rKn: 0.15, lKn: 0.35, lSh: [-0.5, 0, 0.7], lEl: -1.0, rSh: [-0.4, 0, -0.7], rEl: -1.0 },
  }),
  soccerKick: A({
    id: 'soccerKick', name: 'GROUND KICK', kind: 'heavy', ground: true, limb: 'kick', height: 'low', side: 1,
    startup: 0.27, active: 0.08, recovery: 0.4,
    damage: 11, stamina: 15, range: 1.2, arc: 80, lunge: 1.6,
    knockback: 2.5, impact: 3, balance: 0, meter: 1.2, sound: 'kick',
    next: { light: 'stomp' },
    windup: { spine: [-0.05, -0.2, 0], rHip: [0.7, 0, -0.1], rKn: 1.3, lKn: 0.3, lSh: [-0.9, 0, 0.4], rSh: [0.3, 0, -0.3] },
    strike: { spine: [0.3, 0.2, 0], head: [0.35, 0, 0], rHip: [-1.0, 0, -0.05], rKn: 0.1, lKn: 0.35, lSh: [0.3, 0, 0.4], rSh: [-0.9, 0, -0.3], rEl: -0.8 },
  }),
  special: A({
    id: 'special', name: 'UNDERGROUND BREAKER', kind: 'special', side: 1,
    startup: 0.55, active: 0.12, recovery: 0.6,
    damage: 30, stamina: 22, range: 1.75, arc: 80, lunge: 11, lungeStart: 0.62,
    hitstun: 0.9, blockstun: 0.5, knockback: 10, impact: 5, balance: 100, guardDamage: 40, meter: 0, armor: true, sound: 'punchHeavy',
    windup: { pelvisY: -0.32, spine: [0.55, -0.6, 0.2], head: [0.1, 0.6, 0], rSh: [0.45, 0, -0.5], rEl: -1.4, lSh: [-1.2, 0.2, -0.4], lHip: [-0.6, 0.35, 0.1], lKn: 0.9, rKn: 0.9 },
    strike: { root: [0.16, 0.2, 0], pelvisY: 0.06, spine: [-0.35, 0.55, -0.2], head: [-0.45, -0.2, 0], rSh: [-2.65, -0.2, 0.15], rEl: -0.45, lSh: [-0.3, 0, 0.6], lEl: -1.2, lHip: [-1.2, 0, 0.1], lKn: 1.4, rHip: [0.2, 0, 0], rKn: 0.3 },
  }),
};

/** Resolve which move a light/heavy press produces given the current attack (if any). */
export function chainAttack(current, kind) {
  if (!current) return kind === 'light' ? ATTACKS.jab : ATTACKS.haymaker;
  const id = current.next[kind];
  return id ? ATTACKS[id] : null;
}
