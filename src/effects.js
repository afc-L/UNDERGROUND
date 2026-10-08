// Visual feedback: pooled particles, impact flashes, shockwave rings, a reusable impact light,
// hit-stop / slow-motion time scaling and DOM screen effects. Everything is preallocated.
import * as THREE from 'three';

function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.6)'));
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Irregular splatter blob (white, tinted by the material) for floor blood decals.
function splatTexture(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(64, 64, 26 + rnd() * 10, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 20 + rnd() * 34;
    g.beginPath();
    g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3 + rnd() * 11, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 40 + rnd() * 20;
    g.beginPath();
    g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

class ParticlePool {
  constructor(scene, count, { additive = true, size = 0.12, texture, fade = true }) {
    this.count = count;
    this.fade = fade;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.grav = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
    this.geo = geo;
    const mat = new THREE.PointsMaterial({
      size, map: texture, vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
      opacity: additive ? 1 : 0.6,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -100;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, r, g, b, life, grav = -9, drag = 1.5) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const k = i * 3;
    this.pos[k] = x;
    this.pos[k + 1] = y;
    this.pos[k + 2] = z;
    this.vel[k] = vx;
    this.vel[k + 1] = vy;
    this.vel[k + 2] = vz;
    this.base[k] = r;
    this.base[k + 1] = g;
    this.base[k + 2] = b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[k + 1] = -100;
        this.col[k] = this.col[k + 1] = this.col[k + 2] = 0;
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= d;
      this.vel[k + 2] *= d;
      this.vel[k + 1] = this.vel[k + 1] * d + this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.02) {
        this.pos[k + 1] = 0.02;
        this.vel[k + 1] *= -0.3;
      }
      const f = this.life[i] / this.maxLife[i];
      const a = this.fade ? f * f : 1;
      this.col[k] = this.base[k] * a;
      this.col[k + 1] = this.base[k + 1] * a;
      this.col[k + 2] = this.base[k + 2] * a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, camera, dom) {
    this.scene = scene;
    this.camera = camera;
    const soft = radialTexture();
    this.sparks = new ParticlePool(scene, 420, { additive: true, size: 0.09, texture: soft });
    this.glow = new ParticlePool(scene, 160, { additive: true, size: 0.35, texture: soft });
    this.dust = new ParticlePool(scene, 220, { additive: false, size: 0.4, texture: radialTexture('rgba(150,140,130,1)', 'rgba(150,140,130,0)') });

    // Blood: droplets plus floor splatter decals that stay for the whole fight
    this.bloodOn = true;
    this.gore = 1; // The Crucible turns this way up
    // blood hitting the camera lens (DOM overlay blobs)
    this.lensBlood = [];
    for (let i = 0; i < 8; i++) {
      const el = document.createElement('div');
      el.className = 'lens-blood';
      dom.lens.appendChild(el);
      this.lensBlood.push({ el, life: 0 });
    }
    this.bloodDrops = new ParticlePool(scene, 360, { additive: false, size: 0.075, fade: false, texture: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)') });
    this.bloodDrops.points.material.opacity = 0.95;
    const splatGeo = new THREE.PlaneGeometry(1, 1);
    splatGeo.rotateX(-Math.PI / 2);
    this.splatMats = [1, 2, 3].map((k) => new THREE.MeshStandardMaterial({
      map: splatTexture(k), color: 0x6e0710, transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.1,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.splats = [];
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(splatGeo, this.splatMats[i % 3]);
      m.visible = false;
      m.receiveShadow = true;
      m.userData = { grow: 0, target: 1 };
      scene.add(m);
      this.splats.push(m);
    }
    this.splatCursor = 0;
    this.debris = [];

    // Impact flash sprites
    this.flashes = [];
    const flashTex = radialTexture('rgba(255,250,235,1)', 'rgba(255,200,120,0)', 128);
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff }));
      s.visible = false;
      s.userData = { t: 0, dur: 0.15, size: 1 };
      scene.add(s);
      this.flashes.push(s);
    }
    // Shockwave rings
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      m.userData = { t: 0, dur: 0.3, size: 2, flat: false };
      scene.add(m);
      this.rings.push(m);
    }
    // One shared impact light
    this.light = new THREE.PointLight(0xffd9a0, 0, 7, 2);
    scene.add(this.light);

    // Time scaling
    this.hitstopT = 0;
    this.slowT = 0;
    this.slowDur = 0;
    this.slowScale = 1;

    // DOM screen effects
    this.dom = dom;
    this.flashLevel = 0;
    this.redLevel = 0;
    this.linesLevel = 0;
    this.desat = 0;
    this.numbers = [];
    for (let i = 0; i < 10; i++) {
      const el = document.createElement('div');
      el.className = 'dmg-num';
      dom.numbers.appendChild(el);
      this.numbers.push({ el, t: 0, pos: new THREE.Vector3(), active: false });
    }
    this._v = new THREE.Vector3();
    this.showNumbers = true;
  }

  // ---- Time ----------------------------------------------------------------------------------

  hitstop(dur) {
    this.hitstopT = Math.max(this.hitstopT, dur);
  }

  slowmo(scale, dur) {
    if (this.slowT > 0 && this.slowScale < scale) return; // keep the stronger slowdown
    this.slowScale = scale;
    this.slowT = dur;
    this.slowDur = dur;
  }

  /** Advance timers with real time and return the sim time scale for this frame. */
  timeScale(realDt) {
    let s = 1;
    if (this.hitstopT > 0) {
      this.hitstopT -= realDt;
      s = 0.04;
    } else if (this.slowT > 0) {
      this.slowT -= realDt;
      // ease back to normal speed over the last 35%
      const p = this.slowT / this.slowDur;
      s = p > 0.35 ? this.slowScale : this.slowScale + (1 - this.slowScale) * (1 - p / 0.35);
    }
    this.desat += ((this.slowT > 0 && this.slowScale < 0.5 ? 1 : 0) - this.desat) * Math.min(1, realDt * 8);
    return s;
  }

  clearTime() {
    this.hitstopT = this.slowT = 0;
  }

  // ---- Spawners ------------------------------------------------------------------------------

  /** Hit sparks + flash scaled by impact level (1..6). */
  impact(point, level, color = 0xffc870, dir = null, opts = {}) {
    const n = 8 + level * 9;
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const sp = 2 + Math.random() * (2 + level * 1.8);
      let vx = (Math.random() - 0.5) * 2;
      let vy = Math.random() * 1.4 - 0.2;
      let vz = (Math.random() - 0.5) * 2;
      if (dir) {
        vx += dir.x * 1.2;
        vz += dir.z * 1.2;
      }
      const l = Math.hypot(vx, vy, vz) || 1;
      const w = Math.random() < 0.3 ? 1 : 0;
      this.sparks.emit(point.x, point.y, point.z, (vx / l) * sp, (vy / l) * sp, (vz / l) * sp,
        c.r + w, c.g + w * 0.8, c.b + w * 0.5, 0.25 + Math.random() * 0.25 + level * 0.04, -7, 2.5);
    }
    if (this.bloodOn && opts.blood) this.bloodSpray(point, level, dir);
    // sweat spray
    for (let i = 0; i < (this.bloodOn && opts.blood ? 2 : 3 + level * 2); i++) {
      const vx = (Math.random() - 0.5) * 2 + (dir ? dir.x * 2 : 0);
      const vz = (Math.random() - 0.5) * 2 + (dir ? dir.z * 2 : 0);
      this.sparks.emit(point.x, point.y + 0.05, point.z, vx, 1 + Math.random() * 2, vz, 0.55, 0.7, 0.85, 0.5 + Math.random() * 0.3, -9.8, 0.6);
    }
    for (let i = 0; i < level; i++) {
      this.glow.emit(point.x, point.y, point.z, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, c.r * 0.6, c.g * 0.5, c.b * 0.4, 0.18 + level * 0.03, 0, 4);
    }
    this.flash(point, 0.5 + level * 0.32, 0.1 + level * 0.025, color);
    if (level >= 3) this.ring(point, 0.5 + level * 0.22, 0.2 + level * 0.03, color);
    this.light.position.copy(point);
    this.light.color.set(color);
    this.light.intensity = Math.max(this.light.intensity, 6 + level * 10);
  }

  flash(point, size, dur, color = 0xffffff) {
    const s = this.flashes.find((f) => !f.visible) || this.flashes[0];
    s.visible = true;
    s.position.copy(point);
    s.material.color.set(color).lerp(new THREE.Color(0xffffff), 0.5);
    s.userData.t = 0;
    s.userData.dur = dur;
    s.userData.size = size;
    s.scale.setScalar(size * 0.4);
  }

  ring(point, size, dur, color = 0xffffff, flat = false) {
    const r = this.rings.find((x) => !x.visible) || this.rings[0];
    r.visible = true;
    r.position.copy(point);
    r.material.color.set(color);
    r.userData.t = 0;
    r.userData.dur = dur;
    r.userData.size = size;
    r.userData.flat = flat;
    if (flat) r.rotation.set(-Math.PI / 2, 0, 0);
  }

  dustBurst(x, z, amount = 20, power = 1) {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.8 + Math.random() * 2.2) * power;
      const g = 0.35 + Math.random() * 0.2;
      this.dust.emit(x + Math.cos(a) * 0.3, 0.08, z + Math.sin(a) * 0.3, Math.cos(a) * sp, 0.3 + Math.random() * 0.8, Math.sin(a) * sp, g, g * 0.95, g * 0.9, 0.8 + Math.random() * 0.8, 0.4, 2.2);
    }
    this.ring(new THREE.Vector3(x, 0.05, z), 1.6 * power, 0.45, 0xbbaa99, true);
  }

  /** Swirling energy around a point (special move charge). */
  aura(point, color, amount = 3) {
    const c = new THREE.Color(color).multiplyScalar(0.55);
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.4 + Math.random() * 0.4;
      this.glow.emit(point.x + Math.cos(a) * r, point.y - 0.6 + Math.random() * 1.2, point.z + Math.sin(a) * r,
        -Math.cos(a) * 1.2, 1.5 + Math.random(), -Math.sin(a) * 1.2, c.r, c.g, c.b, 0.4, 0, 1);
    }
  }

  trail(point, color) {
    const c = new THREE.Color(color);
    this.glow.emit(point.x, point.y, point.z, 0, 0.2, 0, c.r * 0.8, c.g * 0.8, c.b * 0.8, 0.18, 0, 0);
  }

  // ---- Blood ---------------------------------------------------------------------------------

  /** Spray of droplets from a clean hit, plus splatter landing on the mat in the hit direction. */
  bloodSpray(point, level, dir) {
    const g = this.gore;
    const n = Math.round((6 + level * 9) * g);
    for (let i = 0; i < n; i++) {
      const sp = 1.5 + Math.random() * (1.5 + level * 0.9);
      const vx = (Math.random() - 0.5) * 1.6 + (dir ? dir.x * sp : 0);
      const vz = (Math.random() - 0.5) * 1.6 + (dir ? dir.z * sp : 0);
      const vy = 0.5 + Math.random() * 2.2;
      const shade = 0.45 + Math.random() * 0.3;
      const boost = g > 1 ? 1 + Math.random() * 0.8 : 1;
      this.bloodDrops.emit(point.x, point.y, point.z, vx * boost, vy * boost, vz * boost, shade, 0.02, 0.03, 0.45 + Math.random() * 0.35, -9.8, 0.4);
    }
    const splats = Math.round((Math.ceil(level / 2) + (Math.random() < 0.5 ? 1 : 0)) * g);
    for (let i = 0; i < splats; i++) {
      const d = 0.3 + Math.random() * (0.4 + level * 0.2) * (g > 1 ? 1.6 : 1);
      const x = point.x + (dir ? dir.x * d : 0) + (Math.random() - 0.5) * 0.5;
      const z = point.z + (dir ? dir.z * d : 0) + (Math.random() - 0.5) * 0.5;
      this.splat(x, z, (0.12 + Math.random() * 0.12 + level * 0.05) * (g > 1 ? 1.4 : 1));
    }
  }

  /** Blood spattering the camera lens (screen overlay), for the goriest hits. */
  lensSplatter(count = 2) {
    if (!this.bloodOn) return;
    for (let i = 0; i < count; i++) {
      const b = this.lensBlood.find((x) => x.life <= 0) || this.lensBlood[(Math.random() * this.lensBlood.length) | 0];
      b.life = 1.6 + Math.random();
      const size = 80 + Math.random() * 220;
      const edge = Math.random() < 0.75; // mostly near the edges, keep the fight readable
      const x = edge ? (Math.random() < 0.5 ? Math.random() * 18 : 82 + Math.random() * 18) : 20 + Math.random() * 60;
      const y = Math.random() * 100;
      b.el.style.width = `${size}px`;
      b.el.style.height = `${size * (0.6 + Math.random() * 0.6)}px`;
      b.el.style.left = `calc(${x}% - ${size / 2}px)`;
      b.el.style.top = `calc(${y}% - ${size / 2}px)`;
      b.el.style.transform = `rotate(${Math.random() * 360}deg)`;
      b.el.style.opacity = '0.85';
    }
  }

  splat(x, z, size, grow = 0) {
    if (Math.hypot(x, z) > 7.1) return; // stays on the mat
    const m = this.splats[this.splatCursor];
    this.splatCursor = (this.splatCursor + 1) % this.splats.length;
    m.visible = true;
    m.position.set(x, 0.012 + this.splatCursor * 0.0002, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.userData.target = size;
    m.userData.grow = grow;
    m.scale.setScalar(grow > 0 ? size * 0.15 : size);
    return m;
  }

  /** A slowly spreading pool (under a fighter who won't get up). */
  bloodPool(x, z, size = 1.4) {
    if (this.bloodOn) this.splat(x, z, size, 0.35);
  }

  // ---- Severed parts --------------------------------------------------------------------------

  /** Throw a severed body part (already in world space) with spin; it trails blood and lands. */
  launchDebris(obj, vx, vy, vz) {
    this.debris.push({
      obj, vel: new THREE.Vector3(vx, vy, vz),
      spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
      landed: false, bleed: 2.5,
    });
  }

  _updateDebris(dt) {
    const _p = this._dp || (this._dp = new THREE.Vector3());
    for (const d of this.debris) {
      const o = d.obj;
      d.vel.y -= 9.8 * dt;
      o.position.addScaledVector(d.vel, dt);
      o.rotation.x += d.spin.x * dt;
      o.rotation.y += d.spin.y * dt;
      o.rotation.z += d.spin.z * dt;
      if (o.position.y < 0.09) {
        o.position.y = 0.09;
        if (!d.landed && this.bloodOn) this.splat(o.position.x, o.position.z, 0.35 + Math.random() * 0.2);
        d.landed = true;
        d.vel.y = Math.abs(d.vel.y) > 1 ? -d.vel.y * 0.3 : 0;
        d.vel.x *= 0.55;
        d.vel.z *= 0.55;
        d.spin.multiplyScalar(0.5);
      }
      const r = Math.hypot(o.position.x, o.position.z);
      if (r > 6.85) {
        // bounce off the cage
        const nx = o.position.x / r;
        const nz = o.position.z / r;
        o.position.x = nx * 6.85;
        o.position.z = nz * 6.85;
        const vn = d.vel.x * nx + d.vel.z * nz;
        if (vn > 0) {
          d.vel.x -= nx * vn * 1.5;
          d.vel.z -= nz * vn * 1.5;
        }
      }
      d.bleed -= dt;
      if (this.bloodOn && d.bleed > 0 && Math.random() < 0.7) {
        o.getWorldPosition(_p);
        this.bloodDrops.emit(_p.x, _p.y, _p.z, (Math.random() - 0.5) * 0.6, 0.2, (Math.random() - 0.5) * 0.6, 0.55, 0.02, 0.03, 0.8, -9.8, 0.3);
        if (d.landed && Math.random() < 0.05) this.splat(_p.x + (Math.random() - 0.5) * 0.3, _p.z + (Math.random() - 0.5) * 0.3, 0.1 + Math.random() * 0.12);
      }
    }
  }

  clearDebris() {
    this.debris.length = 0; // the parts themselves are reattached by their fighter's model
  }

  clearBlood() {
    for (const m of this.splats) m.visible = false;
    for (const b of this.lensBlood) {
      b.life = 0;
      b.el.style.opacity = '0';
    }
  }

  // ---- Screen effects ------------------------------------------------------------------------

  screenFlash(amount) {
    this.flashLevel = Math.max(this.flashLevel, amount);
  }

  screenHurt(amount) {
    this.redLevel = Math.max(this.redLevel, amount);
  }

  speedLines(amount) {
    this.linesLevel = Math.max(this.linesLevel, amount);
  }

  damageNumber(point, value, kind = '') {
    if (!this.showNumbers) return;
    const n = this.numbers.find((x) => !x.active) || this.numbers[0];
    n.active = true;
    n.t = 0;
    n.pos.copy(point);
    n.pos.x += (Math.random() - 0.5) * 0.3;
    n.el.textContent = Math.round(value);
    n.el.className = `dmg-num show ${kind}`;
  }

  // ---- Per-frame -----------------------------------------------------------------------------

  update(simDt, realDt, width, height) {
    this.sparks.update(simDt);
    this.glow.update(simDt);
    this.dust.update(simDt);
    this.bloodDrops.update(simDt);
    this._updateDebris(simDt);
    for (const m of this.splats) {
      const u = m.userData;
      if (!m.visible || u.grow <= 0) continue;
      const cur = m.scale.x + (u.target - m.scale.x) * Math.min(1, simDt * u.grow);
      m.scale.setScalar(cur);
      if (Math.abs(cur - u.target) < 0.01) u.grow = 0;
    }
    const cam = this.camera;
    for (const s of this.flashes) {
      if (!s.visible) continue;
      s.userData.t += simDt;
      const p = s.userData.t / s.userData.dur;
      if (p >= 1) {
        s.visible = false;
        continue;
      }
      s.scale.setScalar(s.userData.size * (0.4 + p * 0.9));
      s.material.opacity = 1 - p * p;
    }
    for (const r of this.rings) {
      if (!r.visible) continue;
      r.userData.t += simDt;
      const p = r.userData.t / r.userData.dur;
      if (p >= 1) {
        r.visible = false;
        continue;
      }
      if (!r.userData.flat) r.quaternion.copy(cam.quaternion);
      const e = 1 - Math.pow(1 - p, 3);
      r.scale.setScalar(0.2 + r.userData.size * e);
      r.material.opacity = (1 - p) * (r.userData.flat ? 0.3 : 0.6);
    }
    this.light.intensity *= Math.exp(-realDt * 14);

    for (const b of this.lensBlood) {
      if (b.life <= 0) continue;
      b.life -= realDt;
      b.el.style.opacity = Math.max(0, Math.min(0.85, b.life * 0.6)).toFixed(2);
      if (b.life <= 0) b.el.style.opacity = '0';
    }
    // DOM overlays (real-time decay so they stay readable during slow motion)
    this.flashLevel *= Math.exp(-realDt * 10);
    this.redLevel *= Math.exp(-realDt * 3);
    this.linesLevel *= Math.exp(-realDt * 5);
    const d = this.dom;
    d.flash.style.opacity = this.flashLevel.toFixed(3);
    d.hurt.style.opacity = this.redLevel.toFixed(3);
    d.lines.style.opacity = this.linesLevel.toFixed(3);
    d.canvas.style.filter = this.desat > 0.02 ? `saturate(${(1 - this.desat * 0.65).toFixed(2)}) contrast(${(1 + this.desat * 0.2).toFixed(2)})` : '';

    for (const n of this.numbers) {
      if (!n.active) continue;
      n.t += realDt;
      if (n.t > 0.9) {
        n.active = false;
        n.el.className = 'dmg-num';
        continue;
      }
      const v = this._v.copy(n.pos);
      v.y += n.t * 0.8;
      v.project(cam);
      if (v.z > 1) {
        n.el.style.opacity = '0';
        continue;
      }
      n.el.style.transform = `translate(${((v.x * 0.5 + 0.5) * width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * height).toFixed(1)}px) translate(-50%, -50%) scale(${(1.25 - Math.min(n.t, 0.15)).toFixed(2)})`;
      n.el.style.opacity = (1 - Math.max(0, n.t - 0.5) / 0.4).toFixed(2);
    }
  }
}
