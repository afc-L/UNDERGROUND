// Central tuning values and the opponent roster. Everything gameplay-relevant lives here so
// balancing (or a future server-authoritative mode) only has to touch one file.

export const SIM = {
  maxDt: 1 / 30, // clamp frame time so a hitch never teleports fighters
};

export const ARENA = {
  radius: 6.3, // inner radius fighters are clamped to (octagon cage)
  cageRadius: 7.0, // where the fence stands
  fenceHeight: 2.0,
};

export const FIGHT = {
  duration: 300, // seconds on the fight clock (5 minutes)
  deathMatch: true, // fights only end when someone dies (no T.K.O., no judges)
  maxKnockdowns: 3, // third knockdown ends the fight (T.K.O.) when deathMatch is off
  knockdownWear: { power: 0.12, speed: 0.1, attackSpeed: 0.08, regen: 0.15, max: 3 }, // per knockdown, for the rest of the fight
  suddenDeathDamage: 1.75, // damage multiplier once the clock runs out in a death match
  comboTimeout: 1.4, // seconds between hits before the combo counter resets
  countInterval: 0.7, // seconds per beat a downed fighter stays down (no referee, no visible count)
  damageScale: 0.8, // global damage multiplier (fight length tuning)
  healthScale: 1.8, // every fighter's health (player and opponents) is multiplied by this
};

// Base fighter numbers before upgrades / opponent profiles.
export const FIGHTER = {
  radius: 0.42,
  maxHealth: 100,
  maxStamina: 100,
  staminaRegen: 24, // per second
  staminaRegenDelay: 0.55,
  walkSpeed: 3.5,
  strafeSpeed: 3.1,
  sprintSpeed: 5.8,
  sprintCost: 14, // per second
  blockHoldCost: 2.5, // per second while holding guard
  blockMoveMult: 0.45,
  dodgeCost: 15,
  dodgeSpeed: 10,
  dodgeTime: 0.3,
  dodgeIFrames: 0.22,
  dodgeCooldown: 0.12,
  parryWindow: 0.16, // block pressed this close before a hit = perfect block
  counterWindow: 0.8, // time after a perfect block/dodge where attacks count as counters
  specialMax: 100,
  specialCooldown: 14,
  balanceMax: 100,
  balanceDecay: 8, // per second once not hit for a while
  balanceDelay: 1.6, // seconds after a hit before balance starts recovering
  lowStamina: 0.25, // fraction below which the fighter is exhausted
  turnRate: 13,
};

// Special meter gains
export const METER = {
  hit: 4.5, // per landed hit (scaled by attack meter factor)
  counter: 12,
  perfectDodge: 14,
  perfectBlock: 10,
  takenHit: 2.5,
};

// AI difficulty presets. Opponent personalities layer on top of these.
export const DIFFICULTY = {
  easy: {
    label: 'EASY',
    reaction: 0.5, // seconds before the AI can respond to an incoming attack
    blockChance: 0.18,
    dodgeChance: 0.05,
    counterChance: 0.08,
    comboLength: 2,
    comboChance: 0.45,
    thinkRate: 0.55, // seconds between decisions
    reads: false,
    staminaSmart: false,
    specialUse: 0,
  },
  normal: {
    label: 'NORMAL',
    reaction: 0.3,
    blockChance: 0.42,
    dodgeChance: 0.16,
    counterChance: 0.35,
    comboLength: 3,
    comboChance: 0.65,
    thinkRate: 0.35,
    reads: false,
    staminaSmart: true,
    specialUse: 0.5,
  },
  hard: {
    label: 'HARD',
    reaction: 0.18,
    blockChance: 0.55,
    dodgeChance: 0.26,
    counterChance: 0.7,
    comboLength: 4,
    comboChance: 0.85,
    thinkRate: 0.2,
    reads: true,
    staminaSmart: true,
    specialUse: 1,
  },
};

// Appearance: skin, hair style/color, top type/color, shorts, gloves, accessory, build.
export const PLAYER_DEFAULT_LOOK = {
  skin: '#c68e62',
  hair: 'short',
  hairColor: '#1b1410',
  beard: false,
  top: 'none',
  topColor: '#1d1d22',
  shorts: '#c81e3c',
  shortsTrim: '#f2f2f2',
  gloves: '#d7263d',
  shoes: '#202024',
  accessory: 'none',
  accessoryColor: '#ffffff',
  build: { height: 1.0, bulk: 1.0, arms: 1.0, head: 1.0, belly: 0 },
};

