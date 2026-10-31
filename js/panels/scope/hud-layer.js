import { COLORS, FONTS, drawText, rgba } from '../../core/theme.js';
import { effects } from '../../core/effects.js';
import { store } from '../../core/state-store.js';
import { V3, degrees } from '../../sim/math.js';
import { ZONE_COLORS } from './shared.js';

export function drawHUD(ctx, w, h, cx, cy) {
    const isArmed = store.isArmed;
    const preFire = store.preFire;
    const selectedTarget = store.selectedTarget;

    const zone = store.selectedZone;
    const zoneColor = ZONE_COLORS[zone] || COLORS.cyan;
    const panelX = 8;
    const panelY = h - 52;
    const panelW = 105;
    const panelH = 42;
    ctx.fillStyle = 'rgba(6, 10, 16, 0.75)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#1e3a50';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    drawText(ctx, zone.toUpperCase(), panelX + 6, panelY + 18, zoneColor, `bold 14px ${FONTS.data}`);
    drawText(ctx, 'AIM POINT', panelX + 6, panelY + 30, COLORS.textDim, `8px ${FONTS.data}`);
    drawText(ctx, '◀ Z ▶', panelX + panelW - 6, panelY + 30, COLORS.textMuted, `8px ${FONTS.data}`, 'right');

    drawText(ctx, `${store.scopeZoom.toFixed(1)}x`, w - 10, 20, COLORS.textDim, `11px ${FONTS.data}`, 'right');
    drawWindIndicator(ctx, w);

    if (!store.inFlight && !store.isArmed) {
        drawText(
            ctx,
            'A:Arm  SPACE:Fire  R:Reset  1-7:Target  Z:Zone  Scroll:Zoom',
            cx,
            h - 5,
            'rgba(58, 80, 112, 0.4)',
            `8px ${FONTS.data}`,
            'center',
        );
    }

    if (selectedTarget) {
        const range = V3.mag(V3.sub(selectedTarget.position, store.scopePosition));
        const infoX = 8;
        const infoY = 8;
        const infoW = 120;
        const infoH = 32;
        ctx.fillStyle = 'rgba(6, 10, 16, 0.6)';
        ctx.fillRect(infoX, infoY, infoW, infoH);
        drawText(
            ctx,
            `T${selectedTarget.id + 1} ${selectedTarget.type.toUpperCase()}`,
            infoX + 4,
            infoY + 12,
            COLORS.textDim,
            `9px ${FONTS.data}`,
        );
        drawText(ctx, `RNG ${range.toFixed(0)}m`, infoX + 4, infoY + 24, COLORS.text, `10px ${FONTS.data}`);
    }

    if (preFire && isArmed) {
        const feasibilityColor = preFire.feasibility === 'GOOD'
            ? COLORS.green
            : preFire.feasibility === 'MARGINAL'
                ? COLORS.yellow
                : COLORS.red;
        const feasibilityText = preFire.feasibility === 'GOOD'
            ? 'SHOT READY'
            : preFire.feasibility === 'MARGINAL'
                ? 'MARGINAL'
                : 'NO SHOT';

        const boxW = 200;
        const boxH = 50;
        const boxX = cx - boxW / 2;
        const boxY = 6;
        ctx.fillStyle = 'rgba(6, 10, 16, 0.8)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = rgba(feasibilityColor, 0.25);
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        drawText(ctx, feasibilityText, cx, boxY + 16, feasibilityColor, `bold 13px ${FONTS.data}`, 'center');
        drawText(
            ctx,
            `RNG ${preFire.range_m.toFixed(0)}m  TOF ${preFire.tof_estimate.toFixed(3)}s`,
            cx,
            boxY + 30,
            COLORS.text,
            `10px ${FONTS.data}`,
            'center',
        );
        if (preFire.off_axis_deg !== undefined) {
            drawText(
                ctx,
                `OFF-AXIS ${preFire.off_axis_deg.toFixed(1)}°`,
                cx,
                boxY + 42,
                COLORS.textDim,
                `9px ${FONTS.data}`,
                'center',
            );
        }
    }

    // In-flight guidance telemetry overlay (bottom right)
    if (store.inFlight && store.guidanceCmd) {
        const gc = store.guidanceCmd;
        const gx = w - 8;
        const gy = h - 52;
        const boxW = 110;
        const boxH = 42;

        ctx.fillStyle = 'rgba(6, 10, 16, 0.75)';
        ctx.fillRect(gx - boxW, gy, boxW, boxH);
        ctx.strokeStyle = '#1e3a50';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(gx - boxW, gy, boxW, boxH);

        // Guidance mode
        const mode = gc.guidanceMode || (gc.blendAlpha !== undefined ? 'BLEND' : 'PN');
        drawText(ctx, mode, gx - 4, gy + 12, COLORS.cyan, `bold 10px ${FONTS.data}`, 'right');

        // Accel command magnitude
        const accelG = gc.accelCmd ? V3.mag(gc.accelCmd) / 9.81 : 0;
        const accelColor = accelG > 10 ? COLORS.red : accelG > 5 ? COLORS.yellow : COLORS.green;
        drawText(ctx, `${accelG.toFixed(1)}g`, gx - 4, gy + 24, accelColor, `10px ${FONTS.data}`, 'right');

        // TTI
        if (gc.timeToIntercept < 100) {
            drawText(ctx, `TTI ${gc.timeToIntercept.toFixed(2)}s`, gx - 4, gy + 36,
                gc.timeToIntercept < 0.3 ? COLORS.yellow : COLORS.textDim,
                `9px ${FONTS.data}`, 'right');
        }
    }

    if (isArmed) {
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.006);
        ctx.strokeStyle = `rgba(255, 48, 64, ${pulse.toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);
        drawText(ctx, 'ARMED', cx, h - 10, COLORS.red, `bold 13px ${FONTS.data}`, 'center');
    }
}

export function drawWindIndicator(ctx, w) {
    const wind = store.windVelocity;
    if (!wind) {
        return;
    }

    const speedXY = Math.sqrt(wind[0] ** 2 + wind[1] ** 2);
    if (speedXY < 0.05) {
        drawText(ctx, 'CALM', w - 10, 36, COLORS.textDim, `9px ${FONTS.data}`, 'right');
        return;
    }

    const cx = w - 38;
    const cy = 48;
    const windAngle = Math.atan2(wind[1], wind[0]);
    const arrowLen = Math.min(18, 8 + speedXY * 1.2);
    const ex = cx + Math.sin(windAngle) * arrowLen;
    const ey = cy - Math.cos(windAngle) * arrowLen * 0.6;

    ctx.save();
    ctx.strokeStyle = rgba(COLORS.cyan, 0.6);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    const angle = Math.atan2(ey - cy, ex - cx);
    const arrowHead = 5;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - arrowHead * Math.cos(angle - 0.5), ey - arrowHead * Math.sin(angle - 0.5));
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - arrowHead * Math.cos(angle + 0.5), ey - arrowHead * Math.sin(angle + 0.5));
    ctx.stroke();
    ctx.restore();

    drawText(ctx, `${speedXY.toFixed(1)} m/s`, w - 10, 66, rgba(COLORS.cyan, 0.6), `8px ${FONTS.data}`, 'right');
    drawText(ctx, 'WIND', w - 10, 76, rgba(COLORS.textDim, 0.5), `7px ${FONTS.data}`, 'right');
}

export function drawReplayHUD(ctx, h) {
    const frame = store.replayFrame;
    if (!frame) {
        return;
    }

    const hudX = 8;
    const hudY = h - 80;
    const hudW = 160;
    const hudH = 36;
    ctx.fillStyle = 'rgba(6, 10, 16, 0.75)';
    ctx.fillRect(hudX, hudY, hudW, hudH);
    ctx.strokeStyle = rgba(COLORS.cyan, 0.25);
    ctx.lineWidth = 0.5;
    ctx.strokeRect(hudX, hudY, hudW, hudH);

    drawText(ctx, 'REPLAY', hudX + 4, hudY + 12, COLORS.cyan, `bold 9px ${FONTS.data}`);
    drawText(
        ctx,
        effects.replay.playing ? '▶' : '⏸',
        hudX + hudW - 14,
        hudY + 12,
        COLORS.cyan,
        `10px ${FONTS.data}`,
    );

    const speed = frame.speed || 0;
    const aoa = degrees(frame.angleOfAttack || 0);
    drawText(
        ctx,
        `${frame.time.toFixed(3)}s  ${speed.toFixed(0)}m/s  AoA ${aoa.toFixed(1)}°`,
        hudX + 4,
        hudY + 26,
        COLORS.textDim,
        `9px ${FONTS.data}`,
    );
}
