import * as THREE from 'three';

const TAP_MAX_MOVE = 8; // px
const TAP_MAX_TIME = 350; // ms

/**
 * Mouse / touch / pen (Pointer Events): drag bodies, fling them, tap the water.
 * Works the same on desktop, phones and touch TVs. D-pad TVs can use the API
 * (world.disturb / body.push) from their key handlers instead.
 */
export class PointerInteraction {
  constructor(world, { holdHeight = 0.12, tapRipples = true } = {}) {
    this.world = world;
    this.element = world.renderer.domElement;
    this.holdHeight = holdHeight;
    this.tapRipples = tapRipples;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();
    this.active = null; // { body, pointerId }
    this.down = null;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);

    // Capture phase so we can disable OrbitControls before it reacts.
    this.element.addEventListener('pointerdown', this._onDown, true);
    this.element.addEventListener('pointermove', this._onMove);
    this.element.addEventListener('pointerup', this._onUp);
    this.element.addEventListener('pointercancel', this._onUp);
    this.element.style.touchAction = 'none';
  }

  _setPointer(event) {
    const rect = this.element.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.world.camera);
  }

  _planeHit(y) {
    this.plane.constant = -y;
    return this.raycaster.ray.intersectPlane(this.plane, this.hit);
  }

  _onDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    this._setPointer(event);

    const draggable = this.world.bodies.filter((b) => b.draggable);
    const hits = this.raycaster.intersectObjects(draggable.map((b) => b.object), true);
    if (hits.length) {
      const body = draggable.find((b) => {
        let o = hits[0].object;
        while (o) {
          if (o === b.object) return true;
          o = o.parent;
        }
        return false;
      });
      if (body) {
        event.stopImmediatePropagation();
        if (this.world.controls) this.world.controls.enabled = false;
        this.element.setPointerCapture?.(event.pointerId);
        this.active = { body, pointerId: event.pointerId, y: this.world.waterLevel + body.halfExtents.y + this.holdHeight };
        this._updateHold();
        this.world._emit('grab', body);
        return;
      }
    }

    this.down = { x: event.clientX, y: event.clientY, t: performance.now(), id: event.pointerId };
  }

  _updateHold() {
    const { body, y } = this.active;
    if (!this._planeHit(y)) return;
    const limit = this.world.size * 0.5 - body.radius;
    this.hit.x = THREE.MathUtils.clamp(this.hit.x, -limit, limit);
    this.hit.z = THREE.MathUtils.clamp(this.hit.z, -limit, limit);
    body.hold(this.hit);
  }

  _onMove(event) {
    if (!this.active || event.pointerId !== this.active.pointerId) return;
    this._setPointer(event);
    this._updateHold();
  }

  _onUp(event) {
    if (this.active && event.pointerId === this.active.pointerId) {
      this.active.body.release();
      this.world._emit('release', this.active.body);
      this.element.releasePointerCapture?.(event.pointerId);
      this.active = null;
      if (this.world.controls) this.world.controls.enabled = true;
      return;
    }

    const down = this.down;
    this.down = null;
    if (!this.tapRipples || !down || down.id !== event.pointerId || event.type === 'pointercancel') return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (moved > TAP_MAX_MOVE || performance.now() - down.t > TAP_MAX_TIME) return;

    this._setPointer(event);
    if (!this._planeHit(this.world.waterLevel)) return;
    const half = this.world.size * 0.5;
    if (Math.abs(this.hit.x) > half || Math.abs(this.hit.z) > half) return;
    this.world.disturb(this.hit.x, this.hit.z, 0.05, -0.02);
    this.world.splash(this.hit.x, this.world.waterLevel, this.hit.z, { count: 14, speed: 0.4, radius: 0.015 });
    this.world._emit('tap', { x: this.hit.x, z: this.hit.z });
  }

  dispose() {
    this.element.removeEventListener('pointerdown', this._onDown, true);
    this.element.removeEventListener('pointermove', this._onMove);
    this.element.removeEventListener('pointerup', this._onUp);
    this.element.removeEventListener('pointercancel', this._onUp);
  }
}
