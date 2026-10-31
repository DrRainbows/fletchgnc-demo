/**
 * CG Body View Panel - Bolt attitude with triangular control surfaces,
 * center-of-pressure marker, commanded vs actual fin overlay.
 */
import { UIPanel } from '../core/ui-panel.js';
import { COLORS, FONTS, drawText, drawBar, rgba } from '../core/theme.js';
import { store } from '../core/state-store.js';
import { Quat, degrees } from '../sim/math.js';
import { BOLT_CONFIG } from '../sim/physics.js';

export class CGBodyPanel extends UIPanel {
    constructor() {
        super('panel-cgbody', { title: 'CG BODY' });

        store.on('boltState', () => this.invalidate());
        store.on('inFlight', () => this.invalidate());
    }

    render(ctx, w, h) {
        ctx.fillStyle = COLORS.panelBg;
        ctx.fillRect(0, 0, w, h);

        const boltState = store.boltState;
        const traj = store.trajectory;
        const lastEntry = traj.length > 0 ? traj[traj.length - 1] : null;
        const data = (store.inFlight && boltState) ? boltState : lastEntry;

        if (!data) {
            drawText(ctx, 'NO FLIGHT DATA', w / 2, h / 2, COLORS.textDim, `12px ${FONTS.data}`, 'center');
            return;
        }

        const euler = data.eulerAngles || Quat.toEuler(data.quaternion || [1, 0, 0, 0]);
        const aoa = data.angleOfAttack || 0;
        const finPitch = data.actualFinPitch || data.finPitch || 0;
        const finYaw = data.actualFinYaw || data.finYaw || 0;
        const cmdFinPitch = data.finPitch || 0;
        const cmdFinYaw = data.finYaw || 0;
        const speed = data.speed || 0;
        const maxDefl = BOLT_CONFIG.maxFinDeflection;

        const cx = w / 2;
        const cy = h / 2;
        const boltLen = Math.min(w * 0.35, 150);
        const boltR = 5;

        // ─── Sparse dotted grid ───
        ctx.strokeStyle = '#101820';
        ctx.lineWidth = 0.3;
        ctx.setLineDash([1, 4]);

        // Center axes only (prominent)
        ctx.strokeStyle = '#182430';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(10, cy); ctx.lineTo(w - 10, cy);
        ctx.moveTo(cx, 24); ctx.lineTo(cx, h - 45);
        ctx.stroke();

        // Sparse 50px grid dots
        ctx.fillStyle = '#101820';
        for (let gx = cx % 50; gx < w; gx += 50) {
            for (let gy = cy % 50; gy < h - 45; gy += 50) {
                if (Math.abs(gx - cx) < 5 && Math.abs(gy - cy) < 5) continue;
                ctx.fillRect(gx, gy, 1, 1);
            }
        }

        // Velocity vector reference
        ctx.strokeStyle = rgba(COLORS.velocityVec, 0.13);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx - boltLen * 1.3, cy);
        ctx.lineTo(cx + boltLen * 1.3, cy);
        ctx.stroke();
        ctx.setLineDash([]);
        drawText(ctx, 'V\u2192', w - 15, cy + 4, rgba(COLORS.velocityVec, 0.25), `9px ${FONTS.data}`, 'right');

