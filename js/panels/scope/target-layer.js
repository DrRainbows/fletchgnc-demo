import { COLORS, FONTS, drawText, rgba } from '../../core/theme.js';
import { store } from '../../core/state-store.js';
import { V3 } from '../../sim/math.js';
import { BOLT_CONFIG } from '../../sim/physics.js';
import {
    getScopeBasis,
    projectToScope,
    SILHOUETTES,
    ZONE_COLORS,
} from './shared.js';

export function drawTargets(ctx, w, h, scopeDirection, scopePosition, effFovH, effFovV, cx, cy) {
    const targets = store.targets;
    if (!targets || !scopeDirection || !scopePosition) {
        return;
    }

    const { right, camUp } = getScopeBasis(scopeDirection);
    const selectedZone = store.selectedZone;

    for (const target of targets) {
        const projection = projectToScope({
            point: target.position,
            scopePosition,
            scopeDirection,
            right,
            camUp,
            effFovH,
            effFovV,
            width: w,
            height: h,
            centerX: cx,
            centerY: cy,
        });
        if (!projection) {
            continue;
        }

        if (
            Math.abs(projection.horizontalAngle) > effFovH / 2
            || Math.abs(projection.verticalAngle) > effFovV / 2
        ) {
            continue;
        }

        const apparentSize = target.size[2] / (projection.distance * effFovV) * h;
        const apparentWidth = target.size[0] / (projection.distance * effFovH) * w;
        const isLocked = target.id === store.lockedTargetId;
        const isSelected = target === store.selectedTarget;

        drawTargetSilhouette(
            ctx,
            projection.screenX,
            projection.screenY,
            apparentWidth,
            apparentSize,
            target,
            isLocked,
        );

        const velocity = target.velocity;
        if (velocity && V3.mag(velocity) > 0.3) {
            const velocityEnd = V3.add(target.position, V3.scale(velocity, 0.5));
            const velocityProjection = projectToScope({
                point: velocityEnd,
                scopePosition,
                scopeDirection,
                right,
                camUp,
                effFovH,
                effFovV,
                width: w,
                height: h,
                centerX: cx,
                centerY: cy,
            });

            if (velocityProjection) {
                ctx.strokeStyle = 'rgba(80, 200, 255, 0.31)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(projection.screenX, projection.screenY);
                ctx.lineTo(velocityProjection.screenX, velocityProjection.screenY);
                ctx.stroke();

                const dx = velocityProjection.screenX - projection.screenX;
                const dy = velocityProjection.screenY - projection.screenY;
                const angle = Math.atan2(dy, dx);
                const arrowLen = 5;
                ctx.beginPath();
                ctx.moveTo(velocityProjection.screenX, velocityProjection.screenY);
                ctx.lineTo(
                    velocityProjection.screenX - arrowLen * Math.cos(angle - 0.4),
                    velocityProjection.screenY - arrowLen * Math.sin(angle - 0.4),
                );
                ctx.moveTo(velocityProjection.screenX, velocityProjection.screenY);
                ctx.lineTo(
                    velocityProjection.screenX - arrowLen * Math.cos(angle + 0.4),
                    velocityProjection.screenY - arrowLen * Math.sin(angle + 0.4),
                );
                ctx.stroke();
            }
        }

        const bx = projection.screenX - apparentWidth / 2 - 6;
        const by = projection.screenY - apparentSize / 2 - 6;
        const bw = apparentWidth + 12;
        const bh = apparentSize + 12;
        const bracketLen = Math.min(14, bw * 0.3);
        const bracketColor = isLocked ? COLORS.red : isSelected ? COLORS.yellow : '#406040';
        ctx.strokeStyle = bracketColor;
        ctx.lineWidth = isLocked ? 2.5 : 1.5;
        drawBracket(ctx, bx, by, bracketLen, 1, 1);
        drawBracket(ctx, bx + bw, by, bracketLen, -1, 1);
        drawBracket(ctx, bx, by + bh, bracketLen, 1, -1);
        drawBracket(ctx, bx + bw, by + bh, bracketLen, -1, -1);

        const labelColor = isLocked ? COLORS.red : isSelected ? COLORS.yellow : COLORS.textDim;
        drawText(
            ctx,
            `T${target.id + 1} ${target.type.toUpperCase()}`,
            bx,
            by - 5,
            labelColor,
            `10px ${FONTS.data}`,
        );

        const rangeColor = projection.distance < 200
            ? '#40e060'
            : projection.distance < 400
                ? '#e0d040'
                : projection.distance < 700
                    ? '#e08030'
                    : '#e04040';
        drawText(
            ctx,
            `${projection.distance.toFixed(0)}m`,
            bx + bw,
            by + bh + 12,
            rangeColor,
            `bold 11px ${FONTS.data}`,
            'right',
        );

        if (target.behavior && target.behavior !== 'grazing') {
            drawText(
                ctx,
                target.behavior.toUpperCase(),
                bx + bw,
                by - 5,
                '#5a7050',
                `8px ${FONTS.data}`,
                'right',
            );
        }

        if (isSelected && velocity && V3.mag(velocity) > 0.3) {
            const tof = projection.distance / BOLT_CONFIG.initialVelocity;
            const leadPosition = [
                target.position[0] + velocity[0] * tof,
                target.position[1] + velocity[1] * tof,
                target.position[2] + velocity[2] * tof,
            ];
            const leadProjection = projectToScope({
                point: leadPosition,
                scopePosition,
                scopeDirection,
                right,
                camUp,
                effFovH,
                effFovV,
                width: w,
                height: h,
                centerX: cx,
                centerY: cy,
            });

            if (leadProjection) {
                ctx.strokeStyle = rgba(COLORS.cyan, 0.31);
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(projection.screenX, projection.screenY);
                ctx.lineTo(leadProjection.screenX, leadProjection.screenY);
                ctx.stroke();
                ctx.setLineDash([]);

                const diamondSize = 6;
                ctx.strokeStyle = rgba(COLORS.cyan, 0.56);
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(leadProjection.screenX, leadProjection.screenY - diamondSize);
                ctx.lineTo(leadProjection.screenX + diamondSize, leadProjection.screenY);
                ctx.lineTo(leadProjection.screenX, leadProjection.screenY + diamondSize);
                ctx.lineTo(leadProjection.screenX - diamondSize, leadProjection.screenY);
                ctx.closePath();
                ctx.stroke();
                drawText(
                    ctx,
                    'LEAD',
                    leadProjection.screenX + diamondSize + 3,
                    leadProjection.screenY + 3,
                    rgba(COLORS.cyan, 0.38),
                    `8px ${FONTS.data}`,
                );
            }
        }

        if (isSelected && (store.isArmed || store.inFlight) && store.leadPoint) {
            const gncProjection = projectToScope({
                point: store.leadPoint,
                scopePosition,
                scopeDirection,
                right,
                camUp,
                effFovH,
                effFovV,
                width: w,
                height: h,
                centerX: cx,
                centerY: cy,
            });

            if (gncProjection) {
                const size = 5;
                ctx.strokeStyle = rgba(COLORS.red, 0.7);
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(gncProjection.screenX - size, gncProjection.screenY - size);
                ctx.lineTo(gncProjection.screenX + size, gncProjection.screenY + size);
                ctx.moveTo(gncProjection.screenX + size, gncProjection.screenY - size);
                ctx.lineTo(gncProjection.screenX - size, gncProjection.screenY + size);
                ctx.stroke();
                drawText(
                    ctx,
                    'GNC',
                    gncProjection.screenX + size + 3,
                    gncProjection.screenY + 3,
                    rgba(COLORS.red, 0.5),
                    `7px ${FONTS.data}`,
                );
            }
        }

        if (isSelected && apparentSize > 25) {
            for (const zone of target.hitZones) {
                const zoneProjection = projectToScope({
                    point: target.getZoneWorldPosition(zone),
                    scopePosition,
                    scopeDirection,
                    right,
                    camUp,
                    effFovH,
                    effFovV,
                    width: w,
                    height: h,
                    centerX: cx,
                    centerY: cy,
                });
                if (!zoneProjection) {
                    continue;
                }

                const zoneRadius = zone.radius / (zoneProjection.distance * effFovV) * h;
                const isZoneSelected = zone.type === selectedZone;
                const zoneColor = isZoneSelected ? COLORS.cyan : (ZONE_COLORS[zone.type] || '#808080');

                if (isZoneSelected) {
                    ctx.beginPath();
                    ctx.arc(zoneProjection.screenX, zoneProjection.screenY, Math.max(5, zoneRadius + 3), 0, Math.PI * 2);
                    ctx.fillStyle = rgba(zoneColor, 0.08);
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(zoneProjection.screenX, zoneProjection.screenY, Math.max(3, zoneRadius), 0, Math.PI * 2);
                ctx.strokeStyle = zoneColor;
                ctx.lineWidth = isZoneSelected ? 2.5 : 1;
                ctx.stroke();

                if (isZoneSelected) {
                    ctx.fillStyle = rgba(zoneColor, 0.15);
                    ctx.fill();
                }

                if (zoneRadius > 6) {
                    drawText(
                        ctx,
                        zone.type.toUpperCase().slice(0, 4),
                        zoneProjection.screenX + zoneRadius + 3,
                        zoneProjection.screenY + 3,
                        zoneColor,
                        `9px ${FONTS.data}`,
                    );
                }
            }
        }
    }
}

export function drawTargetSilhouette(ctx, sx, sy, aw, ah, target, isLocked) {
    const type = target.type || 'deer';
    const points = SILHOUETTES[type] || SILHOUETTES.deer;
    const isDowned = target.isDowned;

    ctx.save();
    if (isDowned) {
        ctx.translate(sx, sy);
        ctx.rotate(Math.PI / 2);
        ctx.translate(-sx, -sy);
    }

    const gradient = ctx.createLinearGradient(sx, sy - ah / 2, sx, sy + ah / 2);
    if (isDowned) {
        gradient.addColorStop(0, '#2a1010');
        gradient.addColorStop(1, '#100404');
    } else if (isLocked) {
        gradient.addColorStop(0, '#3a1818');
        gradient.addColorStop(1, '#1a0808');
    } else {
        gradient.addColorStop(0, '#1e2e1a');
        gradient.addColorStop(1, '#0a140a');
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    for (let index = 0; index < points.length; index++) {
        const px = sx + points[index][0] * aw;
        const py = sy + points[index][1] * ah;
        if (index === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = isDowned
        ? 'rgba(80, 20, 20, 0.5)'
        : isLocked
            ? 'rgba(80, 32, 32, 0.5)'
            : 'rgba(42, 64, 32, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (isDowned) {
        const size = Math.min(aw, ah) * 0.3;
        ctx.strokeStyle = 'rgba(255, 48, 48, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx - size, sy - size);
        ctx.lineTo(sx + size, sy + size);
        ctx.moveTo(sx + size, sy - size);
        ctx.lineTo(sx - size, sy + size);
        ctx.stroke();
    }

    ctx.restore();
}

function drawBracket(ctx, x, y, len, dx, dy) {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * -len);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * len, y);
    ctx.stroke();
}