export const OPPONENTS = [
  {
    id: 'rookie',
    fightStyle: 'boxing',
    title: 'THE ROOKIE',
    name: 'Danny "Fresh" Okafor',
    style: 'Balanced',
    blurb: 'First night in the pit. Fast hands, no plan.',
    difficulty: 'easy',
    stats: { health: 85, power: 0.85, speed: 1.0, defense: 0.9, stamina: 100 },
    personality: { aggression: 0.75, heavyPref: 0.2, kickPref: 0.25, range: 1.2, specialUse: 0, evasive: 0 },
    reward: { cash: 220, rep: 10, xp: 60 },
    reqRep: 0,
    look: {
      skin: '#8d5a3b', hair: 'buzz', hairColor: '#120c08', top: 'tank', topColor: '#e8e8e8',
      shorts: '#2b6cd6', shortsTrim: '#ffffff', gloves: '#2b6cd6', shoes: '#f0f0f0', accessory: 'none',
      build: { height: 0.97, bulk: 0.92, arms: 1.0, head: 1.0, belly: 0 },
    },
    accent: '#3d8bff',
  },
  {
    id: 'brawler',
    fightStyle: 'brawling',
    title: 'THE BRAWLER',
    name: 'Bruno "Anvil" Kask',
    style: 'Slow but powerful',
    blurb: 'Hits like a dropped engine block. Bring legs.',
    difficulty: 'easy',
    stats: { health: 125, power: 1.35, speed: 0.78, defense: 0.85, stamina: 110 },
    personality: { aggression: 0.8, heavyPref: 0.6, kickPref: 0.1, range: 1.15, specialUse: 0.5, evasive: 0 },
    reward: { cash: 380, rep: 18, xp: 90 },
    reqRep: 10,
    look: {
      skin: '#e0ab8b', hair: 'bald', hairColor: '#3a2a20', beard: true, top: 'none', topColor: '#333',
      shorts: '#3a3a3a', shortsTrim: '#d9a400', gloves: '#5a3a22', shoes: '#111', accessory: 'none',
      build: { height: 1.08, bulk: 1.35, arms: 1.05, head: 1.08, belly: 0.25 },
    },
    accent: '#d9a400',
  },
  {
    id: 'technician',
    fightStyle: 'kickboxing',
    title: 'THE TECHNICIAN',
    name: 'Ilse "Metronome" Varga',
    style: 'Fast and defensive',
    blurb: 'Blocks everything, counters the rest.',
    difficulty: 'normal',
    stats: { health: 105, power: 0.95, speed: 1.18, defense: 1.25, stamina: 115 },
    personality: { aggression: 0.4, heavyPref: 0.25, kickPref: 0.35, range: 1.35, specialUse: 0.6, evasive: 0.05, defensive: 0.2 },
    reward: { cash: 560, rep: 28, xp: 130 },
    reqRep: 28,
    look: {
      skin: '#f1c9a5', hair: 'long', hairColor: '#d8d2c8', top: 'tee', topColor: '#14b8a6',
      shorts: '#0f172a', shortsTrim: '#14b8a6', gloves: '#e5e7eb', shoes: '#14b8a6', accessory: 'headband', accessoryColor: '#14b8a6',
      build: { height: 0.98, bulk: 0.88, arms: 1.05, head: 0.98, belly: 0 },
    },
    accent: '#14b8a6',
  },
  {
    id: 'ghost',
    fightStyle: 'muaythai',
    title: 'THE GHOST',
    name: 'Rui "Static" Holt',
    style: 'Evasive counter-striker',
    blurb: 'You will swing at air. A lot.',
    difficulty: 'normal',
    stats: { health: 110, power: 1.05, speed: 1.25, defense: 1.0, stamina: 120 },
    personality: { aggression: 0.45, heavyPref: 0.3, kickPref: 0.5, range: 1.5, specialUse: 0.8, evasive: 0.3 },
    reward: { cash: 760, rep: 40, xp: 170 },
    reqRep: 50,
    look: {
      skin: '#d9b08c', hair: 'mohawk', hairColor: '#e6e6f0', top: 'hoodie', topColor: '#22222b',
      shorts: '#22222b', shortsTrim: '#a78bfa', gloves: '#a78bfa', shoes: '#22222b', accessory: 'mask', accessoryColor: '#e6e6f0',
      build: { height: 1.02, bulk: 0.9, arms: 1.08, head: 0.96, belly: 0 },
    },
    accent: '#a78bfa',
  },
  {
    id: 'beast',
    fightStyle: 'wrestling',
    title: 'THE BEAST',
    name: 'Volkan "Furnace" Dragan',
    style: 'Relentless aggression',
    blurb: 'Never stops coming. Never.',
    difficulty: 'hard',
    stats: { health: 140, power: 1.2, speed: 1.08, defense: 0.9, stamina: 140 },
    personality: { aggression: 0.95, heavyPref: 0.45, kickPref: 0.3, range: 1.1, specialUse: 1, evasive: 0, defensive: -0.25 },
    reward: { cash: 1050, rep: 60, xp: 230 },
    reqRep: 80,
    look: {
      skin: '#b07650', hair: 'long', hairColor: '#0d0d0d', beard: true, top: 'none', topColor: '#000',
      shorts: '#7f1d1d', shortsTrim: '#111111', gloves: '#111111', shoes: '#111', accessory: 'none',
      build: { height: 1.12, bulk: 1.28, arms: 1.1, head: 1.02, belly: 0.05 },
    },
    accent: '#ef4444',
  },
  {
    id: 'champion',
    fightStyle: 'muaythai',
    title: 'THE CHAMPION',
    name: 'Aurelio "The Crown" Sandoval',
    style: 'Complete fighter',
    blurb: 'Undefeated in the pit. Adapts to everything you do.',
    difficulty: 'hard',
    stats: { health: 160, power: 1.25, speed: 1.15, defense: 1.2, stamina: 150 },
    personality: { aggression: 0.65, heavyPref: 0.35, kickPref: 0.35, range: 1.3, specialUse: 1, evasive: 0.1 },
    reward: { cash: 1600, rep: 100, xp: 340 },
    reqRep: 120,
    look: {
      skin: '#6b4430', hair: 'short', hairColor: '#0a0a0a', beard: true, top: 'none', topColor: '#000',
      shorts: '#f5c518', shortsTrim: '#111111', gloves: '#f5c518', shoes: '#f5c518', accessory: 'chain', accessoryColor: '#f5c518',
      build: { height: 1.06, bulk: 1.12, arms: 1.05, head: 1.0, belly: 0 },
    },
    accent: '#f5c518',
  },
];

