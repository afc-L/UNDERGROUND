// Keyboard + mouse input. Fighting is keyboard-only; the mouse only controls the camera.
// Raw device state is turned into a fighter intent in game.js using the camera orientation,
// so the same intent format works for AI and (later) network players.

const GAME_KEYS = ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.enabled = false; // gameplay input (menus handle their own DOM events)
    this.pointerLocked = false;
    this.onPointerLockLost = null;

    window.addEventListener('keydown', (e) => {
      if (this.enabled && GAME_KEYS.includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      // keys aimed at a menu control (button, card, text field) are not gameplay presses
      const t = e.target;
      if (t && t !== document.body && t.closest && t.closest('.screen, input, select, button')) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    // Clicking the game captures the mouse for the camera (mouse buttons never attack)
    canvas.addEventListener('mousedown', () => {
      if (this.enabled && !this.pointerLocked) this.lockPointer();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.pointerLocked || e.buttons & 4) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === canvas;
      if (was && !this.pointerLocked && this.onPointerLockLost) this.onPointerLockLost();
    });
  }

  lockPointer() {
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* pointer lock is optional */
    }
  }

  unlockPointer() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  /** Call once at the end of every frame. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
  }
}
