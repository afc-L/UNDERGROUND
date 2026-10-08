// Dynamic third-person fight camera with trauma-based shake, FOV punches and cinematic modes
// (intro sweep, special close-up, knockdown low angle, knockout orbit, menu orbit, fighter focus).
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'menu';
    this.pos = new THREE.Vector3(0, 4, 10);
    this.look = new THREE.Vector3(0, 1, 0);
    this.wantPos = new THREE.Vector3();
    this.wantLook = new THREE.Vector3();
    this.yaw = 0; // free-look yaw (unlocked) / orbit offset (locked)
    this.pitch = 0.28;
    this.orbitOffset = 0;
    this.idleMouse = 0;
    this.trauma = 0;
    this.shakeScale = 1;
    this.baseFov = 55;
    this.fov = 55;
    this.fovPunch = 0;
    this.zoom = 0; // extra zoom-in for player attacks
    this.cineT = 0;
    this.cineDur = 0;
    this.cine = null;
    this.time = 0;
    this.sensitivity = 1;
    this.invertY = false;
  }

  addTrauma(x) {
    this.trauma = Math.min(1, this.trauma + x * this.shakeScale);
  }

  punch(fovAmount) {
    this.fovPunch = Math.min(this.fovPunch + fovAmount, 14);
  }

  /** Start a cinematic shot. data: { a, b } fighters (subject / other). */
  cinematic(kind, data, dur) {
    this.cine = { kind, ...data };
    this.cineT = 0;
    this.cineDur = dur;
    if (kind === 'ko' || kind === 'knockdown') {
      // camera beyond the fallen fighter, looking back at the one still standing
      const s = data.a;
      const w = data.b;
      this.cine.angle = Math.atan2(s.pos.x - w.pos.x, s.pos.z - w.pos.z) + 0.5;
    }
  }

  endCinematic() {
    this.cine = null;
  }

  mouse(dx, dy, locked) {
    const s = 0.0024 * this.sensitivity;
    if (locked) {
      this.orbitOffset = Math.max(-1.1, Math.min(1.1, this.orbitOffset - dx * s));
    } else {
      this.yaw -= dx * s;
    }
    this.pitch = Math.max(0.02, Math.min(0.9, this.pitch + dy * s * (this.invertY ? -1 : 1)));
    if (Math.abs(dx) + Math.abs(dy) > 0) this.idleMouse = 0;
  }

  /** Horizontal forward/right vectors of the view, for camera-relative movement. */
  basis() {
    const f = _a.set(this.look.x - this.pos.x, 0, this.look.z - this.pos.z);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    return { fx: f.x, fz: f.z, rx: -f.z, rz: f.x };
  }

  /**
   * @param {number} dt real-time delta (camera is never slowed down by slow motion)
   * @param {object} ctx { player, opp, locked }
   */
  update(dt, ctx) {
    this.time += dt;
    this.idleMouse += dt;
    let posK = 1 - Math.exp(-6 * dt);
    let lookK = 1 - Math.exp(-9 * dt);
    const p = ctx.player;
    const o = ctx.opp;

    if (this.cine) {
      this.cineT += dt;
      const c = this.cine;
      const t = this.cineT;
      if (c.kind === 'special') {
        const atk = c.a;
        const def = c.b;
        const ax = def.pos.x - atk.pos.x;
        const az = def.pos.z - atk.pos.z;
        const l = Math.hypot(ax, az) || 1;
        const side = c.side || 1;
        const px = (-az / l) * side;
        const pz = (ax / l) * side;
        const mid = _b.set((atk.pos.x + def.pos.x) / 2, 1.15, (atk.pos.z + def.pos.z) / 2);
        this.wantPos.set(mid.x + px * 3.0 - (ax / l) * 0.8, 1.05 + t * 0.4, mid.z + pz * 3.0 - (az / l) * 0.8);
        this.wantLook.set(atk.pos.x * 0.6 + def.pos.x * 0.4, 1.25, atk.pos.z * 0.6 + def.pos.z * 0.4);
        posK = 1 - Math.exp(-15 * dt);
        lookK = 1 - Math.exp(-18 * dt);
      } else if (c.kind === 'knockdown') {
        const s = c.a;
        const ang = c.angle + t * 0.3;
        this.wantPos.set(s.pos.x + Math.sin(ang) * 3.2, 0.55 + t * 0.12, s.pos.z + Math.cos(ang) * 3.2);
        this.wantLook.set(s.pos.x, 0.45, s.pos.z);
        posK = 1 - Math.exp(-4 * dt);
      } else if (c.kind === 'ko') {
        const s = c.a;
        const w = c.b;
        const ang = c.angle + t * 0.22;
        const rise = Math.min(1, t / 4);
        const d = 2.6 + rise * 3.2;
        this.wantPos.set(s.pos.x + Math.sin(ang) * d, 0.45 + rise * 2.1, s.pos.z + Math.cos(ang) * d);
        this.wantLook.set(s.pos.x * (1 - rise * 0.5) + w.pos.x * rise * 0.5, 0.4 + rise * 0.8, s.pos.z * (1 - rise * 0.5) + w.pos.z * rise * 0.5);
        posK = 1 - Math.exp(-(t < 0.3 ? 12 : 2.5) * dt);
      } else if (c.kind === 'victory') {
        const s = c.a;
        const ang = (c.angle0 ?? (c.angle0 = s.facing)) + t * 0.35;
        this.wantPos.set(s.pos.x + Math.sin(ang) * 3.4, 1.5, s.pos.z + Math.cos(ang) * 3.4);
        this.wantLook.set(s.pos.x, 1.25, s.pos.z);
        posK = 1 - Math.exp(-3 * dt);
      } else if (c.kind === 'intro') {
        const k = Math.min(1, t / this.cineDur);
        const e = k * k * (3 - 2 * k);
        const ang = c.angle0 + (1 - e) * 2.4;
        const r = 4.5 + (1 - e) * 5;
        const tx = (p.pos.x + o.pos.x) / 2;
        const tz = (p.pos.z + o.pos.z) / 2;
        this.wantPos.set(tx + Math.sin(ang) * r, 1.6 + (1 - e) * 4.5, tz + Math.cos(ang) * r);
        this.wantLook.set(tx, 1.1, tz);
        posK = 1 - Math.exp(-5 * dt);
      }
      if (this.cineDur > 0 && this.cineT >= this.cineDur && c.kind !== 'ko' && c.kind !== 'victory') this.cine = null;
    } else if (this.mode === 'menu') {
      const ang = this.time * 0.07;
      this.wantPos.set(Math.sin(ang) * 9.5, 3.4 + Math.sin(this.time * 0.13) * 0.5, Math.cos(ang) * 9.5);
      this.wantLook.set(0, 1.1, 0);
      posK = 1 - Math.exp(-2 * dt);
    } else if (this.mode === 'focus' && p) {
      const ang = p.facing + 0.45 + Math.sin(this.time * 0.3) * 0.15;
      this.wantPos.set(p.pos.x + Math.sin(ang) * 3.1, 1.45, p.pos.z + Math.cos(ang) * 3.1);
      this.wantLook.set(p.pos.x + 0.6 * Math.cos(ang), 1.1, p.pos.z - 0.6 * Math.sin(ang));
      posK = 1 - Math.exp(-3 * dt);
    } else if (p && o) {
      // ---- Fight camera ----
      if (this.idleMouse > 1.2) this.orbitOffset *= Math.exp(-1.5 * dt);
      const dx = o.pos.x - p.pos.x;
      const dz = o.pos.z - p.pos.z;
      const sep = Math.hypot(dx, dz) || 1;
      let ax;
      let az;
      if (ctx.locked) {
        const base = Math.atan2(dx, dz) + this.orbitOffset;
        ax = Math.sin(base);
        az = Math.cos(base);
        this.yaw = base;
      } else {
        ax = Math.sin(this.yaw);
        az = Math.cos(this.yaw);
      }
      const dist = Math.max(3.6, Math.min(7.5, 3.3 + sep * 0.5)) - this.zoom;
      const h = 1.35 + this.pitch * 3.2 + sep * 0.08;
      const side = 0.75;
      this.wantPos.set(p.pos.x - ax * dist + az * side, h, p.pos.z - az * dist - ax * side);
      // keep both fighters framed: look between them, biased toward the player
      const bias = ctx.locked ? 0.45 : 0.3;
      this.wantLook.set(p.pos.x + dx * bias, 1.15, p.pos.z + dz * bias);
      // don't let the camera wander into the crowd
      const r = Math.hypot(this.wantPos.x, this.wantPos.z);
      if (r > 9.2) {
        this.wantPos.x *= 9.2 / r;
        this.wantPos.z *= 9.2 / r;
      }
    }

    this.pos.lerp(this.wantPos, posK);
    this.look.lerp(this.wantLook, lookK);
    // never put the lens inside a body (fighters, referee)
    if (ctx.bodies && this.pos.y < 2.4) {
      for (const b of ctx.bodies) {
        if (!b) continue;
        const dx = this.pos.x - b.x;
        const dz = this.pos.z - b.z;
        const d = Math.hypot(dx, dz);
        const min = 0.95;
        if (d < min) {
          const k = d > 1e-4 ? (min - d) / d : 0;
          this.pos.x += dx * k;
          this.pos.z += dz * k;
        }
      }
    }

    // Shake (trauma^2 so small hits are subtle and big ones are violent)
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const sh = this.trauma * this.trauma;
    const t = this.time * 38;
    const ox = (Math.sin(t * 1.1) + Math.sin(t * 2.3 + 1.3) * 0.5) * 0.22 * sh;
    const oy = (Math.sin(t * 1.7 + 2.1) + Math.sin(t * 3.1) * 0.5) * 0.18 * sh;
    const roll = Math.sin(t * 0.9 + 0.7) * 0.06 * sh;

    this.cam.position.set(this.pos.x + ox, this.pos.y + oy, this.pos.z);
    this.cam.lookAt(this.look.x + ox * 0.5, this.look.y + oy * 0.5, this.look.z);
    this.cam.rotateZ(roll);

    this.fovPunch *= Math.exp(-dt * 7);
    this.zoom *= Math.exp(-dt * 4);
    const want = this.baseFov - this.fovPunch;
    this.fov += (want - this.fov) * (1 - Math.exp(-14 * dt));
    if (Math.abs(this.cam.fov - this.fov) > 0.01) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
  }
}
