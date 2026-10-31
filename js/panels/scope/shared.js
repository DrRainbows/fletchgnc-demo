import { V3 } from '../../sim/math.js';
import { HitZone } from '../../sim/world.js';

export const ZONES = [
    HitZone.HEART,
    HitZone.LUNGS,
    HitZone.HEAD,
    HitZone.NECK,
    HitZone.SPINE,
];

export const ZONE_COLORS = {
    [HitZone.HEART]: '#ff3030',
    [HitZone.LUNGS]: '#ff6060',
    [HitZone.HEAD]: '#ffaa30',
    [HitZone.NECK]: '#dd8820',
    [HitZone.SPINE]: '#ffc830',
    [HitZone.GUT]: '#808080',
    [HitZone.LEG]: '#606060',
    [HitZone.BODY]: '#505050',
};

// Normalized silhouette paths per target type (x: -0.5..0.5, y: -0.5..0.5, origin = center)
export const SILHOUETTES = {
    deer: [
        [-0.5, 0.15], [-0.45, 0.0], [-0.3, -0.05], [-0.15, -0.1], [0.0, -0.12],
        [0.15, -0.08], [0.25, -0.15], [0.30, -0.25], [0.35, -0.45], [0.38, -0.5],
        [0.38, -0.35], [0.35, -0.2], [0.40, -0.1], [0.50, 0.0], [0.45, 0.15],
        [0.42, 0.5], [0.38, 0.5], [0.35, 0.15], [0.20, 0.15], [0.15, 0.5],
        [0.10, 0.5], [0.08, 0.15], [-0.15, 0.15], [-0.20, 0.5], [-0.25, 0.5],
        [-0.22, 0.15], [-0.40, 0.15], [-0.43, 0.5], [-0.48, 0.5], [-0.48, 0.15],
    ],
    elk: [
        [-0.5, 0.1], [-0.40, -0.05], [-0.2, -0.1], [0.0, -0.15], [0.15, -0.12],
        [0.25, -0.2], [0.30, -0.35], [0.35, -0.5], [0.38, -0.5],
        [0.38, -0.3], [0.35, -0.15], [0.42, -0.05], [0.50, 0.05], [0.45, 0.15],
        [0.42, 0.5], [0.38, 0.5], [0.35, 0.15], [0.18, 0.15], [0.14, 0.5],
        [0.09, 0.5], [0.07, 0.15], [-0.18, 0.15], [-0.22, 0.5], [-0.27, 0.5],
        [-0.24, 0.15], [-0.42, 0.15], [-0.45, 0.5], [-0.50, 0.5], [-0.50, 0.1],
    ],
    boar: [
        [-0.5, 0.1], [-0.40, -0.05], [-0.15, -0.12], [0.0, -0.15], [0.15, -0.15],
        [0.30, -0.12], [0.40, -0.18], [0.48, -0.25], [0.50, -0.2],
        [0.50, -0.1], [0.45, 0.0], [0.48, 0.1], [0.45, 0.15],
        [0.42, 0.5], [0.38, 0.5], [0.35, 0.1], [0.15, 0.1], [0.12, 0.5],
        [0.07, 0.5], [0.05, 0.1], [-0.20, 0.1], [-0.23, 0.5], [-0.28, 0.5],
        [-0.25, 0.1], [-0.42, 0.1], [-0.45, 0.5], [-0.50, 0.5], [-0.50, 0.1],
    ],
};

export function getScopeBasis(scopeDirection) {
    const up = [0, 0, 1];
    let right = V3.cross(scopeDirection, up);
    if (V3.mag(right) < 0.01) {
        right = [0, 1, 0];
    }

    right = V3.normalize(right);
    const camUp = V3.cross(right, scopeDirection);
    return { right, camUp };
}

export function projectToScope({
    point,
    scopePosition,
    scopeDirection,
    right,
    camUp,
    effFovH,
    effFovV,
    width,
    height,
    centerX = width / 2,
    centerY = height / 2,
}) {
    const toPoint = V3.sub(point, scopePosition);
    const distance = V3.mag(toPoint);
    if (distance < 0.1) {
        return null;
    }

    const pointUnit = V3.scale(toPoint, 1 / distance);
    const forward = V3.dot(pointUnit, scopeDirection);
    if (forward < 0) {
        return null;
    }

    const horizontalAngle = Math.atan2(V3.dot(pointUnit, right), forward);
    const verticalAngle = Math.atan2(V3.dot(pointUnit, camUp), forward);

    return {
        distance,
        forward,
        horizontalAngle,
        verticalAngle,
        screenX: centerX + (horizontalAngle / effFovH) * width,
        screenY: centerY - (verticalAngle / effFovV) * height,
    };
}
