// Procedural low-poly fighter rig. Pure presentation: it only reads poses, never game state,
// so remote fighters (future multiplayer) can be driven by the same model.
import * as THREE from 'three';
import { IDX } from './poses.js';

const _geoCache = new Map();
function cached(key, make) {
  let g = _geoCache.get(key);
  if (!g) {
    g = make();
    _geoCache.set(key, g);
  }
  return g;
}
const r2 = (v) => Math.round(v * 1000) / 1000;
const capsule = (r, len) => cached(`cap${r2(r)}_${r2(len)}`, () => new THREE.CapsuleGeometry(r, len, 2, 7));
const box = (w, h, d) => cached(`box${r2(w)}_${r2(h)}_${r2(d)}`, () => new THREE.BoxGeometry(w, h, d));
const ico = (r, detail = 1) => cached(`ico${r2(r)}_${detail}`, () => new THREE.IcosahedronGeometry(r, detail));
const sphere = (r, w = 8, h = 6) => cached(`sph${r2(r)}_${w}_${h}`, () => new THREE.SphereGeometry(r, w, h));
// Tapered 4-sided prism (looks like a chunky low-poly torso block)
const taper = (top, bottom, h) =>
  cached(`tap${r2(top)}_${r2(bottom)}_${r2(h)}`, () => {
    const g = new THREE.CylinderGeometry(top, bottom, h, 4, 1);
    g.rotateY(Math.PI / 4);
    return g;
  });
