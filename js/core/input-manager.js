/**
 * Centralized input handling for keyboard, pointer (mouse+touch), and wheel events.
 */
import { bus } from './event-bus.js';
import { store } from './state-store.js';
import { effects } from './effects.js';

export class InputManager {
    constructor(scopeElement) {
        this.keysHeld = new Set();
        this.scopeElement = scopeElement;
        this._mouseDown = false;
        this._mouseDragStart = null;
        this._scopeAzStart = 0;
        this._scopeElStart = 0;

        // Touch/pointer state
        this._activePointers = new Map();
        this._pinchStartDist = null;
        this._pinchStartZoom = 1;
        this._longPressTimer = null;

        this._bindEvents();
    }

    _bindEvents() {
        document.addEventListener('keydown', e => this._onKeyDown(e));
        document.addEventListener('keyup', e => this._onKeyUp(e));

        if (this.scopeElement) {
            this.scopeElement.addEventListener('wheel', e => this._onWheel(e), { passive: false });
            this.scopeElement.addEventListener('pointerdown', e => this._onPointerDown(e));
            document.addEventListener('pointermove', e => this._onPointerMove(e));
            document.addEventListener('pointerup', e => this._onPointerUp(e));
            document.addEventListener('pointercancel', e => this._onPointerUp(e));
            this.scopeElement.addEventListener('contextmenu', e => e.preventDefault());
            // Prevent default touch behaviors (scroll, zoom) on scope
            this.scopeElement.style.touchAction = 'none';
        }
    }

    _onKeyDown(e) {
        // Onboarding intercept — any key advances or dismisses
        if (effects.onboarding.active) {
            e.preventDefault();
            effects.onboarding.nextStep();
            return;
        }

        // Replay mode intercept
        if (effects.replay.active) {
            e.preventDefault();
            // Hide post-flight overlay on any replay interaction
            if (effects.postFlight.visible) effects.postFlight.hide();
            const fast = e.shiftKey;
            switch (e.key) {
                case 'ArrowLeft': effects.replay.stepBackward(fast ? 10 : 1); return;
                case 'ArrowRight': effects.replay.stepForward(fast ? 10 : 1); return;
                case ' ': effects.replay.togglePlay(); return;
                case 'Escape': effects.replay.exit(); return;
                case 'r': case 'R':
                    effects.replay.exit();
                    bus.emit('sim:reset');
                    bus.emit('ui:keyaction', { label: 'RESET' });
                    return;
                case 'a': case 'A':
                    effects.replay.exit();
                    bus.emit('weapon:toggle-arm');
                    bus.emit('ui:keyaction', { label: 'ARMED' });
                    return;
            }
            return;
        }

        // Continuous aim keys
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            this.keysHeld.add(e.key);
            e.preventDefault();
            return;
        }

