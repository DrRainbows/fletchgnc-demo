import { FONTS, drawText } from '../../core/theme.js';
import { effects } from '../../core/effects.js';
import { store } from '../../core/state-store.js';
import { V3 } from '../../sim/math.js';
import { getScopeBasis, projectToScope } from './shared.js';

export function drawOnboardPiP(ctx, w, h, replayFrame) {
    const boltState = replayFrame || store.boltState;
    if (!boltState?.position || !boltState?.velocity) {
        return;
    }

    const pipW = Math.min(140, w * 0.28);
    const pipH = pipW * 0.75;
    const pipX = w - pipW - 8;
    const pipY = h - pipH - 55;
    const pipCx = pipX + pipW / 2;
    const pipCy = pipY + pipH / 2;

    ctx.fillStyle = '#040810';
    ctx.fillRect(pipX - 2, pipY - 2, pipW + 4, pipH + 4);
    ctx.strokeStyle = '#1a3050';
    ctx.lineWidth = 1;
    ctx.strokeRect(pipX - 2, pipY - 2, pipW + 4, pipH + 4);

    ctx.save();
    ctx.beginPath();
    ctx.rect(pipX, pipY, pipW, pipH);
    ctx.clip();

    const skyGradient = ctx.createLinearGradient(pipX, pipY, pipX, pipY + pipH);
    skyGradient.addColorStop(0, '#0a1830');
    skyGradient.addColorStop(0.55, '#152040');
    skyGradient.addColorStop(0.55, '#1a2a18');
    skyGradient.addColorStop(1, '#0d1a0a');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(pipX, pipY, pipW, pipH);

    const speed = V3.mag(boltState.velocity);
    let forward;
    if (speed > 1) {
        forward = V3.normalize(boltState.velocity);
    } else if (boltState.quaternion) {
        const [qw, qx, qy, qz] = boltState.quaternion;
        forward = [
            1 - 2 * (qy * qy + qz * qz),
            2 * (qx * qy + qw * qz),
            2 * (qx * qz - qw * qy),
        ];
    } else {
        ctx.restore();
        return;
    }

    const { right, camUp } = getScopeBasis(forward);
    const pipFovH = 0.4;
    const pipFovV = 0.3;

    for (const target of store.targets || []) {
        const projection = projectToScope({
            point: target.position,
            scopePosition: boltState.position,
            scopeDirection: forward,
            right,
            camUp,
            effFovH: pipFovH,
            effFovV: pipFovV,
            width: pipW,
            height: pipH,
            centerX: pipCx,
            centerY: pipCy,
        });
        if (!projection) {
            continue;
        }

        if (
            Math.abs(projection.horizontalAngle) > pipFovH
            || Math.abs(projection.verticalAngle) > pipFovV
        ) {
            continue;
        }

        const apparentH = target.size[2] / (projection.distance * pipFovV) * pipH * 0.5;
        const apparentW = target.size[0] / (projection.distance * pipFovH) * pipW * 0.5;

        ctx.fillStyle = '#304020';
        ctx.fillRect(
            projection.screenX - apparentW / 2,
            projection.screenY - apparentH / 2,
            apparentW,
            apparentH,
        );

        ctx.strokeStyle = target === store.selectedTarget ? '#ff4040' : '#606060';
        ctx.lineWidth = 1;
        const diamondSize = Math.max(4, Math.min(apparentH, 16));
        ctx.beginPath();
        ctx.moveTo(projection.screenX, projection.screenY - diamondSize);
        ctx.lineTo(projection.screenX + diamondSize, projection.screenY);
        ctx.lineTo(projection.screenX, projection.screenY + diamondSize);
        ctx.lineTo(projection.screenX - diamondSize, projection.screenY);
        ctx.closePath();
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0, 212, 255, 0.31)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pipCx - 8, pipCy); ctx.lineTo(pipCx + 8, pipCy);
    ctx.moveTo(pipCx, pipCy - 8); ctx.lineTo(pipCx, pipCy + 8);
    ctx.stroke();
    ctx.restore();

    drawText(ctx, 'FWD CAM', pipX + 2, pipY - 4, '#4a7a9a', `8px ${FONTS.data}`);

    const range = store.selectedTarget
        ? V3.mag(V3.sub(store.selectedTarget.position, boltState.position))
        : 0;
    drawText(
        ctx,
        `${speed.toFixed(0)}m/s`,
        pipX + pipW - 2,
        pipY + pipH - 3,
        'rgba(0, 212, 255, 0.5)',
        `8px ${FONTS.data}`,
        'right',
    );
    if (range > 0) {
        drawText(
            ctx,
            `${range.toFixed(0)}m`,
            pipX + 2,
            pipY + pipH - 3,
            'rgba(255, 200, 48, 0.5)',
            `8px ${FONTS.data}`,
        );
    }
}

export function drawScopeOverlays(ctx, w, h) {
    effects.fireFlash.draw(ctx, w, h);
    effects.postFlight.draw(ctx, w, h);
    effects.onboarding.draw(ctx, w, h);
}
