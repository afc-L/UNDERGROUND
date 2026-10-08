// The underground venue: octagon cage, concrete hall, light rig, neon, instanced crowd,
// entrance tunnel, fighter waiting area, fog, dust motes and fake light shafts.
// All textures are drawn procedurally on canvases (no asset downloads).
import * as THREE from 'three';
import { ARENA } from './config.js';

function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function speckle(g, w, h, n, colors, rMax = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    const r = Math.random() * rMax;
    g.fillRect(Math.random() * w, Math.random() * h, r + 0.5, r + 0.5);
  }
}

const concreteTex = () =>
  canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#3a3836';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, ['#2f2d2b', '#45423f', '#353331', '#4b4844'], 2.5);
    // stains (oil / water, not blood)
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 20 + Math.random() * 70;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(15,14,13,0.45)');
      grd.addColorStop(1, 'rgba(15,14,13,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // cracks
    g.strokeStyle = 'rgba(20,18,17,0.7)';
    for (let i = 0; i < 10; i++) {
      g.lineWidth = 0.6 + Math.random() * 1.2;
      g.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (Math.random() - 0.5) * 50;
        y += (Math.random() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // expansion joints
    g.strokeStyle = 'rgba(22,20,19,0.9)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, w, h);
  }, [10, 10]);

const brickTex = () =>
  canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#16120f';
    g.fillRect(0, 0, w, h);
    const bw = 64;
    const bh = 26;
    for (let y = 0; y < h; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < w + bw; x += bw) {
        const v = 35 + Math.random() * 25;
        g.fillStyle = `rgb(${v + 12},${v * 0.75},${v * 0.6})`;
        g.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
      }
    }
    speckle(g, w, h, 4000, ['rgba(0,0,0,0.35)', 'rgba(255,255,255,0.04)'], 3);
    // grime gradient toward the bottom
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(0,0,0,0.1)');
    grd.addColorStop(1, 'rgba(0,0,0,0.65)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // some graffiti tags (abstract shapes)
    const cols = ['rgba(255,40,140,0.35)', 'rgba(40,220,255,0.3)', 'rgba(255,200,40,0.25)'];
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = cols[i];
      g.lineWidth = 6;
      g.beginPath();
      const x = 60 + Math.random() * 380;
      const y = 300 + Math.random() * 120;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) g.quadraticCurveTo(x + k * 18 + Math.random() * 30, y - 40 + Math.random() * 80, x + (k + 1) * 22, y + (Math.random() - 0.5) * 40);
      g.stroke();
    }
  }, [12, 3]);

