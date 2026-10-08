// Keyboard + mouse input. Raw device state is turned into a fighter intent in game.js using the
// camera orientation, so the same intent format works for AI and (later) network players.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseL = false;
    this.mouseR = false;
    this.clickL = false;
    this.clickR = false;
    this.enabled = false; // gameplay input (menus handle their own DOM events)
    this.pointerLocked = false;
    this.onPointerLockLost = null;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.enabled && ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseL = this.mouseR = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) {
        this.mouseL = true;
        this.clickL = true;
      } else if (e.button === 2) {
        this.mouseR = true;
        this.clickR = true;
      }
      if (!this.pointerLocked) this.lockPointer();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseL = false;
      if (e.button === 2) this.mouseR = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.pointerLocked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      } else if (e.buttons & 4) {
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
    this.clickL = this.clickR = false;
    this.mouseDX = this.mouseDY = 0;
  }
}
