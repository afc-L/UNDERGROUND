// The referee: keeps a side-on view of the fight, steps in to count knockdowns and waves off knockouts.
import * as THREE from 'three';
import { FighterModel } from './fighterModel.js';
import { RELAXED, GUARD, makePose, approachPose, IDX, POSE_SIZE } from './poses.js';
import { ARENA } from './config.js';

const REF_LOOK = {
  skin: '#c99a76', hair: 'buzz', hairColor: '#555', top: 'tee', topColor: '#d9d9d9',
  shorts: '#141414', shortsTrim: '#141414', gloves: '#c99a76', shoes: '#0d0d0d', accessory: 'none',
  build: { height: 1.0, bulk: 0.95, arms: 1.0, head: 1.0, belly: 0.1 },
};

const READY = makePose({ spine: [0.25, 0, 0], head: [0.05, 0, 0], lSh: [-0.6, 0, 0.35], lEl: -1.2, rSh: [-0.6, 0, -0.35], rEl: -1.2, lKn: 0.25, rKn: 0.25, pelvisY: -0.05 }, RELAXED);
const COUNT_UP = makePose({ spine: [0.35, 0, 0], head: [0.3, 0, 0], rSh: [-2.6, 0, -0.2], rEl: -0.3, lSh: [-0.3, 0, 0.3], lEl: -0.6, lKn: 0.35, rKn: 0.35, pelvisY: -0.1 }, RELAXED);
const COUNT_DOWN = makePose({ spine: [0.5, 0, 0], head: [0.35, 0, 0], rSh: [-1.2, 0, -0.1], rEl: -0.1, lSh: [-0.3, 0, 0.3], lEl: -0.6, lKn: 0.45, rKn: 0.45, pelvisY: -0.14 }, RELAXED);
const WAVE_A = makePose({ lSh: [-1.6, 0, -0.7], lEl: -0.2, rSh: [-1.6, 0, 0.7], rEl: -0.2, spine: [0.1, 0, 0] }, RELAXED);
const WAVE_B = makePose({ lSh: [-1.6, 0, 0.9], lEl: -0.2, rSh: [-1.6, 0, -0.9], rEl: -0.2, spine: [0.1, 0, 0] }, RELAXED);
const RAISE = makePose({ lSh: [-0.2, 0, 2.6], lEl: -0.1, spine: [-0.05, 0, 0], head: [-0.1, 0, 0] }, RELAXED);

export class Referee {
  constructor(scene) {
    this.model = new FighterModel(REF_LOOK, '#ffffff');
    // black stripes on the shirt
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, flatShading: true });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.27), stripeMat);
      s.position.set(-0.12 + i * 0.08, 0.17, 0);
      this.model.chest.add(s);
    }
    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.03), stripeMat);
    bow.position.set(0, 0.31, 0.11);
    this.model.chest.add(bow);
    scene.add(this.model.root);
    this.pos = new THREE.Vector3(0, 0, 3);
    this.facing = 0;
    this.pose = Float32Array.from(READY);
    this._t = new Float32Array(POSE_SIZE);
    this.mode = 'watch';
    this.count = 0;
    this.countPulse = 0;
    this.time = 0;
    this.walkPhase = 0;
  }

  setMode(mode, data = {}) {
    this.mode = mode;
    this.data = data;
  }

  /** Called on each referee count tick */
  pulse() {
    this.countPulse = 0.35;
  }

  update(dt, a, b) {
    this.time += dt;
    this.countPulse = Math.max(0, this.countPulse - dt);
    let tx;
    let tz;
    let look = null;
    if ((this.mode === 'count' || this.mode === 'ko') && this.data.down) {
      const d = this.data.down;
      const o = this.data.up;
      // stand between the two, close to the downed fighter
      const dx = o.pos.x - d.pos.x;
      const dz = o.pos.z - d.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      tx = d.pos.x + (dx / l) * 1.3 + (-dz / l) * 0.6;
      tz = d.pos.z + (dz / l) * 1.3 + (dx / l) * 0.6;
      look = d.pos;
    } else if (this.mode === 'winner' && this.data.winner) {
      const w = this.data.winner;
      tx = w.pos.x + Math.cos(w.facing) * 0.7;
      tz = w.pos.z - Math.sin(w.facing) * 0.7;
      look = null;
      this.facing = w.facing;
    } else {
      // side-on watching position perpendicular to the fighters' axis
      const mx = (a.pos.x + b.pos.x) / 2;
      const mz = (a.pos.z + b.pos.z) / 2;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      const px = -dz / l;
      const pz = dx / l;
      // stay on whichever side is closer to keep movement small
      const side = (this.pos.x - mx) * px + (this.pos.z - mz) * pz >= 0 ? 1 : -1;
      tx = mx + px * side * 2.6;
      tz = mz + pz * side * 2.6;
      look = { x: mx, z: mz };
    }
    const r = Math.hypot(tx, tz);
    if (r > ARENA.radius - 0.4) {
      tx *= (ARENA.radius - 0.4) / r;
      tz *= (ARENA.radius - 0.4) / r;
    }
    const k = 1 - Math.exp(-2.4 * dt);
    const ox = this.pos.x;
    const oz = this.pos.z;
    this.pos.x += (tx - this.pos.x) * k;
    this.pos.z += (tz - this.pos.z) * k;
    // keep out of the fighters' way
    for (const f of [a, b]) {
      const dx = this.pos.x - f.pos.x;
      const dz = this.pos.z - f.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.0 && d > 1e-4) {
        this.pos.x += (dx / d) * (1.0 - d);
        this.pos.z += (dz / d) * (1.0 - d);
      }
    }
    const speed = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
    if (look) {
      const want = Math.atan2(look.x - this.pos.x, look.z - this.pos.z);
      let d = want - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * Math.min(1, dt * 6);
    }

    const T = this._t;
    if (this.mode === 'count') T.set(this.countPulse > 0.15 ? COUNT_DOWN : COUNT_UP);
    else if (this.mode === 'ko') T.set(Math.sin(this.time * 9) > 0 ? WAVE_A : WAVE_B);
    else if (this.mode === 'winner') T.set(RAISE);
    else if (this.mode === 'start') T.set(GUARD);
    else T.set(READY);
    if (speed > 0.3) {
      this.walkPhase += dt * speed * 3;
      const s = Math.sin(this.walkPhase) * Math.min(0.45, speed * 0.2);
      T[IDX.lHip] += s;
      T[IDX.rHip] -= s;
      T[IDX.lKn] += Math.max(0, -s) * 1.2;
      T[IDX.rKn] += Math.max(0, s) * 1.2;
    }
    approachPose(this.pose, T, 1 - Math.exp(-(this.mode === 'ko' ? 14 : 8) * dt));
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
    this.model.apply(this.pose);
  }
}