// Training partner used in TRAINING mode.
export const TRAINING_DUMMY = {
  id: 'sparring',
  fightStyle: 'boxing',
  title: 'SPARRING PARTNER',
  name: 'Gym Regular',
  style: 'Practice',
  blurb: '',
  difficulty: 'easy',
  stats: { health: 150, power: 0.5, speed: 0.9, defense: 1, stamina: 100 },
  personality: { aggression: 0.5, heavyPref: 0.2, kickPref: 0.2, range: 1.2, specialUse: 0, evasive: 0 },
  reward: { cash: 0, rep: 0, xp: 0 },
  look: {
    skin: '#a87452', hair: 'short', hairColor: '#2a1d14', top: 'tee', topColor: '#555b66',
    shorts: '#555b66', shortsTrim: '#9aa0aa', gloves: '#e6e6e6', shoes: '#333', accessory: 'headgear', accessoryColor: '#c02030',
    build: { height: 1.0, bulk: 1.0, arms: 1.0, head: 1.0, belly: 0.05 },
  },
  accent: '#9aa0aa',
};

export const TOURNAMENT = {
  name: 'THE PIT INVITATIONAL',
  rewardScale: 0.6, // per-fight rewards are reduced; the grand prize makes up for it
  grandPrize: { cash: 3000, rep: 80, xp: 400 },
};

export const DEFAULT_SETTINGS = {
  master: 0.8,
  music: 0.5,
  sfx: 0.9,
  sensitivity: 1.0,
  invertY: false,
  shake: 1.0,
  quality: 'high', // 'high' | 'low'
  damageNumbers: true,
  blood: true,
};

// ---------------------------------------------------------------------------------------------
// THE CRUCIBLE: super-powered Kronari warriors (an original alien warrior race). Huge health,
// triple damage, double knockback, extra gore, no clock, no flying.
export const CRUCIBLE = {
  name: 'THE CRUCIBLE',
  damageMult: 3,
  knockbackMult: 2.4,
  goreScale: 3,
  healthLabel: 'KRONARI CONSTITUTION',
};

