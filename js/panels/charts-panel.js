/**
 * Charts Panel - Real-time time-series strip charts for flight data.
 * Channels: speed, fin pitch/yaw, AoA, altitude, range, acceleration, kinetic energy.
 * Shows per-channel Y-axis labels, latest value readouts, and flight phase bar.
 */
import { UIPanel } from '../core/ui-panel.js';
import { COLORS, FONTS, drawText, rgba } from '../core/theme.js';
import { store } from '../core/state-store.js';
import { V3, degrees } from '../sim/math.js';
import { BOLT_CONFIG } from '../sim/physics.js';

const CHANNELS = [
    { key: 'speed', label: 'SPD', unit: 'm/s', color: COLORS.cyan,
        extract: e => e.speed || 0 },
    { key: 'finPitch', label: 'FIN P', unit: '\u00B0', color: COLORS.finColor,
        extract: e => degrees(e.actualFinPitch || e.finPitch || 0) },
    { key: 'finYaw', label: 'FIN Y', unit: '\u00B0', color: COLORS.magenta,
        extract: e => degrees(e.actualFinYaw || e.finYaw || 0) },
    { key: 'aoa', label: 'AoA', unit: '\u00B0', color: COLORS.aoaArc,
        extract: e => degrees(e.angleOfAttack || 0) },
    { key: 'altitude', label: 'ALT', unit: 'm', color: COLORS.green,
        extract: e => e.position ? e.position[2] : 0 },
    { key: 'range', label: 'RNG', unit: 'm', color: '#8080ff',
        extract: e => {
            const tgt = store.selectedTarget;
            if (!tgt || !e.position) return 0;
            return V3.mag(V3.sub(tgt.position, e.position));
        }},
    { key: 'accel', label: 'ACCEL', unit: 'g', color: '#e060ff',
        extract: (e, i, arr) => {
            if (i < 1 || !arr) return 0;
            const prev = arr[i - 1];
            const dt = e.time - prev.time;
            if (dt <= 0) return 0;
            const dv = V3.sub(e.velocity || [0,0,0], prev.velocity || [0,0,0]);
            return V3.mag(V3.scale(dv, 1 / dt)) / 9.81;
        }},
    { key: 'ke', label: 'KE', unit: 'J', color: '#ffa040',
        extract: e => 0.5 * BOLT_CONFIG.mass * (e.speed || 0) ** 2 },
];

export class ChartsPanel extends UIPanel {
    constructor() {
        super('panel-charts', { title: 'CHARTS' });
        this.enabledChannels = new Set(['speed', 'finPitch', 'finYaw', 'aoa']);

        store.on('trajectory', () => this.invalidate());
        store.on('inFlight', () => this.invalidate());
        store.on('replayIndex', () => this.invalidate());
    }