const matTex = (accent) =>
  canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#1b1a1d';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 12000, ['#1f1e22', '#17161a', '#232227'], 2);
    // scuffs
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`;
      g.lineWidth = 2 + Math.random() * 6;
      g.beginPath();
      const x = Math.random() * w;
      const y = Math.random() * h;
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 120);
      g.stroke();
    }
    const cx = w / 2;
    const cy = h / 2;
    g.strokeStyle = accent;
    g.globalAlpha = 0.55;
    g.lineWidth = 10;
    g.beginPath();
    g.arc(cx, cy, 300, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, 330, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 0.5;
    g.fillStyle = accent;
    g.font = '900 104px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('UNDERGROUND', cx, cy);
    g.font = '700 30px "Arial Black", sans-serif';
    g.globalAlpha = 0.35;
    g.fillStyle = '#ffffff';
    g.fillText('NO RULES  ·  NO NAMES  ·  NO WAY OUT', cx, cy + 90);
    g.globalAlpha = 1;
    // fade toward the edge
    const grd = g.createRadialGradient(cx, cy, 300, cx, cy, 520);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });

const chainTex = () => {
  const t = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(190,195,205,1)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w / 2, 0);
    g.lineTo(w, h / 2);
    g.lineTo(w / 2, h);
    g.closePath();
    g.stroke();
  }, [14, 8]);
  return t;
};

const signTex = (text, color, sub = '') =>
  canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = '900 150px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 40;
    g.fillStyle = color;
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    g.shadowBlur = 12;
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.85;
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) {
      g.globalAlpha = 1;
      g.font = '700 46px "Arial Black", sans-serif';
      g.fillStyle = color;
      g.fillText(sub, w / 2, h * 0.85);
    }
  });

export class Arena {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;
    this.excitement = 0.2;
    this.flicker = [];
    this._build();
  }

  _build() {
    const g = this.group;
    const hi = this.quality === 'high';
    this.scene.fog = new THREE.FogExp2(0x07060a, 0.032);
    this.scene.background = new THREE.Color(0x050407);

    // ---- Lights ----
    const hemi = new THREE.HemisphereLight(0x4a5068, 0x100c0c, 0.75);
    g.add(hemi);
    const main = new THREE.SpotLight(0xfff1dc, 520, 30, 0.62, 0.55, 1.6);
    main.position.set(0, 11, 0);
    main.target.position.set(0, 0, 0);
    main.castShadow = true;
    main.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024);
    main.shadow.bias = -0.0004;
    main.shadow.normalBias = 0.02;
    main.shadow.camera.near = 4;
    main.shadow.camera.far = 16;
    g.add(main, main.target);
    this.mainLight = main;

    const mag = new THREE.SpotLight(0xff2a8a, 70, 26, 0.75, 0.8, 1.5);
    mag.position.set(-9, 8, -6);
    mag.target.position.set(0, 0.5, 0);
    const cyan = new THREE.SpotLight(0x22d3ee, 60, 26, 0.75, 0.8, 1.5);
    cyan.position.set(9, 8, 6);
    cyan.target.position.set(0, 0.5, 0);
    g.add(mag, mag.target, cyan, cyan.target);
    this.colorLights = [mag, cyan];

    // ---- Floor / hall ----
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.92, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

    const wallTex = brickTex();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 13, 32, 1, true), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95, side: THREE.BackSide }));
    wall.position.y = 6.5;
    g.add(wall);
    const ceil = new THREE.Mesh(new THREE.CircleGeometry(22, 32), new THREE.MeshStandardMaterial({ color: 0x0b0a0c, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 13;
    g.add(ceil);

    const concrete = new THREE.MeshStandardMaterial({ color: 0x48443f, roughness: 0.95 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.7 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.7 });
    // pillars
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 13, 1.1), concrete);
      p.position.set(Math.sin(a) * 18.5, 6.5, Math.cos(a) * 18.5);
      p.rotation.y = a;
      g.add(p);
    }
    // overhead pipes
    for (let i = 0; i < 5; i++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 44, 8), steel);
      pipe.rotation.z = Math.PI / 2;
      pipe.rotation.y = (i / 5) * Math.PI;
      pipe.position.y = 11.2 + (i % 2) * 0.6;
      g.add(pipe);
    }

    // ---- Octagon platform + mat ----
    const R = ARENA.cageRadius;
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.35, R + 0.5, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x111014, roughness: 0.8 }));
    plat.position.y = -0.15;
    plat.rotation.y = Math.PI / 8;
    plat.receiveShadow = true;
    g.add(plat);
    this.platformTop = 0;
    const mat = new THREE.Mesh(new THREE.CircleGeometry(R + 0.3, 8), new THREE.MeshStandardMaterial({ map: matTex('#e11d48'), roughness: 0.85 }));
    mat.rotation.x = -Math.PI / 2;
    mat.rotation.z = Math.PI / 8;
    mat.position.y = 0.005;
    mat.receiveShadow = true;
    g.add(mat);

    // ---- Cage ----
    const fenceMat = new THREE.MeshStandardMaterial({ map: chainTex(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.8, roughness: 0.45, color: 0x9aa0aa });
    const padMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.6 });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0xff1f6b });
    const neonMat2 = new THREE.MeshBasicMaterial({ color: 0x19d3ff });
    this.neonMats = [neonMat, neonMat2];
    const H = ARENA.fenceHeight;
    this.fencePanels = [];
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2;
      const a1 = ((i + 1) / 8) * Math.PI * 2;
      const x0 = Math.sin(a0) * R;
      const z0 = Math.cos(a0) * R;
      const x1 = Math.sin(a1) * R;
      const z1 = Math.cos(a1) * R;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      const ang = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
      // post (padded)
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, H + 0.35, 8), padMat);
      post.position.set(x0, (H + 0.35) / 2, z0);
      post.castShadow = true;
      g.add(post);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 8), neonMat);
      cap.position.set(x0, H + 0.38, z0);
      g.add(cap);
      // fence
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, H - 0.35), fenceMat);
      panel.position.set(mx, 0.35 + (H - 0.35) / 2, mz);
      panel.rotation.y = ang;
      panel.userData.base = panel.position.clone();
      panel.userData.normal = new THREE.Vector3(mx, 0, mz).normalize();
      panel.userData.wobble = 0;
      g.add(panel);
      this.fencePanels.push(panel);
      // bottom pad + top rail
      const pad = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 0.16), padMat);
      pad.position.set(mx, 0.175, mz);
      pad.rotation.y = ang;
      pad.receiveShadow = true;
      g.add(pad);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.12), steel);
      rail.position.set(mx, H, mz);
      rail.rotation.y = ang;
      g.add(rail);
      // neon strip along the outside base
      const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.04), i % 2 ? neonMat2 : neonMat);
      strip.position.set(mx * 1.06, 0.02, mz * 1.06);
      strip.rotation.y = ang;
      g.add(strip);
    }

    // ---- Light rig (truss + lamps + fake light shafts) ----
    const truss = new THREE.Group();
    truss.position.y = 9.5;
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(9, 0.25, 0.25), steel);
      bar.position.set(0, 0, 4.5);
      const holder = new THREE.Group();
      holder.rotation.y = (i * Math.PI) / 2;
      holder.add(bar);
      truss.add(holder);
    }
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff3dd });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 4;
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 0.4, 10), black);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12), lampMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.y = -0.21;
      lamp.add(lens);
      lamp.position.set(Math.sin(a) * 4.4, -0.35, Math.cos(a) * 4.4);
      truss.add(lamp);
    }
    for (let i = 0; i < 4; i++) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.5, 4), steel);
      chain.position.set(i < 2 ? -4.5 : 4.5, 1.75, i % 2 ? -4.5 : 4.5);
      truss.add(chain);
    }
    g.add(truss);
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xffe9c8, transparent: true, opacity: 0.028, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 6.8, 9.3, 24, 1, true), shaftMat);
    shaft.position.y = 4.65;
    g.add(shaft);
    this.shaft = shaft;

    // ---- Neon signage ----
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: signTex('UNDERGROUND', '#ff1f6b'), transparent: true, depthWrite: false, fog: false }));
    sign.position.set(0, 8.6, -21.2);
    g.add(sign);
    this.flicker.push({ mat: sign.material, base: 1, t: 0 });

    // ---- Entrance tunnel (+X side) ----
    const entAng = Math.PI / 2;
    this.entranceAngle = entAng;
    const ex = Math.sin(entAng) * 21.6;
    const ez = Math.cos(entAng) * 21.6;
    const tunnel = new THREE.Group();
    tunnel.position.set(ex, 0, ez);
    tunnel.rotation.y = entAng + Math.PI;
    const tMat = new THREE.MeshStandardMaterial({ color: 0x050405, roughness: 1 });
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.5), tMat);
    hole.position.set(0, 2.25, 0.05);
    tunnel.add(hole);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, metalness: 0.6, roughness: 0.5 });
    for (const sx of [-2.1, 2.1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.8, 0.4), frameMat);
      side.position.set(sx, 2.4, 0.1);
      tunnel.add(side);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.4, 0.4), frameMat);
    top.position.set(0, 4.7, 0.1);
    tunnel.add(top);
    const entSign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: signTex('FIGHTERS', '#ff3b2f', 'ENTRANCE'), transparent: true, depthWrite: false, fog: false }));
    entSign.position.set(0, 5.6, 0.2);
    tunnel.add(entSign);
    this.flicker.push({ mat: entSign.material, base: 1, t: 0 });
    g.add(tunnel);
    const entLight = new THREE.PointLight(0xff3020, 30, 12, 1.8);
    entLight.position.set(Math.sin(entAng) * 19.5, 3.5, Math.cos(entAng) * 19.5);
    g.add(entLight);
    this.entLight = entLight;
    // walkway with rope barriers
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.6), new THREE.MeshStandardMaterial({ color: 0x1a1214, roughness: 0.9 }));
    walk.rotation.x = -Math.PI / 2;
    walk.rotation.z = -entAng + Math.PI / 2;
    walk.position.set(Math.sin(entAng) * 14, 0.01, Math.cos(entAng) * 14);
    walk.receiveShadow = true;
    g.add(walk);
    for (let k = 0; k < 6; k++) {
      for (const side of [-1.4, 1.4]) {
        const d = 8.6 + k * 2.2;
        const stanchion = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1, 6), steel);
        stanchion.position.set(Math.sin(entAng) * d + Math.cos(entAng) * side, 0.5, Math.cos(entAng) * d - Math.sin(entAng) * side);
        g.add(stanchion);
      }
    }

    // ---- Fighter waiting area (-X side): benches, lockers, heavy bag, lamp ----
    const waitAng = -Math.PI / 2;
    this.waitAngle = waitAng;
    const wa = new THREE.Group();
    wa.position.set(Math.sin(waitAng) * 17, 0, Math.cos(waitAng) * 17);
    wa.rotation.y = waitAng + Math.PI;
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 0.85 });
    const lockerMat = new THREE.MeshStandardMaterial({ color: 0x2f3d3a, roughness: 0.6, metalness: 0.5 });
    for (let k = 0; k < 2; k++) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 0.6), wood);
      bench.position.set(-2 + k * 4, 0.5, -1.5);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.4), black);
      legs.position.set(-2 + k * 4, 0.22, -1.5);
      wa.add(bench, legs);
    }
    for (let k = 0; k < 7; k++) {
      const locker = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.2, 0.6), lockerMat);
      locker.position.set(-2.7 + k * 0.8, 1.1, -3.6);
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.02), black);
      vent.position.set(0, 0.7, 0.31);
      locker.add(vent);
      wa.add(locker);
    }
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 1.3, 10), new THREE.MeshStandardMaterial({ color: 0x6b1515, roughness: 0.6 }));
    bag.position.set(3.2, 1.5, 0.3);
    const bagChain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), steel);
    bagChain.position.y = 1.35;
    bag.add(bagChain);
    wa.add(bag);
    this.bag = bag;
    const hang = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.35, 10, 1, true), steel);
    hang.position.set(0, 3.4, -1.2);
    wa.add(hang);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcf87 }));
    bulb.position.set(0, 3.25, -1.2);
    wa.add(bulb);
    const waitLight = new THREE.PointLight(0xffb560, 18, 9, 1.8);
    waitLight.position.set(0, 3.1, -1.2);
    wa.add(waitLight);
    const waitSign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: signTex('WARM UP', '#22d3ee'), transparent: true, depthWrite: false, fog: false }));
    waitSign.position.set(0, 3.0, -3.95);
    wa.add(waitSign);
    g.add(wa);

    // ---- Crowd ----
    this._buildCrowd(hi ? 7 : 4);

    // ---- Dust motes ----
    const n = hi ? 380 : 160;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 11;
      pos[i * 3] = Math.sin(a) * r;
      pos[i * 3 + 1] = Math.random() * 9;
      pos[i * 3 + 2] = Math.cos(a) * r;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const motes = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe6c0, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(motes);
    this.motes = motes;
  }

  _buildCrowd(rows) {
    const g = this.group;
    const bodyGeo = new THREE.BoxGeometry(0.46, 0.72, 0.3);
    bodyGeo.translate(0, 0.36, 0);
    const legGeo = new THREE.BoxGeometry(0.36, 0.8, 0.24);
    legGeo.translate(0, -0.4, 0);
    const headGeo = new THREE.IcosahedronGeometry(0.15, 0);
    const armGeo = new THREE.BoxGeometry(0.11, 0.55, 0.11);
    armGeo.translate(0, 0.27, 0);
    const spots = [];
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x1a1817, roughness: 0.95, side: THREE.DoubleSide });
    const r0 = 9.4;
    for (let row = 0; row < rows; row++) {
      const r = r0 + row * 0.95;
      const y = 0.8 + row * 0.42;
      const n = Math.floor((2 * Math.PI * r) / 0.62);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (row % 2) * 0.03;
        // leave gaps for the entrance walkway and the waiting area
        const dEnt = Math.abs(Math.atan2(Math.sin(a - this.entranceAngle), Math.cos(a - this.entranceAngle)));
        const dWait = Math.abs(Math.atan2(Math.sin(a - this.waitAngle), Math.cos(a - this.waitAngle)));
        if (dEnt < 0.2 || dWait < 0.32) continue;
        if (Math.random() < 0.07) continue;
        const jr = r + (Math.random() - 0.5) * 0.25;
        spots.push({ x: Math.sin(a) * jr, z: Math.cos(a) * jr, y: y + (Math.random() - 0.5) * 0.06, a, phase: Math.random() * 10, speed: 0.8 + Math.random() * 0.6, height: 0.9 + Math.random() * 0.2, hype: Math.random() });
      }
      // tier step
      if (row > 0) {
        const step = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.47, r - 0.47, 0.42, 48, 1, true), stepMat);
        step.position.y = y - 0.8 - 0.21;
        g.add(step);
        const tread = new THREE.Mesh(new THREE.RingGeometry(r - 0.47, r + 0.5, 48), stepMat);
        tread.rotation.x = -Math.PI / 2;
        tread.position.y = y - 0.8;
        g.add(tread);
      }
    }
    const count = spots.length;
    const clothes = [0x1c1c22, 0x2a2a30, 0x3b1d1d, 0x1d2b3b, 0x332a1d, 0x111111, 0x404048, 0x5a1a2a, 0x1a3a3a, 0x6b5b3b];
    const skins = [0xf1c9a5, 0xd9a07a, 0xb07650, 0x8d5a3b, 0x6b4430, 0xe0ab8b];
    const bodyMat = new THREE.MeshLambertMaterial();
    const headMat = new THREE.MeshLambertMaterial();
    this.crowdBodies = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
    this.crowdLegs = new THREE.InstancedMesh(legGeo, new THREE.MeshLambertMaterial({ color: 0x15151a }), count);
    this.crowdHeads = new THREE.InstancedMesh(headGeo, headMat, count);
    this.crowdArms = new THREE.InstancedMesh(armGeo, bodyMat, count * 2);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.setHex(clothes[(Math.random() * clothes.length) | 0]);
      this.crowdBodies.setColorAt(i, c);
      this.crowdArms.setColorAt(i * 2, c);
      this.crowdArms.setColorAt(i * 2 + 1, c);
      c.setHex(skins[(Math.random() * skins.length) | 0]);
      this.crowdHeads.setColorAt(i, c);
    }
    for (const m of [this.crowdBodies, this.crowdLegs, this.crowdHeads, this.crowdArms]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      g.add(m);
    }
    this.spots = spots;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this.crowdWave = 0;

    // phone camera flashes for big moments
    const fpos = new Float32Array(60 * 3);
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    this.phoneFlash = new THREE.Points(fgeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.phoneFlash.frustumCulled = false;
    g.add(this.phoneFlash);
    this.flashT = 0;
  }

  /** Burst of phone flashes from the crowd */
  cameraFlashes() {
    const pos = this.phoneFlash.geometry.attributes.position.array;
    for (let i = 0; i < 60; i++) {
      const s = this.spots[(Math.random() * this.spots.length) | 0];
      pos[i * 3] = s.x;
      pos[i * 3 + 1] = s.y + 1.1;
      pos[i * 3 + 2] = s.z;
    }
    this.phoneFlash.geometry.attributes.position.needsUpdate = true;
    this.flashT = 1.6;
  }

  /** Rattle the fence nearest to a point (fighter slammed into it). */
  rattleFence(x, z, power) {
    let best = null;
    let bd = 1e9;
    for (const p of this.fencePanels) {
      const d = Math.hypot(p.position.x - x, p.position.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) best.userData.wobble = Math.min(1, best.userData.wobble + power);
  }

  update(dt, excitement) {
    this.time += dt;
    const t = this.time;
    this.excitement += (excitement - this.excitement) * Math.min(1, dt * 2);
    const ex = this.excitement;

    // crowd animation
    const m = this._m;
    const q = this._q;
    const p = this._p;
    const s = this._s;
    const e = this._e;
    for (let i = 0; i < this.spots.length; i++) {
      const sp = this.spots[i];
      const hyped = sp.hype < ex;
      const bounce = Math.max(0, Math.sin(t * sp.speed * (hyped ? 9 : 3) + sp.phase)) * (hyped ? 0.16 + ex * 0.12 : 0.025);
      const face = sp.a + Math.PI;
      e.set(0, face, 0);
      q.setFromEuler(e);
      p.set(sp.x, sp.y + bounce, sp.z);
      s.set(1, sp.height, 1);
      m.compose(p, q, s);
      this.crowdBodies.setMatrixAt(i, m);
      this.crowdLegs.setMatrixAt(i, m);
      p.y += 0.72 * sp.height + 0.15;
      s.set(1, 1, 1);
      m.compose(p, q, s);
      this.crowdHeads.setMatrixAt(i, m);
      // arms: down at the sides, or pumping overhead when hyped
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1;
        const lx = Math.cos(face) * side * 0.29;
        const lz = -Math.sin(face) * side * 0.29;
        p.set(sp.x + lx, sp.y + bounce + 0.66 * sp.height, sp.z + lz);
        const up = hyped ? Math.PI - 0.25 + Math.sin(t * 8 + sp.phase + k) * 0.35 : 0.15;
        e.set(0, face, side * (Math.PI - up), 'YXZ');
        q.setFromEuler(e);
        m.compose(p, q, s);
        this.crowdArms.setMatrixAt(i * 2 + k, m);
      }
    }
    this.crowdBodies.instanceMatrix.needsUpdate = true;
    this.crowdLegs.instanceMatrix.needsUpdate = true;
    this.crowdHeads.instanceMatrix.needsUpdate = true;
    this.crowdArms.instanceMatrix.needsUpdate = true;

    // flickering neon
    for (const f of this.flicker) {
      f.t -= dt;
      if (f.t <= 0) {
        f.t = Math.random() < 0.06 ? 0.05 + Math.random() * 0.08 : 0.4 + Math.random() * 2.5;
        f.mat.opacity = f.t < 0.15 ? 0.25 : 1;
      }
    }
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.2);
    this.colorLights[0].intensity = 45 + pulse * 25 + ex * 45;
    this.colorLights[1].intensity = 40 + (1 - pulse) * 25 + ex * 45;
    this.entLight.intensity = 22 + Math.sin(t * 13) * 2 + (Math.random() < 0.02 ? -15 : 0);

    // fence wobble
    for (const panel of this.fencePanels) {
      const w = panel.userData.wobble;
      if (w <= 0.001) continue;
      panel.userData.wobble *= Math.exp(-dt * 5);
      const off = Math.sin(t * 40) * w * 0.08;
      panel.position.copy(panel.userData.base).addScaledVector(panel.userData.normal, off + w * 0.05);
    }

    // drifting dust
    this.motes.rotation.y += dt * 0.012;
    this.motes.position.y = Math.sin(t * 0.2) * 0.2;
    this.bag.rotation.z = Math.sin(t * 0.8) * 0.04;

    if (this.flashT > 0) {
      this.flashT -= dt;
      this.phoneFlash.material.opacity = Math.random() < 0.5 ? Math.min(1, this.flashT) : 0;
      if (Math.random() < 0.3) this.cameraFlashesReshuffle();
    } else this.phoneFlash.material.opacity = 0;
  }

  cameraFlashesReshuffle() {
    const pos = this.phoneFlash.geometry.attributes.position.array;
    const i = (Math.random() * 60) | 0;
    const s = this.spots[(Math.random() * this.spots.length) | 0];
    pos[i * 3] = s.x;
    pos[i * 3 + 1] = s.y + 1.1;
    pos[i * 3 + 2] = s.z;
    this.phoneFlash.geometry.attributes.position.needsUpdate = true;
  }
}