export const KRONARI = [
  {
    id: 'vorath',
    title: 'VORATH',
    name: 'Vorath the Unbroken',
    style: 'Old general. Grabs and breaks.',
    blurb: 'Has ended wars by himself. Bored by this one.',
    fightStyle: 'wrestling',
    difficulty: 'hard',
    stats: { health: 1100, power: 1.15, speed: 1.0, defense: 1.2, stamina: 160 },
    personality: { aggression: 0.7, heavyPref: 0.45, kickPref: 0.2, range: 1.15, specialUse: 1, evasive: 0 },
    look: {
      skin: '#e3b796', hair: 'short', hairColor: '#e8e8ea', beard: 'mustache', top: 'suit', topColor: '#141418', legs: '#141418',
      shorts: '#141418', shortsTrim: '#8b1020', shoes: '#8b1020', cape: '#8b1020', accessory: 'none',
      build: { height: 1.1, bulk: 1.22, arms: 1.05, head: 1.0, belly: 0 },
    },
    accent: '#e11d48',
  },
  {
    id: 'seryn',
    title: 'SERYN KAEL',
    name: 'Seryn Kael',
    style: 'Fastest blade in the Kronari line.',
    blurb: 'Kicks hard enough to fold steel.',
    fightStyle: 'kickboxing',
    difficulty: 'hard',
    stats: { health: 950, power: 1.05, speed: 1.25, defense: 1.0, stamina: 170 },
    personality: { aggression: 0.6, heavyPref: 0.3, kickPref: 0.6, range: 1.45, specialUse: 1, evasive: 0.25 },
    look: {
      skin: '#c9946d', hair: 'long', hairColor: '#111114', top: 'suit', topColor: '#c8ccd6', legs: '#2a3550',
      shorts: '#2a3550', shortsTrim: '#c8ccd6', shoes: '#2a3550', accessory: 'none',
      build: { height: 1.03, bulk: 0.95, arms: 1.05, head: 0.98, belly: 0 },
    },
    accent: '#7dd3fc',
  },
  {
    id: 'draxus',
    title: 'DRAXUS',
    name: 'Draxus the Butcher',
    style: 'Pure violence. No technique needed.',
    blurb: 'Collects teeth.',
    fightStyle: 'brawling',
    difficulty: 'hard',
    stats: { health: 1250, power: 1.3, speed: 0.88, defense: 1.1, stamina: 150 },
    personality: { aggression: 0.95, heavyPref: 0.55, kickPref: 0.15, range: 1.1, specialUse: 1, evasive: 0, defensive: -0.2 },
    look: {
      skin: '#9c6a4c', hair: 'bald', hairColor: '#222', beard: true, scar: true, top: 'suit', topColor: '#5a1015', legs: '#1a1a1d',
      shorts: '#1a1a1d', shortsTrim: '#5a1015', shoes: '#1a1a1d', accessory: 'none',
      build: { height: 1.15, bulk: 1.38, arms: 1.1, head: 1.05, belly: 0.05 },
    },
    accent: '#dc2626',
  },
  {
    id: 'ilyon',
    title: 'ILYON',
    name: 'Ilyon, Heir of Kharos',
    style: 'Young, proud, and quicker than he looks.',
    blurb: 'Has never lost. Has never been hit hard.',
    fightStyle: 'boxing',
    difficulty: 'normal',
    stats: { health: 1000, power: 1.1, speed: 1.12, defense: 1.0, stamina: 165 },
    personality: { aggression: 0.75, heavyPref: 0.3, kickPref: 0.2, range: 1.2, specialUse: 1, evasive: 0.1 },
    look: {
      skin: '#f0c9a8', hair: 'short', hairColor: '#2b1d14', top: 'suit', topColor: '#14532d', legs: '#0b0b0d',
      shorts: '#0b0b0d', shortsTrim: '#14532d', shoes: '#0b0b0d', cape: '#0b0b0d', accessory: 'none',
      build: { height: 1.02, bulk: 1.02, arms: 1.0, head: 1.0, belly: 0 },
    },
    accent: '#22c55e',
  },
  {
    id: 'kalla',
    title: 'KALLA THRANE',
    name: 'Kalla Thrane',
    style: 'Executioner of the Kronari court.',
    blurb: 'Knees first. Questions never.',
    fightStyle: 'muaythai',
    difficulty: 'hard',
    stats: { health: 1050, power: 1.2, speed: 1.1, defense: 1.1, stamina: 160 },
    personality: { aggression: 0.8, heavyPref: 0.4, kickPref: 0.4, range: 1.25, specialUse: 1, evasive: 0.1 },
    look: {
      skin: '#7a4f36', hair: 'mohawk', hairColor: '#f5c518', top: 'suit', topColor: '#0b0b0d', legs: '#0b0b0d',
      shorts: '#0b0b0d', shortsTrim: '#f5c518', shoes: '#f5c518', cape: '#a1820f', accessory: 'none',
      build: { height: 1.06, bulk: 1.1, arms: 1.05, head: 1.0, belly: 0 },
    },
    accent: '#f5c518',
  },
];
