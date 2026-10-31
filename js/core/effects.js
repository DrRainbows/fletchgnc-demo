/**
 * Visual effects system - impact flash, screen shake, particle system.
 * Lightweight and non-intrusive: effects are overlaid on panels.
 */
// Convert hex color + alpha to rgba string
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Screen Shake ────────────────────────────────────────────────────────────

class ScreenShake {
    constructor() {
        this._intensity = 0;
        this._decay = 0.92;
        this._offsetX = 0;
        this._offsetY = 0;
        this._targets = [];
    }

    /**
     * Register a DOM element to receive shake transforms.
     */
    register(el) {
        this._targets.push(el);
    }

    trigger(intensity = 6) {
        this._intensity = intensity;
    }

    update() {
        if (this._intensity < 0.2) {
            if (this._offsetX !== 0 || this._offsetY !== 0) {
                this._offsetX = 0;
                this._offsetY = 0;
                for (const el of this._targets) {
                    el.style.transform = '';
                }
            }
            return;
        }

        this._offsetX = (Math.random() - 0.5) * this._intensity * 2;
        this._offsetY = (Math.random() - 0.5) * this._intensity * 2;
        this._intensity *= this._decay;

        for (const el of this._targets) {
            el.style.transform = `translate(${this._offsetX.toFixed(1)}px, ${this._offsetY.toFixed(1)}px)`;
        }
    }

    get active() {
        return this._intensity >= 0.2;
    }
}

// ─── Impact Flash ────────────────────────────────────────────────────────────

class ImpactFlash {
    constructor() {
        this._overlay = document.createElement('div');
        this._overlay.style.cssText = `
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 1000;
            opacity: 0;
            transition: opacity 80ms ease-out;
        `;
        document.body.appendChild(this._overlay);
        this._timeout = null;
    }

    trigger(isHit) {
        const color = isHit
            ? 'radial-gradient(ellipse at center, rgba(255,200,48,0.3) 0%, rgba(255,80,30,0.15) 40%, transparent 70%)'
            : 'radial-gradient(ellipse at center, rgba(255,48,64,0.2) 0%, rgba(255,48,64,0.05) 40%, transparent 70%)';

        this._overlay.style.background = color;
        this._overlay.style.opacity = '1';

        if (this._timeout) clearTimeout(this._timeout);
        this._timeout = setTimeout(() => {
            this._overlay.style.opacity = '0';
        }, isHit ? 120 : 80);
    }
}

// ─── Fire Flash (scope white-out on fire) ────────────────────────────────────

class FireFlash {
    constructor() {
        this._alpha = 0;
        this._decay = 0.88;
    }

    trigger() {
        this._alpha = 0.45;
    }

    update() {
        if (this._alpha > 0.01) {
            this._alpha *= this._decay;
        } else {
            this._alpha = 0;
        }
    }

