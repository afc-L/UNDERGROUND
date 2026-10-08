// Pose data for the procedural fighter rig.
// A pose is a flat Float32Array so blending every frame allocates nothing.
// Rig convention: the fighter faces +Z, its left side is +X. Rotations are radians.
// Shoulders and hips use Euler order YXZ: z = raise sideways, x = swing forward (x < 0), y = aim left/right.
//   elbow x < 0 bends the forearm up/forward, knee x > 0 bends the shin back,
//   spine x > 0 leans forward, spine y < 0 turns the left shoulder forward (orthodox stance).

export const LAYOUT = [
  ['root', 3], // [lift y, forward z, yaw]
  ['tilt', 2], // whole-body tilt around the feet [x, z]
  ['pelvisY', 1],
  ['pelvis', 3],
  ['spine', 3],
  ['head', 3],
  ['lSh', 3],
  ['lEl', 1],
  ['rSh', 3],
  ['rEl', 1],
  ['lHip', 3],
  ['lKn', 1],
  ['rHip', 3],
  ['rKn', 1],
];

export const IDX = {};
let size = 0;
for (const [name, n] of LAYOUT) {
  IDX[name] = size;
  size += n;
}
export const POSE_SIZE = size;

export function makePose(spec, base) {
  const p = base ? Float32Array.from(base) : new Float32Array(POSE_SIZE);
  for (const key in spec) {
    const i = IDX[key];
    if (i === undefined) throw new Error(`Unknown pose key ${key}`);
    const v = spec[key];
    if (typeof v === 'number') p[i] = v;
    else for (let k = 0; k < v.length; k++) p[i + k] = v[k];
  }
  return p;
}

/** Linear blend a→b into out. */
export function lerpPose(out, a, b, t) {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

/** Exponential approach of cur toward target (k = 1 - exp(-rate*dt)). */
export function approachPose(cur, target, k) {
  for (let i = 0; i < POSE_SIZE; i++) cur[i] += (target[i] - cur[i]) * k;
}

// ---------------------------------------------------------------------------------------------
// Core stance poses

export const GUARD = makePose({
  pelvisY: -0.07,
  pelvis: [0, -0.35, 0],
  spine: [0.14, -0.2, 0],
  head: [0.1, 0.5, 0],
  lSh: [-0.95, 0.15, -0.35],
  lEl: -2.05,
  rSh: [-0.75, 0.3, 0.45],
  rEl: -2.35,
  lHip: [-0.27, 0.35, 0.08],
  lKn: 0.36,
  rHip: [0.2, 0.35, -0.08],
  rKn: 0.4,
});

export const RELAXED = makePose({
  pelvisY: 0,
  spine: [0.02, 0, 0],
  lSh: [-0.1, 0, 0.12],
  lEl: -0.35,
  rSh: [-0.1, 0, -0.12],
  rEl: -0.35,
  lHip: [0, 0, 0.04],
  lKn: 0.05,
  rHip: [0, 0, -0.04],
  rKn: 0.05,
});

export const BLOCK = makePose({
  pelvisY: -0.12,
  spine: [0.32, -0.08, 0],
  head: [0.32, 0.2, 0],
  lSh: [-1.5, 0.1, -0.5],
  lEl: -2.45,
  rSh: [-1.5, 0.1, 0.5],
  rEl: -2.45,
}, GUARD);

export const DODGE = makePose({
  pelvisY: -0.24,
  spine: [0.45, -0.1, 0],
  head: [0.2, 0.3, 0],
  lSh: [-1.2, 0.1, -0.45],
  lEl: -2.3,
  rSh: [-1.2, 0.1, 0.45],
  rEl: -2.3,
  lHip: [-0.7, 0.3, 0.2],
  lKn: 0.9,
  rHip: [0.1, 0.3, -0.2],
  rKn: 0.9,
}, GUARD);

export const HIT_HEAD = makePose({
  spine: [-0.32, -0.1, 0],
  head: [-0.6, 0.3, 0],
  lSh: [-0.5, 0, 0.35],
  lEl: -1.1,
  rSh: [-0.45, 0, -0.35],
  rEl: -1.0,
  pelvisY: -0.1,
}, GUARD);

export const HIT_BODY = makePose({
  spine: [0.62, -0.1, 0],
  head: [0.35, 0.3, 0],
  pelvisY: -0.16,
  lSh: [-0.5, 0, -0.5],
  lEl: -2.1,
  rSh: [-0.5, 0, 0.5],
  rEl: -2.1,
}, GUARD);

export const STAGGER = makePose({
  spine: [-0.25, 0.2, 0.25],
  head: [-0.35, -0.2, 0.25],
  pelvisY: -0.22,
  lSh: [-0.2, 0, 0.6],
  lEl: -0.6,
  rSh: [-0.25, 0, -0.5],
  rEl: -0.7,
  lHip: [-0.2, 0.2, 0.15],
  lKn: 0.7,
  rHip: [0.25, 0.2, -0.15],
  rKn: 0.55,
}, GUARD);

export const DOWN = makePose({
  root: [0.14, 0, 0],
  tilt: [-1.5, 0],
  pelvisY: -0.02,
  pelvis: [0, 0, 0],
  spine: [-0.1, 0, 0.05],
  head: [-0.2, 0.5, 0],
  lSh: [-0.3, 0, 1.3],
  lEl: -0.5,
  rSh: [-0.2, 0, -1.2],
  rEl: -0.8,
  lHip: [-0.3, 0, 0.25],
  lKn: 0.6,
  rHip: [-0.05, 0, -0.2],
  rKn: 0.15,
});

export const KNEEL = makePose({
  pelvisY: -0.48,
  pelvis: [0, 0, 0],
  spine: [0.55, 0, 0],
  head: [0.3, 0, 0],
  lSh: [-0.8, 0, -0.1],
  lEl: -0.6,
  rSh: [-0.4, 0, -0.15],
  rEl: -0.3,
  lHip: [-1.45, 0, 0.1],
  lKn: 1.5,
  rHip: [0.3, 0, -0.1],
  rKn: 1.9,
});

export const VICTORY = makePose({
  pelvisY: 0,
  pelvis: [0, 0, 0],
  spine: [-0.15, 0, 0],
  head: [-0.35, 0, 0],
  lSh: [-2.9, 0, 0.3],
  lEl: -0.25,
  rSh: [-2.9, 0, -0.3],
  rEl: -0.25,
  lHip: [0, 0, 0.12],
  lKn: 0.05,
  rHip: [0, 0, -0.12],
  rKn: 0.05,
});

export const DEFEATED = makePose({
  pelvisY: -0.05,
  pelvis: [0, 0, 0],
  spine: [0.45, 0, 0],
  head: [0.55, 0, 0],
  lSh: [0.05, 0, 0.1],
  lEl: -0.25,
  rSh: [0.05, 0, -0.1],
  rEl: -0.25,
  lHip: [0, 0, 0.05],
  lKn: 0.15,
  rHip: [0, 0, -0.05],
  rKn: 0.15,
});

// Pre-fight shake-out / taunt
export const TAUNT = makePose({
  pelvisY: -0.02,
  pelvis: [0, 0, 0],
  spine: [-0.08, 0, 0],
  head: [-0.15, 0, 0],
  lSh: [-0.6, 0, 1.0],
  lEl: -1.9,
  rSh: [-0.6, 0, -1.0],
  rEl: -1.9,
  lHip: [0, 0, 0.12],
  lKn: 0.1,
  rHip: [0, 0, -0.12],
  rKn: 0.1,
});
