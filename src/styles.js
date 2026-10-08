// Fighting styles. A style decides a fighter's special (E) and style move (L).
// The basic jab/cross/hook/uppercut/kick toolkit is shared by everyone.

export const STYLES = {
  boxing: {
    id: 'boxing', name: 'BOXING', special: 'knockoutUppercut', move: 'liverShot',
    blurb: 'Fast hands and body work. The Liver Shot drains their stamina.',
  },
  muaythai: {
    id: 'muaythai', name: 'MUAY THAI', special: 'flyingKnee', move: 'elbow',
    blurb: 'Knees and elbows. The Slashing Elbow opens a cut that keeps bleeding.',
  },
  kickboxing: {
    id: 'kickboxing', name: 'KICKBOXING', special: 'tornadoKick', move: 'headKick',
    blurb: 'Range and power. The Head Kick hits from further away than anything else.',
  },
  wrestling: {
    id: 'wrestling', name: 'WRESTLING', special: 'suplex', move: 'takedown',
    blurb: 'Grab and slam. The Takedown puts them on the mat for your ground kicks.',
  },
  brawling: {
    id: 'brawling', name: 'STREET BRAWLING', special: 'bullRush', move: 'headbutt',
    blurb: 'Dirty and direct. The Headbutt always staggers them.',
  },
};

export const STYLE_ORDER = ['boxing', 'muaythai', 'kickboxing', 'wrestling', 'brawling'];

export const styleOf = (id) => STYLES[id] || STYLES.boxing;