        // ─── Draw bolt body rotated by pitch ───
        const pitch = euler[1] || 0;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-pitch);

        // Shaft with gradient shading (3D cylinder feel)
        const bodyGrad = ctx.createLinearGradient(0, -boltR, 0, boltR);
        bodyGrad.addColorStop(0, '#d0e0f0');
        bodyGrad.addColorStop(0.3, '#b0c0d0');
        bodyGrad.addColorStop(0.7, '#8090a0');
        bodyGrad.addColorStop(1, '#607080');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(boltLen / 2 + 10, 0);
        ctx.lineTo(boltLen / 2, -boltR);
        ctx.lineTo(-boltLen / 2, -boltR);
        ctx.lineTo(-boltLen / 2, boltR);
        ctx.lineTo(boltLen / 2, boltR);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(160, 176, 192, 0.5)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Nock
        ctx.fillStyle = '#506070';
        ctx.fillRect(-boltLen / 2 - 5, -boltR - 1, 5, boltR * 2 + 2);

        // ─── Triangular fins ───
        const finRoot = -boltLen / 2 + 15;
        const finRootChord = 18;
        const finSpan = 26;

        // Draw commanded fin positions as ghost overlay first
        this._drawFin(ctx, finRoot, finRootChord, finSpan, -boltR, -1,
            cmdFinPitch, maxDefl, COLORS.finColor, true);
        this._drawFin(ctx, finRoot, finRootChord, finSpan, boltR, 1,
            cmdFinPitch, maxDefl, COLORS.finColor, true);
        this._drawFin(ctx, finRoot - 6, finRootChord * 0.7, finSpan * 0.5, -boltR + 2, -1,
            cmdFinYaw, maxDefl, COLORS.magenta, true);
        this._drawFin(ctx, finRoot - 6, finRootChord * 0.7, finSpan * 0.5, boltR - 2, 1,
            -cmdFinYaw, maxDefl, COLORS.magenta, true);

        // Draw actual fins (solid)
        this._drawFin(ctx, finRoot, finRootChord, finSpan, -boltR, -1,
            finPitch, maxDefl, COLORS.finColor, false);
        this._drawFin(ctx, finRoot, finRootChord, finSpan, boltR, 1,
            finPitch, maxDefl, COLORS.finColor, false);
        this._drawFin(ctx, finRoot - 6, finRootChord * 0.7, finSpan * 0.5, -boltR + 2, -1,
            finYaw, maxDefl, COLORS.magenta, false);
        this._drawFin(ctx, finRoot - 6, finRootChord * 0.7, finSpan * 0.5, boltR - 2, 1,
            -finYaw, maxDefl, COLORS.magenta, false);

        // CG marker
        ctx.fillStyle = COLORS.yellow;
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(COLORS.yellow, 0.38);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.stroke();
        drawText(ctx, 'CG', 5, -10, COLORS.yellow, `bold 8px ${FONTS.data}`);

        // CP marker (aft of CG by finMomentArm)
        const cpOffset = -(BOLT_CONFIG.finMomentArm || 0.15) * boltLen * 2.5;
        ctx.fillStyle = COLORS.magenta;
        ctx.beginPath();
        ctx.moveTo(cpOffset, -7);
        ctx.lineTo(cpOffset - 4, -13);
        ctx.lineTo(cpOffset + 4, -13);
        ctx.closePath();
        ctx.fill();
        drawText(ctx, 'CP', cpOffset + 6, -10, COLORS.magenta, `bold 8px ${FONTS.data}`);

        ctx.restore();

        // ─── AoA arc ───
        if (Math.abs(aoa) > 0.001) {
            const arcR = boltLen * 0.55;
            ctx.strokeStyle = COLORS.aoaArc;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, arcR, 0, -pitch, pitch > 0);
            ctx.stroke();

            const labelAngle = -pitch / 2;
            const lx = cx + Math.cos(labelAngle) * (arcR + 14);
            const ly = cy - Math.sin(labelAngle) * (arcR + 14);
            drawText(ctx, `AoA: ${degrees(aoa).toFixed(1)}\u00B0`, lx, ly,
                COLORS.aoaArc, `10px ${FONTS.data}`, 'center');
        }

        // ─── Readouts ───
        const ry = h - 42;
        drawText(ctx, `PITCH: ${degrees(euler[1]).toFixed(1)}\u00B0`, 8, ry, COLORS.text, `10px ${FONTS.data}`);
        drawText(ctx, `YAW: ${degrees(euler[2]).toFixed(1)}\u00B0`, 8, ry + 14, COLORS.text, `10px ${FONTS.data}`);
        drawText(ctx, `ROLL: ${degrees(euler[0]).toFixed(1)}\u00B0`, 8, ry + 28, COLORS.text, `10px ${FONTS.data}`);

        drawText(ctx, `FIN \u03B4p: ${degrees(finPitch).toFixed(1)}\u00B0`, w / 2 - 20, ry,
            COLORS.finColor, `10px ${FONTS.data}`);
        drawText(ctx, `FIN \u03B4y: ${degrees(finYaw).toFixed(1)}\u00B0`, w / 2 - 20, ry + 14,
            COLORS.magenta, `10px ${FONTS.data}`);
        drawText(ctx, `SPD: ${speed.toFixed(0)} m/s`, w / 2 - 20, ry + 28,
            COLORS.cyan, `10px ${FONTS.data}`);

        // Fin deflection bars
        const barX = w - 65;
        const barW = 55;
        const barH = 5;
        drawText(ctx, 'P', barX - 12, ry + 5, COLORS.finColor, `9px ${FONTS.data}`);
        drawBar(ctx, barX, ry, barW, barH, Math.abs(finPitch) / maxDefl, COLORS.finColor);
        drawText(ctx, 'Y', barX - 12, ry + 19, COLORS.magenta, `9px ${FONTS.data}`);
        drawBar(ctx, barX, ry + 14, barW, barH, Math.abs(finYaw) / maxDefl, COLORS.magenta);

        // Dynamic pressure
        if (speed > 1) {
            const q = 0.5 * 1.225 * speed * speed;
            drawText(ctx, `q: ${q.toFixed(0)} Pa`, barX, ry + 28, COLORS.textDim, `9px ${FONTS.data}`);
        }
    }

    /**
     * Draw a triangular fin shape with deflection rotation.
     * @param {boolean} ghost - If true, draw as dashed ghost (commanded position)
     */
    _drawFin(ctx, rootX, rootChord, span, baseY, direction, deflection, maxDefl, color, ghost) {
        const deflAngle = (deflection / maxDefl) * 0.4 * direction;

        ctx.save();
        ctx.translate(rootX, baseY);
        ctx.rotate(deflAngle);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(rootChord * 0.3, span * direction);
        ctx.lineTo(rootChord, 0);
        ctx.closePath();

        if (ghost) {
            ctx.strokeStyle = rgba(color, 0.25);
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        } else {
            ctx.fillStyle = rgba(color, 0.19);
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        ctx.restore();
    }
}
