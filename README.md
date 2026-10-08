# UNDERGROUND

A dark, cinematic arcade 3D fighting game that runs in the browser, built with
[Three.js](https://threejs.org/). You start as an unknown fighter in a fictional underground
tournament. You beat increasingly dangerous opponents, earn cash and reputation, buy upgrades,
and fight your way to the Champion.

There's no backend, account, API key, database or external service. Three.js is vendored in
`vendor/`, every model is built from procedural geometry, every texture is drawn on a canvas,
and every sound and the music are synthesized with the Web Audio API, so the game works fully
offline. Every fight is a **death match**: it ends only when one fighter dies. Clean hits spray
stylized blood that stays on the mat, and fighters get bloodier as their health drops. Turn
**Blood** off in Settings for sparks and sweat only.

## Running it

**Option 1: open the standalone file (no install needed)**

Open `dist/underground.html` in Chrome, Edge, Firefox or Safari by double-clicking it.

**Option 2: run the source (Node 18+)**

```bash
npm start            # serves the project at http://localhost:8080
```

`npm start` has no dependencies. Any static server works too. You can't open `index.html`
straight from disk because browsers block ES modules over `file://`. Use the standalone build
for that.

**Rebuilding the standalone file** after you change the source:

```bash
npm install          # installs esbuild (dev only)
npm run build        # writes dist/underground.html
```

## Website

`site/` holds the game's website: a landing page (`site/index.html`) with the fight card,
combat guide and controls, plus the playable game (`site/play.html`, copied from the standalone
build by `npm run build`). It's static, so any static host can serve the folder as-is. For
example, point GitHub Pages at it, or run `npm start` and open http://localhost:8080/site/.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move (relative to the camera) |
| Mouse | Camera. Click the game to capture the mouse. Mouse buttons don't attack. |
| `J` | Light attack. Chain up to 4: jab → cross → hook → uppercut. Stomp on a downed opponent. |
| `K` | Heavy attack / combo finisher. Ground kick on a downed opponent. |
| `Space` | Block. Tap it just before a hit for a **perfect block**. |
| `Shift` | Dodge. Hold it to sprint. |
| `Q` | Toggle lock-on (on by default) |
| `E` (or `L`) | Special attack: **Underground Breaker** |
| `Esc` | Pause |

All fighting is on the keyboard. Menus work with the mouse, or with the arrow keys, Enter and
`Esc`.

### Combat guide

* **Combo tree.** Light presses chain jab → cross → hook → uppercut. Heavy after a jab or cross
  is a **roundhouse kick**. Heavy after a hook or uppercut is a **spinning heel kick**. Heavy
  from neutral is a slow, long-reaching **haymaker**.
* **Ground attacks.** When your opponent is on the mat, press `J` next to them to **stomp** or
  `K` for a **ground kick**, and chain them together. A downed fighter can't block or dodge, and
  getting kicked slows down their get-up. The AI does the same to you, so mash `J`/`K` to get
  up. A ground kick can be the killing blow.
* **Counters.** A perfect block staggers the attacker. Dodging through an attack (with
  i-frames) is a **perfect dodge**. Both open a short window where your next strike is a
  **COUNTER** (×1.5 damage). Interrupting an opponent's wind-up is a **COUNTER HIT** (×1.25).
* **Stamina.** Attacking, blocking hits, dodging, sprinting and the special all cost stamina.
  Below 25% you get slower and weaker. Blocking with an empty tank causes a **GUARD BREAK**.
* **Balance and knockdowns.** Every clean hit chips at a hidden balance meter. Break it with a
  heavy hit, or land the special, for a **knockdown**. There's no referee: the downed fighter
  gets up after a few seconds, and if you're the one down, mash attack to get up faster. There's
  no T.K.O. either. Instead, **every knockdown wears a fighter down** for the rest of the fight:
  −12% damage, −10% movement and dodge speed, −8% attack speed and −15% stamina recovery per
  knockdown, stacking up to three. You can see it in how they move: their guard drops and they
  bounce slower. The HUD marks show how many times each fighter has been dropped.
* **Special meter.** It fills from landed hits, counters, perfect blocks and perfect dodges.
  Once it's full, `E` fires a slow-motion, armored, cinematic finisher that always knocks
  down. It then needs a long recharge.
* **Health.** Death matches last: every fighter, including you, has 1.8× the base health
  (you start with 180).
* **Fight clock.** Each fight has 5:00 on the clock. There are no judges: when time runs out
  the fight goes to **SUDDEN DEATH** and every hit does 75% more damage.

## Game modes

* **FIGHT.** Pick an opponent from the ladder. The select screen shows each opponent's name,
  difficulty, fighting style, health, power, speed, defense and reward. Beat an opponent and
  earn enough reputation to unlock the next one.
* **TOURNAMENT.** *The Pit Invitational* runs all six opponents back to back. One loss
  eliminates you. Winning pays a grand prize and the title.
* **TRAINING.** Practice against a sparring partner that can't be killed. The move list is
  on screen. `1`/`2`/`3` switches the partner between passive, blocking and sparring. `R`
  refills your special meter.
* **UPGRADES.** Spend cash on Conditioning (health), Cardio (stamina), Power, Footwork (speed),
  Recovery and Killer Instinct (special meter). Each has 5 levels.
* **FIGHTER.** Set your name, skin, hair, clothing, gloves, accessories and build, and see your
  record, level and stats.
* **SETTINGS.** Volume (master/music/effects), mouse sensitivity, invert Y, camera shake
  strength, blood on/off, damage numbers, graphics quality and a career reset.

Progress is saved to `localStorage` in your browser.

## The opponents

| Opponent | Style | AI |
| --- | --- | --- |
| THE ROOKIE | Balanced | Easy: aggressive but predictable |
| THE BRAWLER | Slow but powerful | Easy, with heavy hands |
| THE TECHNICIAN | Fast and defensive, blocks and counters | Normal |
| THE GHOST | Evasive counter-striker | Normal, with lots of dodging |
| THE BEAST | Relentless aggression | Hard |
| THE CHAMPION | Complete fighter that adapts to you | Hard |

The AI runs a state machine with the states IDLE, APPROACH, ATTACK, COMBO, DEFEND, DODGE,
RETREAT, COUNTER and RECOVER. Its reaction time, block/dodge/counter chances, combo length and
stamina discipline come from its difficulty level, and each fighter's personality adjusts
aggression, heavy and kick preference, range, evasiveness and special use. Hard opponents also
**read the player**. If you turtle, they go after your guard with heavies. If you spam attacks,
they sit back and counter. If you dodge a lot, they switch to safe jabs. If you're hurt, they
press harder. A small notification tells you when an opponent changes strategy.

## Feedback ("exaggerated impact")

Every hit's **impact level** (1–6) scales its feedback. Higher levels get more hit sparks and
sweat spray, a bigger impact flash sprite and shockwave ring, a hotter impact light, longer
**hit-stop**, stronger trauma-based camera shake and FOV punch, louder layered impact audio and
a bigger crowd reaction. Counters and long combos (5+) bump the level up. The biggest hits play
a short cinematic: hit → slow motion → shake → impact flash and speed lines → reaction → normal
speed. Knockdowns switch to a low-angle orbit camera with slow motion, a dust burst and a crowd
roar. Knockouts add a slow cinematic orbit, a triple bell, phone camera
flashes in the crowd, a final burst of blood and a spreading pool, a **FINISHED** (or **YOU
DIED**) slam, the winner's celebration, and a full stats and rewards screen.

## Project structure

```
index.html            page shell: canvas, HUD and menu markup
styles.css            all UI / HUD styling
src/
  main.js             boot: renderer, scene, screen flow, main loop, test hooks
  game.js             match orchestration: fight flow + turning combat events into feedback
  fighter.js          fighter simulation: state machine, movement, stamina, meter, animation choice
  fighterModel.js     procedural low-poly rig (head, torso, arms, legs, gloves, clothing, hair…)
  poses.js            pose data and blending (flat Float32Arrays, no per-frame allocation)
  attacks.js          move list: timings, damage, reach, combo tree, key poses
  combat.js           hit detection, blocks, perfect blocks/dodges, counters, balance, KD/KO
  ai.js               AI controller (states, difficulty, personality, player reading)
  input.js            keyboard + mouse (pointer lock)
  camera.js           dynamic fight camera, shake, cinematic shots
  effects.js          pooled particles, flashes, rings, impact light, hit-stop/slow-mo, screen FX
  audio.js            synthesized sound bank, crowd, music sequencer (sample-replaceable)
  arena.js            venue: cage, lights, neon, instanced crowd, entrance, waiting area, fog
  ui.js               menus, opponent select, tournament, upgrades, fighter editor, HUD, results
  progression.js      save data, rewards, XP/levels, unlocks
  upgrades.js         upgrade definitions and stat calculation
  config.js           tuning values, difficulty presets, opponent roster
tools/smoke-test.js   end-to-end browser test
```

### Built to be extended

* **Multiplayer-ready input.** Fighters only ever read an *intent*
  (`{ moveX, moveZ, sprint, block, light, heavy, dodge, special, lock }`). The keyboard/mouse
  player, the AI and the test autopilot all produce the same object, so a networked opponent
  only needs to send intents (or a server can run `Fighter` + `Combat` authoritatively). Rules
  live in `fighter.js` and `combat.js` and never touch rendering, audio or DOM. Combat reports
  everything as events that presentation code consumes.
* **More fighters.** Add an entry to `OPPONENTS` in `config.js`. Appearance, stats, AI
  personality and rewards are all data.
* **More moves.** Add an entry to `ATTACKS` in `attacks.js` (timings + two key poses) and link
  it into the combo tree with `next`.
* **Real audio.** Map a sound name to a file in `SOUND_FILES` in `audio.js` and the sample
  replaces the synthesized version.
* **More arenas.** `Arena` is self-contained. Add another class with the same `update()`
  interface.

### Performance

The crowd is 4 instanced meshes. Particles are 3 preallocated pools in a single draw call each.
Flash sprites, rings and the impact light are reused. Only the main spotlight casts shadows.
Geometries are cached and shared between fighters. A fight renders in roughly 250 draw calls
and 55k triangles. The **LOW** graphics setting shrinks the crowd and the shadow map and caps
the pixel ratio at 1.

## Testing

```bash
npm start                                   # in one terminal
NODE_PATH=$(npm root -g) npm run check      # needs Playwright installed globally
```

`tools/smoke-test.js` drives the real game in headless Chromium with real keyboard and mouse
input. It covers the menus, the opponent select screen, movement and sprint, the light chain,
heavies and kicks, blocking, perfect blocks, perfect dodges, counters, the special, knockdown
and recovery, blood and the death-match rules (no T.K.O., sudden death, the Blood setting), scaled health,
stomps and ground kicks (including the AI kicking a downed player and a ground-kick kill),
the killing blow and results, rewards and unlocks, upgrades, defeat, pause, training,
the tournament, and the fighter and settings screens. It also runs an AI-vs-AI soak against
every opponent and checks that every AI state gets used. Screenshots go to
`tools/screenshots/`.
