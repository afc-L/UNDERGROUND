// Persistent career: cash, reputation, XP/levels, upgrades, wins and unlocks (localStorage only).
import { OPPONENTS, PLAYER_DEFAULT_LOOK, DEFAULT_SETTINGS, TOURNAMENT, FIGHT } from './config.js';
import { upgradeCost } from './upgrades.js';

const KEY = 'underground.save.v1';

function defaults() {
  return {
    name: 'NO NAME',
    look: JSON.parse(JSON.stringify(PLAYER_DEFAULT_LOOK)),
    cash: 150,
    rep: 0,
    xp: 0,
    level: 1,
    upgrades: { health: 0, stamina: 0, power: 0, speed: 0, recovery: 0, special: 0 },
    wins: {}, // opponentId -> count
    record: { w: 0, l: 0, ko: 0 },
    tournamentWins: 0,
    champion: false,
    settings: { ...DEFAULT_SETTINGS },
  };
}

export const xpForLevel = (level) => Math.round(120 * Math.pow(level, 1.45));

export class Progression {
  constructor() {
    this.data = defaults();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const base = defaults();
        this.data = {
          ...base, ...d,
          look: { ...base.look, ...(d.look || {}), build: { ...base.look.build, ...((d.look && d.look.build) || {}) } },
          upgrades: { ...base.upgrades, ...(d.upgrades || {}) },
          record: { ...base.record, ...(d.record || {}) },
          settings: { ...base.settings, ...(d.settings || {}) },
        };
      }
    } catch {
      this.data = defaults();
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage may be unavailable (private mode) — progress just won't persist */
    }
  }

  reset() {
    const settings = this.data.settings;
    this.data = defaults();
    this.data.settings = settings;
    this.save();
  }

  isUnlocked(opp) {
    const i = OPPONENTS.indexOf(opp);
    if (i <= 0) return true;
    const prevBeaten = !!this.data.wins[OPPONENTS[i - 1].id];
    return prevBeaten && this.data.rep >= opp.reqRep;
  }

  lockReason(opp) {
    const i = OPPONENTS.indexOf(opp);
    const prev = OPPONENTS[i - 1];
    const parts = [];
    if (prev && !this.data.wins[prev.id]) parts.push(`Beat ${prev.title}`);
    if (this.data.rep < opp.reqRep) parts.push(`${opp.reqRep} REP`);
    return parts.join(' + ');
  }

  buyUpgrade(id) {
    const lvl = this.data.upgrades[id];
    const cost = upgradeCost(id, lvl);
    if (cost == null || this.data.cash < cost) return false;
    this.data.cash -= cost;
    this.data.upgrades[id] = lvl + 1;
    this.save();
    return true;
  }

  /**
   * Apply the result of a fight. Returns a summary for the results screen.
   * @param {object} r { opponent, won, ko, tko, perfect, stats, tournament }
   */
  award(r) {
    const d = this.data;
    const opp = r.opponent;
    const scale = r.tournament ? TOURNAMENT.rewardScale : 1;
    const before = OPPONENTS.filter((o) => this.isUnlocked(o)).map((o) => o.id);
    const lines = [];
    let cash = 0;
    let rep = 0;
    let xp = 0;
    if (r.won) {
      cash = Math.round(opp.reward.cash * scale);
      rep = opp.reward.rep;
      xp = opp.reward.xp;
      lines.push(['Win purse', cash]);
      if (r.ko) {
        const b = Math.round(cash * 0.25);
        lines.push([FIGHT.deathMatch ? 'Kill bonus' : r.tko ? 'TKO bonus' : 'Knockout bonus', b]);
        cash += b;
        rep += Math.round(rep * 0.25);
        xp += Math.round(xp * 0.2);
      }
      if (r.perfect) {
        const b = Math.round(opp.reward.cash * 0.3);
        lines.push(['Untouched bonus', b]);
        cash += b;
        rep += 5;
      }
      if (!d.wins[opp.id]) {
        const b = Math.round(opp.reward.cash * 0.5);
        lines.push(['First win bonus', b]);
        cash += b;
      }
      const styleBonus = Math.min(120, r.stats.maxCombo * 6 + r.stats.counters * 8);
      if (styleBonus > 0) {
        lines.push(['Style (combos & counters)', styleBonus]);
        cash += styleBonus;
      }
      d.wins[opp.id] = (d.wins[opp.id] || 0) + 1;
      d.record.w++;
      if (r.ko) d.record.ko++;
    } else {
      cash = Math.round(opp.reward.cash * 0.2);
      xp = Math.round(opp.reward.xp * 0.35);
      rep = -Math.min(d.rep, 2);
      lines.push(['Show money', cash]);
      d.record.l++;
    }
    d.cash += cash;
    d.rep = Math.max(0, d.rep + rep);
    d.xp += xp;
    let levelUps = 0;
    while (d.xp >= xpForLevel(d.level)) {
      d.xp -= xpForLevel(d.level);
      d.level++;
      levelUps++;
      d.cash += 100;
      lines.push([`Level ${d.level} bonus`, 100]);
      cash += 100;
    }
    const after = OPPONENTS.filter((o) => this.isUnlocked(o));
    const unlocked = after.filter((o) => !before.includes(o.id)).map((o) => o.title);
    this.save();
    return { cash, rep, xp, levelUps, level: d.level, unlocked, lines };
  }

  awardTournament() {
    const d = this.data;
    const p = TOURNAMENT.grandPrize;
    d.cash += p.cash;
    d.rep += p.rep;
    d.xp += p.xp;
    d.tournamentWins++;
    d.champion = true;
    while (d.xp >= xpForLevel(d.level)) {
      d.xp -= xpForLevel(d.level);
      d.level++;
    }
    this.save();
    return p;
  }
}