    render(ctx, w, h) {
        ctx.fillStyle = COLORS.panelBg;
        ctx.fillRect(0, 0, w, h);

        // Channel legend/toggles
        let lx = 8;
        ctx.font = `8px ${FONTS.data}`;
        for (const ch of CHANNELS) {
            const enabled = this.enabledChannels.has(ch.key);
            const color = enabled ? ch.color : COLORS.textMuted;
            ctx.fillStyle = color;
            ctx.fillRect(lx, 28, 5, 5);
            drawText(ctx, ch.label, lx + 8, 33, color, `8px ${FONTS.data}`);
            lx += ctx.measureText(ch.label).width + 18;
        }

        const traj = store.trajectory;
        if (traj.length < 2) {
            drawText(ctx, 'NO FLIGHT DATA', w / 2, h / 2, COLORS.textDim, `11px ${FONTS.data}`, 'center');
            return;
        }

        const pad = { left: 48, right: 62, top: 48, bottom: 20 };
        const plotW = w - pad.left - pad.right;
        const plotH = h - pad.top - pad.bottom;

        if (plotW < 20 || plotH < 20) return;

        // Time axis
        const tMin = traj[0].time;
        const tMax = traj[traj.length - 1].time;
        const tSpan = Math.max(tMax - tMin, 0.01);

        // Grid lines first (behind data)
        ctx.strokeStyle = '#141c28';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const y = pad.top + (plotH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(pad.left + plotW, y);
            ctx.stroke();
        }

        const numTicks = Math.min(6, Math.floor(plotW / 50));
        for (let i = 0; i <= numTicks; i++) {
            const x = pad.left + (plotW / numTicks) * i;
            ctx.beginPath();
            ctx.moveTo(x, pad.top);
            ctx.lineTo(x, pad.top + plotH);
            ctx.stroke();
        }

        // Flight mode phase bar (at top of chart area)
        if (traj.length > 1) {
            this._drawPhaseBar(ctx, pad, plotW, tMin, tSpan);
        }

        // Draw each enabled channel
        for (const ch of CHANNELS) {
            if (!this.enabledChannels.has(ch.key)) continue;

            const values = traj.map((e, i, arr) => ch.extract(e, i, arr));
            let vMin = Infinity, vMax = -Infinity;
            for (const v of values) {
                if (v < vMin) vMin = v;
                if (v > vMax) vMax = v;
            }

            const vRange = Math.max(vMax - vMin, 0.01);
            vMin -= vRange * 0.1;
            vMax += vRange * 0.1;
            const vSpan = vMax - vMin;

            // Y-axis scale labels (min/max on left edge in channel color)
            drawText(ctx, vMax.toFixed(1), pad.left - 4, pad.top + 8,
                rgba(ch.color, 0.63), `7px ${FONTS.data}`, 'right');
            drawText(ctx, vMin.toFixed(1), pad.left - 4, pad.top + plotH,
                rgba(ch.color, 0.63), `7px ${FONTS.data}`, 'right');

            // Draw line
            ctx.strokeStyle = ch.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i < traj.length; i++) {
                const x = pad.left + ((traj[i].time - tMin) / tSpan) * plotW;
                const y = pad.top + plotH - ((values[i] - vMin) / vSpan) * plotH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Predicted trajectory ghost overlay (altitude channel only)
            if (ch.key === 'altitude') {
                const predicted = store.lastPredictedTrajectory;
                if (predicted && predicted.length > 1) {
                    ctx.save();
                    ctx.strokeStyle = rgba('#ffc830', 0.3);
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    const pDt = 0.02;
                    for (let i = 0; i < predicted.length; i++) {
                        const t = i * pDt;
                        if (t < tMin || t > tMax) continue;
                        const x = pad.left + ((t - tMin) / tSpan) * plotW;
                        const alt = predicted[i][2];
                        const y = pad.top + plotH - ((alt - vMin) / vSpan) * plotH;
                        if (i === 0 || t === tMin) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.restore();
                }
            }

            // Latest value readout on right side
            const lastVal = values[values.length - 1];
            const lastY = Math.max(pad.top + 6, Math.min(pad.top + plotH - 4,
                pad.top + plotH - ((lastVal - vMin) / vSpan) * plotH));

            // Dot at current value
            ctx.fillStyle = ch.color;
            ctx.beginPath();
            ctx.arc(pad.left + plotW, lastY, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Value label
            drawText(ctx, `${lastVal.toFixed(1)}${ch.unit}`,
                pad.left + plotW + 6, lastY + 3, ch.color, `9px ${FONTS.data}`);
        }

        // Time axis labels
        for (let i = 0; i <= numTicks; i++) {
            const t = tMin + (tSpan / numTicks) * i;
            const x = pad.left + (plotW / numTicks) * i;
            drawText(ctx, `${t.toFixed(2)}s`, x, h - 4, COLORS.textDim, `8px ${FONTS.data}`, 'center');
        }

        // Plot border
        ctx.strokeStyle = COLORS.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(pad.left, pad.top, plotW, plotH);

        // Current time marker (if in flight)
        if (store.inFlight && traj.length > 0) {
            const curTime = traj[traj.length - 1].time;
            const x = pad.left + ((curTime - tMin) / tSpan) * plotW;
            ctx.strokeStyle = rgba(COLORS.cyan, 0.38);
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(x, pad.top);
            ctx.lineTo(x, pad.top + plotH);
            ctx.stroke();
            ctx.setLineDash([]);

            drawText(ctx, `T+${curTime.toFixed(3)}s`, x, pad.top - 4,
                COLORS.cyan, `8px ${FONTS.data}`, 'center');
        }

        // Replay scrub cursor
        if (store.replayActive && store.replayFrame) {
            const rTime = store.replayFrame.time;
            const x = pad.left + ((rTime - tMin) / tSpan) * plotW;
            ctx.strokeStyle = rgba(COLORS.yellow, 0.7);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, pad.top);
            ctx.lineTo(x, pad.top + plotH);
            ctx.stroke();

            // Time label
            drawText(ctx, `T+${rTime.toFixed(3)}s`, x, pad.top - 4,
                COLORS.yellow, `bold 8px ${FONTS.data}`, 'center');

            // Triangular cursor at top
            ctx.fillStyle = COLORS.yellow;
            ctx.beginPath();
            ctx.moveTo(x, pad.top);
            ctx.lineTo(x - 4, pad.top - 6);
            ctx.lineTo(x + 4, pad.top - 6);
            ctx.closePath();
            ctx.fill();
        }

    }

    _drawPhaseBar(ctx, pad, plotW, tMin, tSpan) {
        const flightLog = store.flightLog;
        if (!flightLog || flightLog.length < 2) return;

        const barH = 8;
        const barY = pad.top - barH;

        let prevMode = null;
        let segStart = 0;

        const modeColors = {
            'BOOST': '#ff8c00',
            'MIDCOURSE': '#00d4ff',
            'TERMINAL': '#ff3040',
        };

        const modeLabels = {
            'BOOST': 'BOO',
            'MIDCOURSE': 'MID',
            'TERMINAL': 'TER',
        };

        const segments = [];

        for (let i = 0; i < flightLog.length; i++) {
            const entry = flightLog[i];
            const mode = entry.mode;
            if (mode !== prevMode) {
                if (prevMode && modeColors[prevMode]) {
                    segments.push({
                        mode: prevMode,
                        x1: pad.left + ((segStart - tMin) / tSpan) * plotW,
                        x2: pad.left + (((entry.time || 0) - tMin) / tSpan) * plotW,
                    });
                }
                prevMode = mode;
                segStart = entry.time || 0;
            }
        }

        // Final segment
        if (prevMode && modeColors[prevMode]) {
            segments.push({
                mode: prevMode,
                x1: pad.left + ((segStart - tMin) / tSpan) * plotW,
                x2: pad.left + plotW,
            });
        }

        // Draw segments
        for (const seg of segments) {
            const segW = seg.x2 - seg.x1;
            ctx.fillStyle = rgba(modeColors[seg.mode], 0.5);
            ctx.fillRect(seg.x1, barY, segW, barH);

            // Label if segment is wide enough
            if (segW > 30 && modeLabels[seg.mode]) {
                drawText(ctx, modeLabels[seg.mode],
                    seg.x1 + segW / 2, barY + barH - 2,
                    'rgba(255, 255, 255, 0.75)', `bold 6px ${FONTS.data}`, 'center');
            }
        }

        // Phase bar border
        ctx.strokeStyle = rgba(COLORS.border, 0.38);
        ctx.lineWidth = 0.5;
        ctx.strokeRect(pad.left, barY, plotW, barH);
    }
}
