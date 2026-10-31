import { COLORS, rgba } from '../../core/theme.js';
import { store } from '../../core/state-store.js';
import { getScopeBasis, projectToScope } from './shared.js';

function traceProjectedLine({
    ctx,
    points,
    scopeDirection,
    scopePosition,
    effFovH,
    effFovV,
    width,
    height,
    centerX,
    centerY,
}) {
    const { right, camUp } = getScopeBasis(scopeDirection);
    let started = false;

    for (const point of points) {
        const projection = projectToScope({
            point,
            scopePosition,
            scopeDirection,
            right,
            camUp,
            effFovH,
            effFovV,
            width,
            height,
            centerX,
            centerY,
        });
        if (!projection) {
            continue;
        }

        if (!started) {
            ctx.moveTo(projection.screenX, projection.screenY);
            started = true;
        } else {
            ctx.lineTo(projection.screenX, projection.screenY);
        }
    }

    return { started, right, camUp };
}

export function drawBoltTrail(ctx, w, h, scopeDirection, scopePosition, effFovH, effFovV) {
    const trajectory = store.trajectory;
    const recentPoints = trajectory.slice(Math.max(0, trajectory.length - 80)).map((frame) => frame.position);
    const centerX = w / 2;
    const centerY = h / 2;

    ctx.strokeStyle = rgba(COLORS.cyan, 0.19);
    ctx.lineWidth = 4;
    ctx.beginPath();
    const glow = traceProjectedLine({
        ctx,
        points: recentPoints,
        scopeDirection,
        scopePosition,
        effFovH,
        effFovV,
        width: w,
        height: h,
        centerX,
        centerY,
    });
    if (glow.started) {
        ctx.stroke();
    }

    ctx.strokeStyle = rgba(COLORS.cyan, 0.63);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const core = traceProjectedLine({
        ctx,
        points: recentPoints,
        scopeDirection,
        scopePosition,
        effFovH,
        effFovV,
        width: w,
        height: h,
        centerX,
        centerY,
    });
    if (core.started) {
        ctx.stroke();
    }
}

export function drawPredictedTrajectory(ctx, w, h, scopeDirection, scopePosition, effFovH, effFovV) {
    const predicted = store.predictedTrajectory;
    if (!predicted || predicted.length < 2) {
        return;
    }

    const centerX = w / 2;
    const centerY = h / 2;
    const sampledPoints = predicted.filter((_, index) => index % 2 === 0);
    const { right, camUp } = getScopeBasis(scopeDirection);

    ctx.strokeStyle = rgba(COLORS.cyan, 0.38);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const trace = traceProjectedLine({
        ctx,
        points: sampledPoints,
        scopeDirection,
        scopePosition,
        effFovH,
        effFovV,
        width: w,
        height: h,
        centerX,
        centerY,
    });
    if (trace.started) {
        ctx.stroke();
    }
    ctx.setLineDash([]);

    const endProjection = projectToScope({
        point: predicted[predicted.length - 1],
        scopePosition,
        scopeDirection,
        right,
        camUp,
        effFovH,
        effFovV,
        width: w,
        height: h,
        centerX,
        centerY,
    });

    if (endProjection) {
        ctx.fillStyle = rgba(COLORS.cyan, 0.5);
        ctx.beginPath();
        ctx.arc(endProjection.screenX, endProjection.screenY, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

export function drawReplayTrail(ctx, w, h, scopeDirection, scopePosition, effFovH, effFovV) {
    const trajectory = store.trajectory;
    const endIndex = Math.min(store.replayIndex + 1, trajectory.length);
    if (!trajectory || endIndex < 1) {
        return;
    }

    const centerX = w / 2;
    const centerY = h / 2;
    const replayPoints = trajectory.slice(0, endIndex).map((frame) => frame.position);
    const { right, camUp } = getScopeBasis(scopeDirection);

    ctx.strokeStyle = rgba(COLORS.cyan, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const trace = traceProjectedLine({
        ctx,
        points: replayPoints,
        scopeDirection,
        scopePosition,
        effFovH,
        effFovV,
        width: w,
        height: h,
        centerX,
        centerY,
    });
    if (trace.started) {
        ctx.stroke();
    }

    if (!store.replayFrame) {
        return;
    }

    const boltProjection = projectToScope({
        point: store.replayFrame.position,
        scopePosition,
        scopeDirection,
        right,
        camUp,
        effFovH,
        effFovV,
        width: w,
        height: h,
        centerX,
        centerY,
    });

    if (boltProjection) {
        ctx.fillStyle = rgba(COLORS.cyan, 0.2);
        ctx.beginPath();
        ctx.arc(boltProjection.screenX, boltProjection.screenY, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = rgba(COLORS.cyan, 0.8);
        ctx.beginPath();
        ctx.arc(boltProjection.screenX, boltProjection.screenY, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}
