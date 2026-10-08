// Entry point: renderer + scene setup, the app-level screen flow and the main loop.
import * as THREE from 'three';
import { OPPONENTS, TRAINING_DUMMY, TOURNAMENT } from './config.js';
import { ATTACKS } from './attacks.js';
import { AudioEngine } from './audio.js';
import { Progression } from './progression.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Game, newTournament } from './game.js';
import { AIController } from './ai.js';

function showError(e) {
  const box = document.getElementById('error-box');
  box.classList.remove('hidden');
  box.textContent = `Something went wrong:\n${e && e.stack ? e.stack : e}`;
}
window.addEventListener('error', (e) => showError(e.error || e.message));

const canvas = document.getElementById('game-canvas');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('boot').textContent = 'WEBGL IS NOT AVAILABLE IN THIS BROWSER';
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);

const audio = new AudioEngine();
const prog = new Progression();
const input = new Input(canvas);
const dom = {
  canvas,
  flash: document.getElementById('fx-flash'),
  hurt: document.getElementById('fx-hurt'),
  lines: document.getElementById('fx-lines'),
  numbers: document.getElementById('dmg-numbers'),
};

let tournament = null;
let screenStack = [];
let game;

const app = {
  goto(screen) {
    screenStack = [screen];
    ui.show(screen);
    game.previewOpponent(null);
    game.focusPlayer(screen === 'fighter');
  },
  push(screen) {
    screenStack.push(screen);
    ui.show(screen);
    game.focusPlayer(screen === 'fighter');
  },
};

const handlers = {
  onMenu(action) {
    audio.init();
    if (action === 'fight') app.push('select');
    else if (action === 'tournament') app.push('tournament');
    else if (action === 'training') {
      ui.show(null);
      game.startFight(TRAINING_DUMMY, 'training');
    } else app.push(action);
  },
  onBack() {
    screenStack.pop();
    const s = screenStack[screenStack.length - 1] || 'menu';
    if (!screenStack.length) screenStack = ['menu'];
    ui.show(s);
    game.previewOpponent(null);
    game.focusPlayer(s === 'fighter');
  },
  onPreview(profile) {
    game.previewOpponent(profile);
  },
  onPick(profile) {
    ui.show(null);
    game.startFight(profile, 'fight');
  },
  getTournament: () => tournament,
  tournamentPrize: TOURNAMENT.grandPrize,
  onTournamentGo() {
    if (!tournament) tournament = newTournament();
    const opp = OPPONENTS.find((o) => o.id === tournament.opponents[tournament.round]);
    ui.show(null);
    game.startFight(opp, 'tournament', tournament);
  },
  onTournamentForfeit() {
    tournament = null;
    ui.renderTournament();
  },
  onTournamentNext() {
    handlers.onTournamentGo();
  },
  onBuy(id) {
    const ok = prog.buyUpgrade(id);
    if (ok) game.refreshPlayerStats();
    return ok;
  },
  onLookChange() {
    game.buildPlayer();
    game.toMenu();
    game.focusPlayer(true);
  },
  onSettings(s) {
    prog.save();
    game.applySettings(s);
  },
  onResetProgress() {
    prog.reset();
    tournament = null;
    game.buildPlayer();
    game.toMenu();
  },
  onResume() {
    game.setPaused(false);
    input.lockPointer();
  },
  onRestart() {
    ui.show(null);
    game.state = game.pausedFrom || game.state;
    game.restart();
  },
  onQuit() {
    if (game.match && game.match.tournament) tournament = null; // quitting forfeits the run
    game.quitFight();
    app.goto('menu');
  },
  onResultsGo(screen) {
    if (tournament && (tournament.done || tournament.eliminated)) tournament = null;
    game.quitFight();
    app.goto('menu');
    if (screen !== 'menu') app.push(screen);
  },
  onRematch() {
    const profile = game.match.profile;
    ui.show(null);
    game.startFight(profile, 'fight');
  },
};

const ui = new UI(handlers, prog, audio);
game = new Game({ renderer, scene, camera, audio, progression: prog, ui, input, dom });

// Pause on Escape / when the pointer lock is lost mid-fight
window.addEventListener('keydown', (e) => {
  audio.init();
  if (e.code === 'Escape') {
    if (game.state === 'paused') handlers.onResume();
    else if (['fight', 'knockdown', 'intro'].includes(game.state)) game.setPaused(true);
    else if (ui.current && ui.current !== 'menu' && ui.current !== 'results' && game.state === 'menu') handlers.onBack();
  }
});
input.onPointerLockLost = () => {
  if (['fight', 'knockdown'].includes(game.state)) game.setPaused(true);
};
window.addEventListener('pointerdown', () => audio.init());

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let fpsAcc = 0;
let fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (window.__underground && window.__underground.frozen) return; // test harness steps manually
  try {
    game.update(dt);
    renderer.render(scene, camera);
  } catch (e) {
    showError(e);
    throw e;
  }
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 1) {
    window.__fps = fpsN / fpsAcc;
    fpsAcc = 0;
    fpsN = 0;
  }
}

app.goto('menu');
document.getElementById('boot').classList.add('hidden');
requestAnimationFrame(frame);

// Debug / test hook
window.__underground = {
  game, prog, ui, handlers, audio, input, OPPONENTS, ATTACKS, AIController,
  frozen: false,
  /** Advance the game n frames of dt seconds without rendering (tests). */
  step(n, dt = 1 / 60) {
    for (let i = 0; i < n; i++) game.update(dt);
  },
  render() {
    renderer.render(scene, camera);
  },
};