    draw(ctx, w, h) {
        if (this._alpha < 0.01) return;
        const cx = w / 2;
        const cy = h * 0.7;
        const r = Math.max(w, h) * 0.8;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(255, 250, 230, ${this._alpha.toFixed(3)})`);
        grad.addColorStop(0.3, `rgba(255, 200, 100, ${(this._alpha * 0.6).toFixed(3)})`);
        grad.addColorStop(0.7, `rgba(255, 140, 40, ${(this._alpha * 0.2).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255, 100, 20, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }

    get active() {
        return this._alpha > 0.01;
    }
}

// ─── Pause Overlay ──────────────────────────────────────────────────────────

class PauseOverlay {
    constructor() {
        this._el = document.getElementById('pause-overlay');
    }

    show() {
        if (this._el) this._el.classList.add('visible');
    }

    hide() {
        if (this._el) this._el.classList.remove('visible');
    }
}

// ─── Post-Flight Stats ──────────────────────────────────────────────────────

class PostFlightOverlay {
    constructor() {
        this._visible = false;
        this._stats = null;
        this._alpha = 0;
        this._fadeIn = false;
    }

    show(stats) {
        this._stats = stats;
        this._visible = true;
        this._alpha = 0;
        this._fadeIn = true;
    }

    hide() {
        this._visible = false;
        this._alpha = 0;
        this._fadeIn = false;
        this._stats = null;
    }

    update() {
        if (this._fadeIn && this._alpha < 1) {
            this._alpha = Math.min(1, this._alpha + 0.04);
        }
    }

    /**
     * Draw the post-flight analysis overlay onto a canvas context.
     */
    draw(ctx, w, h) {
        if (!this._visible || !this._stats || this._alpha < 0.01) return;

        const s = this._stats;
        const a = this._alpha;
        const cx = w / 2;
        const font = "'JetBrains Mono', monospace";

        // Semi-transparent backdrop
        ctx.fillStyle = `rgba(6, 10, 16, ${0.75 * a})`;
        ctx.fillRect(0, 0, w, h);

        // Title bar
        const isHit = s.hit;
        const titleColor = isHit ? '#30e060' : '#ff3040';
        const titleText = isHit ? `HIT - ${s.zone}` : 'MISS';

        ctx.fillStyle = hexToRgba(titleColor, a);
        ctx.font = `bold 22px ${font}`;
        ctx.textAlign = 'center';
        ctx.fillText(titleText, cx, h * 0.22);

        // Sub-title
        ctx.fillStyle = `rgba(192, 212, 232, ${0.7 * a})`;
        ctx.font = `12px ${font}`;
        ctx.fillText(`BOLT #${s.boltNumber}  |  ${s.targetType}  @  ${s.range}m`, cx, h * 0.22 + 22);

        // Stats grid
        const statY = h * 0.36;
        const lineH = 18;
        const col1x = cx - 80;
        const col2x = cx + 20;
        ctx.textAlign = 'left';

        const statRow = (label, value, color, yOff) => {
            ctx.fillStyle = `rgba(90, 112, 144, ${a})`;
            ctx.font = `10px ${font}`;
            ctx.fillText(label, col1x, statY + yOff);
            ctx.fillStyle = hexToRgba(color, a);
            ctx.font = `11px ${font}`;
            ctx.fillText(value, col2x, statY + yOff);
        };

        let row = 0;
        statRow('MISS DIST', `${s.missDistance.toFixed(3)}m`, isHit ? '#30e060' : '#ff3040', row++ * lineH);
        statRow('FLIGHT TIME', `${s.flightTime.toFixed(3)}s`, '#00d4ff', row++ * lineH);
        statRow('IMPACT SPD', `${s.impactSpeed.toFixed(1)} m/s`, '#c0d4e8', row++ * lineH);
        statRow('MAX AoA', `${s.maxAoA.toFixed(2)}\u00B0`, '#ffc830', row++ * lineH);
        statRow('MAX FIN \u03B4', `${s.maxFinDefl.toFixed(2)}\u00B0`, '#ff8040', row++ * lineH);
        statRow('TERMINAL G', `${s.maxAccelG.toFixed(1)}g`, '#e040e0', row++ * lineH);

        // Separator
        row++;
        statRow('SESSION', `${s.hits}/${s.shotsFired} (${s.hitRate}%)`, '#c0d4e8', row++ * lineH);

        // Prompt
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(58, 80, 112, ${0.5 + 0.3 * Math.sin(performance.now() * 0.003) * a})`;
        ctx.font = `10px ${font}`;
        ctx.fillText('\u2190\u2192: Replay  |  SPACE: Play  |  R: Reset  |  A: Re-arm', cx, h - 20);
    }

    get visible() {
        return this._visible;
    }
}

// ─── Onboarding Overlay ─────────────────────────────────────────────────────

class OnboardingOverlay {
    constructor() {
        this.active = false;
        this.step = 0;
        this.steps = [
            { title: 'SELECT TARGET', body: 'Press 1\u20139 to pick a target\nOr aim crosshair \u2014 auto-selects nearest\nScroll to zoom scope (0.5\u20138x)' },
            { title: 'AIM & ZONE', body: 'Arrow keys or click-drag to aim\nShift+arrows for fast slew\nZ to cycle hit zone (heart, lungs, head\u2026)' },
            { title: 'ARM & FIRE', body: 'A to arm guidance computer\nSPACE to fire the bolt\nPredicted trajectory shown when armed' },
            { title: 'OBSERVE & REPLAY', body: 'Flight auto-enters replay on impact\nArrow keys / buttons to scrub frames\nSPACE to play, ESC to exit replay' },
            { title: 'MORE CONTROLS', body: 'T: Toggle 3D trajectory overlay\nF: Focus mode (scope + telemetry)\nP: Pause | R: Reset | H: This help' },
        ];
        this._fadeAlpha = 0;
    }

    show() {
        this.active = true;
        this.step = 0;
        this._fadeAlpha = 0;
    }

    hide() {
        this.active = false;
        this._fadeAlpha = 0;
    }

    nextStep() {
        this.step++;
        if (this.step >= this.steps.length) {
            this.hide();
            try { localStorage.setItem('fletchgnc-onboarded', '1'); } catch {}
            return false;
        }
        return true;
    }

    update() {
        if (this.active && this._fadeAlpha < 1) {
            this._fadeAlpha = Math.min(1, this._fadeAlpha + 0.06);
        }
    }

    draw(ctx, w, h) {
        if (!this.active || this._fadeAlpha < 0.01) return;

        const a = this._fadeAlpha;
        const cx = w / 2, cy = h / 2;
        const font = "'JetBrains Mono', monospace";

        // Dark overlay
        ctx.fillStyle = `rgba(4, 8, 14, ${0.82 * a})`;
        ctx.fillRect(0, 0, w, h);

        // Card
        const cardW = Math.min(300, w * 0.8);
        const cardH = 170;
        const cardX = cx - cardW / 2;
        const cardY = cy - cardH / 2 - 10;

        ctx.fillStyle = `rgba(10, 16, 24, ${0.95 * a})`;
        ctx.fillRect(cardX, cardY, cardW, cardH);
        ctx.strokeStyle = `rgba(0, 212, 255, ${0.35 * a})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(cardX, cardY, cardW, cardH);

        // Step counter
        ctx.fillStyle = `rgba(90, 112, 144, ${0.6 * a})`;
        ctx.font = `9px ${font}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${this.step + 1}/${this.steps.length}`, cardX + cardW - 8, cardY + 16);

        const s = this.steps[this.step];

        // Title
        ctx.fillStyle = `rgba(0, 212, 255, ${a})`;
        ctx.font = `bold 16px ${font}`;
        ctx.textAlign = 'center';
        ctx.fillText(s.title, cx, cardY + 40);

        // Body (multi-line)
        ctx.fillStyle = `rgba(192, 212, 232, ${0.85 * a})`;
        ctx.font = `12px ${font}`;
        const lines = s.body.split('\n');
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], cx, cardY + 68 + i * 18);
        }

        // Navigation dots
        const dotY = cardY + cardH - 20;
        for (let i = 0; i < this.steps.length; i++) {
            ctx.fillStyle = i === this.step
                ? `rgba(0, 212, 255, ${a})`
                : `rgba(58, 80, 112, ${0.4 * a})`;
            ctx.beginPath();
            const dotX = cx + (i - (this.steps.length - 1) / 2) * 14;
            ctx.arc(dotX, dotY, i === this.step ? 4 : 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Continue hint
        const pulse = 0.4 + 0.3 * Math.sin(performance.now() * 0.004);
        ctx.fillStyle = `rgba(58, 80, 112, ${pulse * a})`;
        ctx.font = `9px ${font}`;
        ctx.fillText('Click or press any key to continue', cx, cardY + cardH + 20);
    }
}