const cyl = (rt, rb, h, seg = 7) => cached(`cyl${r2(rt)}_${r2(rb)}_${r2(h)}_${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const torus = (r, t) => cached(`tor${r2(r)}_${r2(t)}`, () => new THREE.TorusGeometry(r, t, 5, 12));

export class FighterModel {
  static bloodEnabled = true;

  constructor(look, accent = '#ffffff') {
    this.look = look;
    this.materials = [];
    this.root = new THREE.Group(); // world position + facing (set by Fighter)
    this.offset = new THREE.Group(); // pose root lift / forward / yaw
    this.body = new THREE.Group(); // whole-body tilt around the feet
    this.root.add(this.offset);
    this.offset.add(this.body);
    this.accent = new THREE.Color(accent);
    this.flash = 0;
    this.glow = 0;
    this.detached = {};
    this.stumpMat = new THREE.MeshStandardMaterial({ color: 0x6a0610, roughness: 0.3, flatShading: true });
    this._build();
  }

  _mat(color, rough = 0.75, metal = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true });
    this.materials.push(m);
    return m;
  }

  _mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = false;
    parent.add(m);
    return m;
  }

  _build() {
    const L = this.look;
    const B = { height: 1, bulk: 1, arms: 1, head: 1, belly: 0, ...(L.build || {}) };
    const h = B.height;
    const b = B.bulk;
    const a = B.arms;
    const hd = B.head;

    const skin = this._mat(L.skin, 0.5);
    const top = L.top && L.top !== 'none' ? this._mat(L.topColor, 0.85) : skin;
    const shorts = this._mat(L.shorts, 0.8);
    const trim = this._mat(L.shortsTrim || '#ffffff', 0.7);
    // Bare knuckles: fists are skin, with their own material so they can get bloody
    const fists = this._mat(L.skin, 0.45);
    this.gloveMat = fists;
    const suit = L.top === 'suit';
    const legsMat = suit ? this._mat(L.legs || L.topColor, 0.6, 0.15) : skin;
    const shoes = this._mat(L.shoes || '#222', 0.8);
    const hairMat = this._mat(L.hairColor || '#111', 0.9);
    const dark = this._mat('#0b0b0d', 0.6);
    const acc = this._mat(L.accessoryColor || '#ffffff', 0.5, L.accessory === 'chain' ? 0.8 : 0);
    const sleeves = L.top === 'tee' || L.top === 'hoodie' || suit ? top : skin;
    const forearmMat = L.top === 'hoodie' || suit ? top : skin;

    const thighLen = 0.44 * h;
    const shinLen = 0.44 * h;
    this.hipHeight = thighLen + shinLen + 0.08;

    // Pelvis
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = this.hipHeight;
    this.pelvisBaseY = this.hipHeight;
    this.body.add(this.pelvis);
    this._mesh(taper(0.24 * b, 0.22 * b, 0.24), shorts, this.pelvis, 0, 0, 0).scale.set(1, 1, 0.72);
    this._mesh(taper(0.245 * b, 0.245 * b, 0.05), trim, this.pelvis, 0, 0.11, 0).scale.set(1, 1, 0.74);

    // Spine (abdomen) and chest
    this.spine = new THREE.Group();
    this.spine.position.y = 0.12;
    this.pelvis.add(this.spine);
    const absLen = 0.24 * h;
    const belly = B.belly;
    this._mesh(taper(0.22 * b * (1 + belly * 0.3), 0.21 * b, absLen), top, this.spine, 0, absLen / 2, 0.01 * belly).scale.set(1, 1, 0.68 + belly * 0.35);

    this.chest = new THREE.Group();
    this.chest.position.y = absLen;
    this.spine.add(this.chest);
    const chestLen = 0.32 * h;
    this._mesh(taper(0.33 * b, 0.23 * b, chestLen), top, this.chest, 0, chestLen / 2, 0).scale.set(1, 1, 0.62);
    if (L.top === 'none' || !L.top) {
      // pec plates for bare-chested fighters
      this._mesh(box(0.15 * b, 0.1, 0.05), skin, this.chest, 0.08 * b, chestLen * 0.68, 0.13 * b);
      this._mesh(box(0.15 * b, 0.1, 0.05), skin, this.chest, -0.08 * b, chestLen * 0.68, 0.13 * b);
    }
    if (L.top === 'tank') {
      this._mesh(box(0.06, 0.08, 0.2 * b), top, this.chest, 0.15 * b, chestLen + 0.0, 0);
      this._mesh(box(0.06, 0.08, 0.2 * b), top, this.chest, -0.15 * b, chestLen + 0.0, 0);
    }

    // Neck + head
    this._mesh(cyl(0.065 * b, 0.075 * b, 0.12), skin, this.chest, 0, chestLen + 0.03, 0);
    this.head = new THREE.Group();
    this.head.position.y = chestLen + 0.08;
    this.chest.add(this.head);
    const hr = 0.125 * hd;
    const headMesh = this._mesh(ico(hr, 1), skin, this.head, 0, hr * 0.95, 0.01);
    headMesh.scale.set(0.88, 1.08, 0.98);
    this._mesh(box(hr * 1.2, hr * 0.55, hr * 1.1), skin, this.head, 0, hr * 0.35, 0.03); // jaw
    this._mesh(box(0.035, 0.022, 0.02), dark, this.head, 0.045, hr * 1.05, hr * 0.9); // eyes
    this._mesh(box(0.035, 0.022, 0.02), dark, this.head, -0.045, hr * 1.05, hr * 0.9);
    this._mesh(box(0.09, 0.018, 0.03), hairMat, this.head, 0, hr * 1.25, hr * 0.88); // brow
    this._mesh(box(0.03, 0.05, 0.04), skin, this.head, 0, hr * 0.85, hr * 1.0); // nose

    // Hair styles
    switch (L.hair) {
      case 'buzz':
        this._mesh(ico(hr * 1.02, 1), hairMat, this.head, 0, hr * 1.05, -0.01).scale.set(0.9, 0.9, 0.98);
        break;
      case 'short':
        this._mesh(ico(hr * 1.06, 1), hairMat, this.head, 0, hr * 1.12, -0.02).scale.set(0.92, 0.9, 1.0);
        this._mesh(box(hr * 1.4, hr * 0.35, hr * 1.2), hairMat, this.head, 0, hr * 1.8, -0.01);
        break;
      case 'mohawk':
        this._mesh(box(0.05, hr * 0.8, hr * 2.0), hairMat, this.head, 0, hr * 2.0, -0.02);
        break;
      case 'long':
        this._mesh(ico(hr * 1.07, 1), hairMat, this.head, 0, hr * 1.12, -0.02).scale.set(0.95, 0.92, 1.0);
        this._mesh(box(hr * 1.6, hr * 2.0, hr * 0.5), hairMat, this.head, 0, hr * 0.6, -hr * 0.8);
        break;
      default:
        break;
    }
    if (L.beard === 'mustache') this._mesh(box(hr * 0.95, hr * 0.16, hr * 0.2), hairMat, this.head, 0, hr * 0.62, hr * 0.98);
    else if (L.beard) this._mesh(box(hr * 1.3, hr * 0.6, hr * 0.5), hairMat, this.head, 0, hr * 0.25, hr * 0.62);
    if (L.scar) this._mesh(box(0.012, hr * 0.7, 0.012), this._mat('#d9a0a0', 0.6), this.head, -0.05, hr * 1.05, hr * 0.92).rotation.z = 0.35;
    if (L.cape) {
      // cape hung from the shoulders, swaying behind
      const capeGeo = cached('cape', () => {
        const g = new THREE.PlaneGeometry(0.5, 1.05, 1, 3);
        g.translate(0, -0.525, 0);
        return g;
      });
      const cape = new THREE.Mesh(capeGeo, new THREE.MeshStandardMaterial({ color: L.cape, roughness: 0.8, side: THREE.DoubleSide, flatShading: true }));
      this.materials.push(cape.material);
      cape.position.set(0, chestLen * 0.95, -0.15 * b);
      cape.rotation.x = 0.12;
      cape.castShadow = true;
      this.chest.add(cape);
      this.cape = cape;
    }
    switch (L.accessory) {
      case 'headband':
        this._mesh(cyl(hr * 0.98, hr * 0.98, 0.05, 10), acc, this.head, 0, hr * 1.35, 0.0).scale.set(0.92, 1, 1.02);
        break;
      case 'mask':
        this._mesh(box(hr * 1.85, hr * 0.75, hr * 0.5), acc, this.head, 0, hr * 0.5, hr * 0.68);
        break;
      case 'headgear':
        this._mesh(ico(hr * 1.12, 1), acc, this.head, 0, hr * 1.2, -0.02).scale.set(0.95, 0.85, 1.0);
        this._mesh(box(hr * 0.5, hr * 0.8, hr * 0.8), acc, this.head, hr * 0.9, hr * 0.8, 0);
        this._mesh(box(hr * 0.5, hr * 0.8, hr * 0.8), acc, this.head, -hr * 0.9, hr * 0.8, 0);
        break;
      case 'chain': {
        const c = this._mesh(torus(0.13 * b, 0.018), acc, this.chest, 0, chestLen - 0.02, 0.03);
        c.rotation.x = Math.PI / 2 - 0.35;
        break;
      }
      default:
        break;
    }
    if (L.top === 'hoodie') this._mesh(box(0.3 * b, 0.22, 0.12), top, this.chest, 0, chestLen + 0.02, -0.13 * b); // hood bunched on the back

    // Arms
    const upLen = 0.27 * a;
    const foreLen = 0.26 * a;
    const makeArm = (side) => {
      const sh = new THREE.Group();
      sh.rotation.order = 'YXZ';
      sh.position.set(side * (0.205 * b + 0.04), chestLen * 0.86, 0);
      this.chest.add(sh);
      this._mesh(sphere(0.085 * b, 7, 5), sleeves, sh, 0, -0.01, 0); // deltoid
      this._mesh(capsule(0.06 * b, upLen - 0.08), sleeves, sh, 0, -upLen / 2, 0);
      const el = new THREE.Group();
      el.position.y = -upLen;
      sh.add(el);
      this._mesh(capsule(0.052 * b, foreLen - 0.08), forearmMat, el, 0, -foreLen / 2 + 0.01, 0);
      // bare fist: palm block + knuckle row
      const g = this._mesh(box(0.075 * b, 0.1, 0.085), fists, el, 0, -foreLen - 0.035, 0.008);
      this._mesh(box(0.08 * b, 0.03, 0.03), fists, g, 0, -0.045, 0.03);
      this._mesh(box(0.025, 0.05, 0.03), fists, g, side * 0.035, 0.0, 0.035); // thumb
      return { sh, el, glove: g };
    };
    const lArm = makeArm(1);
    const rArm = makeArm(-1);
    this.lSh = lArm.sh;
    this.lEl = lArm.el;
    this.rSh = rArm.sh;
    this.rEl = rArm.el;
    this.lGlove = lArm.glove;
    this.rGlove = rArm.glove;

    // Legs
    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.rotation.order = 'YXZ';
      hip.position.set(side * 0.1 * b, -0.05, 0);
      this.pelvis.add(hip);
      this._mesh(capsule(0.085 * b, thighLen - 0.1), legsMat, hip, 0, -thighLen / 2, 0);
      this._mesh(capsule(0.1 * b, thighLen * 0.42), shorts, hip, 0, -thighLen * 0.28, 0); // shorts leg
      this._mesh(cyl(0.104 * b, 0.104 * b, 0.035, 8), trim, hip, 0, -thighLen * 0.5, 0);
      const kn = new THREE.Group();
      kn.position.y = -thighLen;
      hip.add(kn);
      this._mesh(capsule(0.066 * b, shinLen - 0.1), legsMat, kn, 0, -shinLen / 2, 0);
      this._mesh(box(0.11 * b, 0.08, 0.25), shoes, kn, 0, -shinLen - 0.02, 0.05);
      if (suit) this._mesh(cyl(0.075 * b, 0.07 * b, 0.2, 7), shoes, kn, 0, -shinLen + 0.08, 0); // tall boots
      return { hip, kn };
    };
    const lLeg = makeLeg(1);
    const rLeg = makeLeg(-1);
    this.lHip = lLeg.hip;
    this.lKn = lLeg.kn;
    this.rHip = rLeg.hip;
    this.rKn = rLeg.kn;

    this.height = this.hipHeight + 0.12 + absLen + chestLen + 0.08 + hr * 2;

    // Blood that appears as the fighter takes damage (each patch has a damage threshold)
    const blood = new THREE.MeshStandardMaterial({ color: 0x7a0712, roughness: 0.3, metalness: 0.1, flatShading: true });
    const front = 0.17 * b;
    const patch = (parent, w, h, d, x, y, z, thr, ry = 0) => {
      const m = new THREE.Mesh(box(w, h, d), blood);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.visible = false;
      m.userData.thr = thr;
      parent.add(m);
      return m;
    };
    this.bloodPatches = [
      patch(this.head, 0.024, 0.075, 0.012, 0, hr * 0.55, hr * 1.04, 0.12), // nose
      patch(this.head, 0.055, 0.02, 0.012, 0.045, hr * 1.32, hr * 0.94, 0.28), // brow
      patch(this.head, 0.016, 0.1, 0.012, 0.06, hr * 1.0, hr * 0.93, 0.4), // brow drip
      patch(this.head, 0.045, 0.06, 0.012, -0.075, hr * 0.8, hr * 0.8, 0.52, -0.6), // cheek
      patch(this.head, 0.06, 0.03, 0.012, 0, hr * 0.28, hr * 0.92, 0.6), // chin
      patch(this.chest, 0.035, 0.16, 0.012, 0.03, chestLen * 0.62, front, 0.5), // chest
      patch(this.chest, 0.03, 0.2, 0.012, -0.07, chestLen * 0.5, front, 0.72),
      patch(this.chest, 0.06, 0.05, 0.012, 0.09, chestLen * 0.82, front, 0.86),
    ];
    this.gloveBase = new THREE.Color(L.skin);
    this._bloodAmt = 0;
  }

  /** 0 = clean, 1 = covered. Only shown when blood is enabled. */
  setBlood(f) {
    const amt = FighterModel.bloodEnabled ? f : 0;
    if (Math.abs(amt - this._bloodAmt) < 0.01) return;
    this._bloodAmt = amt;
    for (const m of this.bloodPatches) m.visible = amt >= m.userData.thr;
    this.gloveMat.color.copy(this.gloveBase).lerp(new THREE.Color(0x5a0710), amt * 0.45);
  }

  /** Apply a pose array to the rig. */
  apply(p, extraYaw = 0) {
    const det = this.detached;
    this.offset.position.set(0, p[IDX.root], p[IDX.root + 1]);
    this.offset.rotation.y = p[IDX.root + 2] + extraYaw;
    this.body.rotation.set(p[IDX.tilt], 0, p[IDX.tilt + 1]);
    this.pelvis.position.y = this.pelvisBaseY + p[IDX.pelvisY];
    let i = IDX.pelvis;
    this.pelvis.rotation.set(p[i], p[i + 1], p[i + 2]);
    i = IDX.spine;
    this.spine.rotation.set(p[i], p[i + 1], p[i + 2]);
    i = IDX.head;
    if (!det.head) this.head.rotation.set(p[i], p[i + 1], p[i + 2]);
    i = IDX.lSh;
    if (!det.lArm) {
      this.lSh.rotation.set(p[i], p[i + 1], p[i + 2]);
      this.lEl.rotation.x = p[IDX.lEl];
    }
    i = IDX.rSh;
    if (!det.rArm) {
      this.rSh.rotation.set(p[i], p[i + 1], p[i + 2]);
      this.rEl.rotation.x = p[IDX.rEl];
    }
    i = IDX.lHip;
    if (!det.lLeg) {
      this.lHip.rotation.set(p[i], p[i + 1], p[i + 2]);
      this.lKn.rotation.x = p[IDX.lKn];
    }
    i = IDX.rHip;
    if (!det.rLeg) {
      this.rHip.rotation.set(p[i], p[i + 1], p[i + 2]);
      this.rKn.rotation.x = p[IDX.rKn];
    }
  }

  // --- Dismemberment ----------------------------------------------------------------------------

  _part(name) {
    return { head: this.head, lArm: this.lSh, rArm: this.rSh, lLeg: this.lHip, rLeg: this.rHip }[name];
  }

  /**
   * Tear a body part off: it's moved into the scene (keeping its world transform) for the debris
   * simulation, and a bloody stump is left at the joint. Returns the detached object.
   */
  detach(name, scene) {
    if (this.detached[name]) return null;
    const obj = this._part(name);
    const parent = obj.parent;
    this.detached[name] = { obj, parent, pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone() };
    const stump = new THREE.Mesh(sphere(name === 'head' ? 0.075 : 0.065, 7, 5), this.stumpMat);
    stump.position.copy(obj.position);
    stump.scale.set(1, name === 'head' ? 0.6 : 0.8, 1);
    parent.add(stump);
    this.detached[name].stump = stump;
    scene.attach(obj);
    // a raw end on the severed piece too
    const end = new THREE.Mesh(sphere(0.06, 7, 5), this.stumpMat);
    obj.add(end);
    this.detached[name].end = end;
    return obj;
  }

  /** Put every detached part back (new fight). */
  reattachAll() {
    for (const k of Object.keys(this.detached)) {
      const d = this.detached[k];
      d.parent.add(d.obj);
      d.obj.position.copy(d.pos);
      d.obj.quaternion.copy(d.quat);
      d.obj.scale.copy(d.scale);
      d.stump.removeFromParent();
      d.end.removeFromParent();
    }
    this.detached = {};
  }

  /** Emissive hit flash (0..1) and special-move glove glow (0..1). */
  updateFx(dt) {
    if (this.cape) {
      this._capeT = (this._capeT || 0) + dt;
      this.cape.rotation.x = 0.15 + Math.sin(this._capeT * 2.3) * 0.06 + Math.min(0.9, this.capeLift || 0);
    }
    this.flash = Math.max(0, this.flash - dt * 6);
    const f = this.flash * 0.55;
    for (const m of this.materials) m.emissive.setRGB(f, f, f);
    if (this.glow > 0) {
      this.gloveMat.emissive.setRGB(f + this.accent.r * this.glow * 2, f + this.accent.g * this.glow * 2, f + this.accent.b * this.glow * 2);
    }
  }

  /** World position of a glove (for hit sparks and special-move trails). */
  gloveWorld(side, out) {
    return (side < 0 ? this.lGlove : this.rGlove).getWorldPosition(out);
  }

  dispose() {
    this.reattachAll();
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }
}
