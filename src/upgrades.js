// Fighter upgrades bought with cash, and the conversion from save data to fighter stats.
import { FIGHTER } from './config.js';

export const UPGRADES = [
  { id: 'health', name: 'CONDITIONING', icon: '♥', desc: '+12 max health', costs: [150, 320, 560, 900, 1400] },
  { id: 'stamina', name: 'CARDIO', icon: '⚡', desc: '+12 max stamina, +6% stamina regen', costs: [140, 300, 520, 850, 1300] },
  { id: 'power', name: 'POWER', icon: '✊', desc: '+7% damage on every strike', costs: [200, 420, 700, 1100, 1700] },
  { id: 'speed', name: 'FOOTWORK', icon: '➤', desc: '+4% movement and attack speed', costs: [180, 380, 650, 1000, 1550] },
  { id: 'recovery', name: 'RECOVERY', icon: '✚', desc: '+10% stamina regen, faster get-ups, health back while down', costs: [160, 340, 600, 950, 1450] },
  { id: 'special', name: 'KILLER INSTINCT', icon: '★', desc: '+15% special meter gain, -10% special cooldown', costs: [220, 460, 780, 1200, 1800] },
];

export const MAX_UPGRADE = 5;

export function upgradeCost(id, level) {
  const u = UPGRADES.find((x) => x.id === id);
  return level >= MAX_UPGRADE ? null : u.costs[level];
}

/** Player fighter stats from upgrades + fighter level. */
export function playerStats(save) {
  const u = save.upgrades;
  const lvl = save.level - 1;
  return {
    maxHealth: FIGHTER.maxHealth + u.health * 12 + lvl * 2,
    maxStamina: FIGHTER.maxStamina + u.stamina * 12,
    power: 1 + u.power * 0.07 + lvl * 0.01,
    speed: 1 + u.speed * 0.04,
    attackSpeed: 1 + u.speed * 0.04,
    defense: 1,
    regen: 1 + u.stamina * 0.06 + u.recovery * 0.1,
    recovery: 1 + u.recovery * 0.15,
    meterGain: 1 + u.special * 0.15,
    cooldown: 1 - u.special * 0.1,
  };
}

/** Opponent stats from roster data. */
export function opponentStats(profile) {
  const s = profile.stats;
  return {
    maxHealth: s.health,
    maxStamina: s.stamina,
    power: s.power,
    speed: s.speed,
    attackSpeed: 0.9 + s.speed * 0.1,
    defense: s.defense,
    regen: 1,
    recovery: 1,
    meterGain: 0.8,
    cooldown: 1.2,
  };
}