// ─── Replay Controller ──────────────────────────────────────────────────────

import { store } from './state-store.js';
import { bus } from './event-bus.js';

class ReplayController {
    constructor() {
        this.active = false;
        this.playing = false;
        this.playbackSpeed = 1;
        this.scrubIndex = 0;
        this._barEl = null;
        this._progressEl = null;
        this._cursorEl = null;
        this._timeEl = null;
    }

    init() {
        this._barEl = document.getElementById('replay-bar');
        this._progressEl = this._barEl?.querySelector('.replay-progress');
        this._cursorEl = this._barEl?.querySelector('.replay-cursor');
        this._timeEl = this._barEl?.querySelector('.replay-time');

        // Click on timeline to scrub
        const timeline = this._barEl?.querySelector('.replay-timeline');
        if (timeline) {
            timeline.addEventListener('mousedown', e => {
                if (!this.active) return;
                this._scrubFromMouse(e, timeline);
            });
            timeline.addEventListener('mousemove', e => {
                if (!this.active || !(e.buttons & 1)) return;
                this._scrubFromMouse(e, timeline);
            });
        }

        // Button controls
        this._playPauseBtn = document.getElementById('replay-play-pause');
        const stepBackBtn = document.getElementById('replay-step-back');
        const stepFwdBtn = document.getElementById('replay-step-fwd');
        const exitBtn = document.getElementById('replay-exit');

        if (this._playPauseBtn) this._playPauseBtn.addEventListener('click', () => this.togglePlay());
        if (stepBackBtn) stepBackBtn.addEventListener('click', () => this.stepBackward(5));
        if (stepFwdBtn) stepFwdBtn.addEventListener('click', () => this.stepForward(5));
        if (exitBtn) exitBtn.addEventListener('click', () => this.exit());

        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) exportBtn.addEventListener('click', () => bus.emit('flight:export'));
    }

    _scrubFromMouse(e, timeline) {
        const rect = timeline.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.scrubToNormalized(t);
    }

    enter() {
        const traj = store.trajectory;
        if (!traj || traj.length < 2) return;
        if (this.active) return; // already in replay
        this.active = true;
        this.playing = false;
        this.scrubIndex = traj.length - 1;
        this._pushFrame();
        store.set('replayActive', true);
        if (this._barEl) this._barEl.classList.remove('hidden');
    }

    exit() {
        this.active = false;
        this.playing = false;
        store.batch(() => {
            store.set('replayActive', false);
            store.set('replayFrame', null);
            store.set('replayIndex', 0);
        });
        if (this._barEl) this._barEl.classList.add('hidden');
    }

    scrubTo(index) {
        const traj = store.trajectory;
        if (!traj || traj.length === 0) return;
        this.scrubIndex = Math.max(0, Math.min(traj.length - 1, index));
        this._pushFrame();
    }

    scrubToNormalized(t) {
        const traj = store.trajectory;
        if (!traj || traj.length === 0) return;
        this.scrubTo(Math.round(t * (traj.length - 1)));
    }

    stepForward(n = 1) {
        this.playing = false;
        this.scrubTo(this.scrubIndex + n);
    }

    stepBackward(n = 1) {
        this.playing = false;
        this.scrubTo(this.scrubIndex - n);
    }

    togglePlay() {
        this.playing = !this.playing;
        if (this.playing && this.scrubIndex >= store.trajectory.length - 1) {
            this.scrubIndex = 0;
        }
        if (this._playPauseBtn) {
            this._playPauseBtn.innerHTML = this.playing ? '&#9646;&#9646;' : '&#9654;';
        }
    }

    update(dt) {
        if (!this.active) return;

        if (this.playing) {
            const traj = store.trajectory;
            if (!traj || traj.length < 2) return;

            const frameDuration = traj[1].time - traj[0].time;
            // Impact slow-mo: taper to 0.25x in last 5 frames
            const framesFromEnd = (traj.length - 1) - this.scrubIndex;
            const SLOMO_FRAMES = 5;
            let effectiveSpeed = this.playbackSpeed;
            if (framesFromEnd <= SLOMO_FRAMES && framesFromEnd >= 0) {
                const t = framesFromEnd / SLOMO_FRAMES;
                effectiveSpeed = this.playbackSpeed * (0.25 + 0.75 * t);
            }
            const step = (dt * effectiveSpeed) / frameDuration;
            this.scrubIndex += step;

            if (this.scrubIndex >= traj.length - 1) {
                this.scrubIndex = traj.length - 1;
                this.playing = false;
            }
            this._pushFrame();
        }

        this._updateBar();
    }

    _pushFrame() {
        const traj = store.trajectory;
        if (!traj || traj.length === 0) return;
        const idx = Math.round(this.scrubIndex);
        const frame = traj[Math.min(idx, traj.length - 1)];
        store.batch(() => {
            store.set('replayIndex', idx);
            store.set('replayFrame', frame);
        });
    }

    _updateBar() {
        const traj = store.trajectory;
        if (!traj || traj.length === 0 || !this._barEl) return;

        const t = this.scrubIndex / (traj.length - 1);
        if (this._progressEl) this._progressEl.style.width = `${(t * 100).toFixed(1)}%`;
        if (this._cursorEl) this._cursorEl.style.left = `${(t * 100).toFixed(1)}%`;

        const frame = traj[Math.min(Math.round(this.scrubIndex), traj.length - 1)];
        if (this._timeEl && frame) {
            this._timeEl.textContent = `${frame.time.toFixed(3)}s`;
        }
    }

    get currentFrame() {
        const traj = store.trajectory;
        if (!traj || traj.length === 0) return null;
        return traj[Math.min(Math.round(this.scrubIndex), traj.length - 1)];
    }
}

