/**
 * Scope Panel - compositor for scope rendering layers.
 */
import { UIPanel } from '../core/ui-panel.js';
import { store } from '../core/state-store.js';
import { bus } from '../core/event-bus.js';
import {
    drawMilDotReticle,
    drawScopeBackground,
    drawScopeMask,
    drawScopeVignette,
} from './scope/background-layer.js';
import { drawHUD, drawReplayHUD } from './scope/hud-layer.js';
import { drawOnboardPiP, drawScopeOverlays } from './scope/overlay-layer.js';
import { ZONES } from './scope/shared.js';
import { drawTargets } from './scope/target-layer.js';
import {
    drawBoltTrail,
    drawPredictedTrajectory,
    drawReplayTrail,
} from './scope/trajectory-layer.js';

export class ScopePanel extends UIPanel {
    constructor() {
        super('panel-scope', { title: 'SCOPE' });
        this.fovH = 0.1396;
        this.fovV = 0.1047;

        this._bgCanvas = document.createElement('canvas');
        this._bgCtx = this._bgCanvas.getContext('2d');
        this._bgDirty = true;

        bus.on('ui:cycle-zone', ({ direction }) => {
            let index = ZONES.indexOf(store.selectedZone);
            index = (index + direction + ZONES.length) % ZONES.length;
            store.set('selectedZone', ZONES[index]);
            this.invalidate();
        });

        for (const property of [
            'scopeAzimuth',
            'scopeElevation',
            'scopeZoom',
            'isArmed',
            'inFlight',
            'selectedTarget',
        ]) {
            store.on(property, () => this.invalidate());
        }
    }

    onResize(w, h) {
        super.onResize(w, h);
        this._bgCanvas.width = Math.ceil(w * 1.6);
        this._bgCanvas.height = Math.ceil(h * 1.6);
        this._bgDirty = true;
    }

    render(ctx, w, h) {
        if (this._bgDirty) {
            drawScopeBackground(this._bgCtx);
            this._bgDirty = false;
        }

        const bgW = this._bgCanvas.width;
        const bgH = this._bgCanvas.height;
        const baseX = -(bgW - w) / 2;
        const baseY = -(bgH - h) / 2;
        const bgOffsetX = baseX - (store.scopeAzimuth / this.fovH) * w * 0.3;
        const bgOffsetY = baseY + (store.scopeElevation / this.fovV) * h * 0.3;
        ctx.drawImage(this._bgCanvas, bgOffsetX, bgOffsetY);

        const zoom = store.scopeZoom;
        const effFovH = this.fovH / zoom;
        const effFovV = this.fovV / zoom;
        const scopeDirection = this._getScopeDirection();
        const scopePosition = store.scopePosition;
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(w, h) * 0.46;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.clip();

        drawTargets(ctx, w, h, scopeDirection, scopePosition, effFovH, effFovV, cx, cy);

        if (store.isArmed && !store.inFlight) {
            drawPredictedTrajectory(ctx, w, h, scopeDirection, scopePosition, effFovH, effFovV);
        }

        if (store.inFlight && store.trajectory.length > 1) {
            drawBoltTrail(ctx, w, h, scopeDirection, scopePosition, effFovH, effFovV);
        }

        if (store.replayActive && store.trajectory.length > 1) {
            drawReplayTrail(ctx, w, h, scopeDirection, scopePosition, effFovH, effFovV);
        }

        ctx.restore();

        drawScopeMask(ctx, w, h, cx, cy, radius);
        drawScopeVignette(ctx, cx, cy, radius);
        drawMilDotReticle(ctx, cx, cy, radius, store.isArmed);
        drawHUD(ctx, w, h, cx, cy);

        if (store.inFlight && store.boltState && store.trajectory.length > 5) {
            drawOnboardPiP(ctx, w, h);
        } else if (store.replayActive && store.replayFrame) {
            drawOnboardPiP(ctx, w, h, store.replayFrame);
        }

        if (store.replayActive && store.replayFrame) {
            drawReplayHUD(ctx, h);
        }

        drawScopeOverlays(ctx, w, h);
    }

    _getScopeDirection() {
        const azimuth = store.scopeAzimuth;
        const elevation = store.scopeElevation;
        return [
            Math.cos(elevation) * Math.cos(azimuth),
            Math.cos(elevation) * Math.sin(azimuth),
            Math.sin(elevation),
        ];
    }
}