        this.keysHeld.add(e.key);

        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                bus.emit('weapon:fire');
                bus.emit('ui:keyaction', { label: 'FIRE' });
                break;
            case 'a':
                bus.emit('weapon:toggle-arm');
                bus.emit('ui:keyaction', { label: store.isArmed ? 'DISARMED' : 'ARMED' });
                break;
            case 'r':
                bus.emit('sim:reset');
                bus.emit('ui:keyaction', { label: 'RESET' });
                break;
            case 'z':
                bus.emit('ui:cycle-zone', { direction: e.shiftKey ? -1 : 1 });
                break;
            case 'p':
                store.set('paused', !store.paused);
                bus.emit('ui:keyaction', { label: store.paused ? 'PAUSED' : 'RESUMED' });
                break;
            case 'f':
                this._toggleFocusMode();
                bus.emit('ui:keyaction', { label: 'FOCUS' });
                break;
            case 'h':
                if (effects.onboarding.active) effects.onboarding.hide();
                else effects.onboarding.show();
                break;
            case 't':
                bus.emit('ui:toggle-trajectory');
                bus.emit('ui:keyaction', { label: 'TRAJECTORY' });
                break;
        }

        // Number keys 1-9 for target selection
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
            bus.emit('target:select-index', { index: num - 1 });
        }
    }

    _onKeyUp(e) {
        this.keysHeld.delete(e.key);
        this.keysHeld.delete(e.key.toLowerCase());
    }

    _onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        // Multiplicative zoom for natural feel at all levels
        const factor = delta > 0 ? 1.15 : 1 / 1.15;
        const zoom = Math.max(0.5, Math.min(8, store.scopeZoom * factor));
        store.set('scopeZoom', zoom);
    }

    // ─── Pointer Events (unified mouse + touch) ─────────────────────────

    _onPointerDown(e) {
        if (e.button === 0 && effects.onboarding.active) {
            effects.onboarding.nextStep();
            return;
        }

        this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Cancel kill cam on any pointer interaction
        if (effects.killCam.active) effects.killCam.cancel();

        // Capture pointer for reliable drag tracking
        try { this.scopeElement.setPointerCapture(e.pointerId); } catch {}

        if (this._activePointers.size === 1 && e.pointerType === 'touch') {
            // Long-press to arm (600ms)
            this._longPressTimer = setTimeout(() => {
                this._longPressTimer = null;
                bus.emit('weapon:toggle-arm');
                bus.emit('ui:keyaction', { label: store.isArmed ? 'DISARMED' : 'ARMED' });
            }, 600);
        }

        if (this._activePointers.size === 2) {
            // Pinch start
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
            const pts = [...this._activePointers.values()];
            this._pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            this._pinchStartZoom = store.scopeZoom;
            this._mouseDown = false;
        } else if (this._activePointers.size === 1 && (e.button === 0 || e.pointerType === 'touch')) {
            // Exit replay/post-flight on drag
            if (effects.replay.active) effects.replay.exit();
            if (effects.postFlight.visible) effects.postFlight.hide();
            this._mouseDown = true;
            this._mouseDragStart = { x: e.clientX, y: e.clientY };
            this._scopeAzStart = store.scopeAzimuth;
            this._scopeElStart = store.scopeElevation;
        }
    }

    _onPointerMove(e) {
        if (!this._activePointers.has(e.pointerId)) return;
        this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this._activePointers.size === 2) {
            // Pinch zoom
            const pts = [...this._activePointers.values()];
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            if (this._pinchStartDist && this._pinchStartDist > 0) {
                const scale = dist / this._pinchStartDist;
                const zoom = Math.max(0.5, Math.min(8, this._pinchStartZoom * scale));
                store.set('scopeZoom', zoom);
            }
            return;
        }

        if (!this._mouseDown || !this._mouseDragStart) return;
        const dx = e.clientX - this._mouseDragStart.x;
        const dy = e.clientY - this._mouseDragStart.y;

        // Cancel long-press if dragged
        if (Math.hypot(dx, dy) > 8 && this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }

        const zoom = store.scopeZoom || 1;
        const sensitivity = 0.0005 / zoom;
        store.batch(() => {
            store.set('scopeAzimuth', this._scopeAzStart + dx * sensitivity);
            store.set('scopeElevation', this._scopeElStart - dy * sensitivity);
        });
    }

    _onPointerUp(e) {
        const wasSingleTouch = this._activePointers.size === 1;
        const startPos = this._mouseDragStart;
        clearTimeout(this._longPressTimer);
        this._longPressTimer = null;
        this._activePointers.delete(e.pointerId);

        if (this._activePointers.size < 2) {
            this._pinchStartDist = null;
        }
        if (this._activePointers.size === 0) {
            // Tap-to-fire: short tap with no drag when armed (touch only)
            if (wasSingleTouch && e.pointerType === 'touch' && startPos) {
                const dx = e.clientX - startPos.x;
                const dy = e.clientY - startPos.y;
                if (Math.hypot(dx, dy) < 8 && store.isArmed) {
                    bus.emit('weapon:fire');
                    bus.emit('ui:keyaction', { label: 'FIRE' });
                }
            }
            this._mouseDown = false;
            this._mouseDragStart = null;
        }
    }

    _toggleFocusMode() {
        const current = store.uiMode;
        store.set('uiMode', current === 'focused' ? 'dashboard' : 'focused');
    }

    /**
     * Process held keys for continuous aiming. Call from RAF loop.
     */
    updateContinuousInput() {
        const fast = this.keysHeld.has('Shift');
        // Scale sensitivity inversely with zoom (higher zoom = finer control)
        const zoom = store.scopeZoom || 1;
        const baseStep = fast ? 0.005 : 0.001;
        const step = baseStep / zoom;
        let changed = false;
        let az = store.scopeAzimuth;
        let el = store.scopeElevation;

        if (this.keysHeld.has('ArrowLeft')) { az -= step; changed = true; }
        if (this.keysHeld.has('ArrowRight')) { az += step; changed = true; }
        if (this.keysHeld.has('ArrowUp')) { el += step; changed = true; }
        if (this.keysHeld.has('ArrowDown')) { el -= step; changed = true; }

        if (changed) {
            store.batch(() => {
                store.set('scopeAzimuth', az);
                store.set('scopeElevation', el);
            });
        }
    }
}