// ─── Kill Cam ──────────────────────────────────────────────────────────────

class KillCam {
    constructor() {
        this._active = false;
        this._timer = 0;
        this._duration = 0.5;
        this._savedZoom = 1;
        this._savedAz = 0;
        this._savedEl = 0;
    }

    trigger(impactPos, scopePos) {
        if (!impactPos || !scopePos) return;
        this._savedZoom = store.scopeZoom;
        this._savedAz = store.scopeAzimuth;
        this._savedEl = store.scopeElevation;

        const dx = impactPos[0] - scopePos[0];
        const dy = impactPos[1] - scopePos[1];
        const dz = impactPos[2] - scopePos[2];
        const horiz = Math.sqrt(dx * dx + dy * dy);
        const az = Math.atan2(dy, dx);
        const el = Math.atan2(dz, horiz);

        store.batch(() => {
            store.set('scopeAzimuth', az);
            store.set('scopeElevation', el);
            store.set('scopeZoom', 6.0);
        });

        this._active = true;
        this._timer = this._duration;
    }

    update(dt) {
        if (!this._active) return;
        this._timer -= dt;
        if (this._timer <= 0) {
            this._restore();
        }
    }

    cancel() {
        if (this._active) this._restore();
    }

    _restore() {
        this._active = false;
        store.batch(() => {
            store.set('scopeZoom', this._savedZoom);
            store.set('scopeAzimuth', this._savedAz);
            store.set('scopeElevation', this._savedEl);
        });
    }

    get active() { return this._active; }
}

// ─── Export Singleton Effects Manager ────────────────────────────────────────

class EffectsManager {
    constructor() {
        this.shake = new ScreenShake();
        this.impactFlash = new ImpactFlash();
        this.fireFlash = new FireFlash();
        this.postFlight = new PostFlightOverlay();
        this.pause = new PauseOverlay();
        this.onboarding = new OnboardingOverlay();
        this.replay = new ReplayController();
        this.killCam = new KillCam();
    }

    update(dt) {
        this.shake.update();
        this.fireFlash.update();
        this.postFlight.update();
        this.onboarding.update();
        this.replay.update(dt || 0.016);
        this.killCam.update(dt || 0.016);
    }

    get needsRender() {
        return this.shake.active || this.fireFlash.active || this.postFlight.visible
            || this.onboarding.active || this.replay.active || this.killCam.active;
    }
}

export const effects = new EffectsManager();
