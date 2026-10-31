import { V3, clamp, degrees } from '../sim/math.js';
import { BoltPhysics, BOLT_CONFIG } from '../sim/physics.js';

export const ENGAGEMENT_LIMITS = {
    minRangeM: 15,
    maxRangeM: 650,
    maxTargetSpeedMps: 5,
    marginalOffAxisDeg: 12,
    maxOffAxisDeg: 20,
    minClosingVelocityMps: 20,
    maxGuidanceAccelMps2: 150,
    autoSelectBaseAngleRad: 0.15,
    autoSelectMaxRangeM: 650,
};

export const MISSION_CONSTANTS = {
    shooterPosition: [0, 0, 1.5],
    predictedTrajectoryPoints: 150,
    defaultTargetClamp: {
        downrange: [30, ENGAGEMENT_LIMITS.maxRangeM],
        lateral: [-80, 80],
    },
    defaultTargetLayout: [
        { kind: 'walkingDeer', range: 120, lateral: 0 },
        { kind: 'animal', type: 'boar', position: [150, 12, 0.40], heading: 1.2, behavior: 'walking', isMoving: true },
        { kind: 'walkingDeer', range: 180, lateral: 8 },
        { kind: 'animal', type: 'deer', position: [220, -18, 0.65], heading: 0.7, behavior: 'grazing', isMoving: false },
        { kind: 'walkingDeer', range: 240, lateral: -12 },
        { kind: 'animal', type: 'deer', position: [255, 22, 0.65], heading: -0.6, behavior: 'alert', isMoving: false },
        { kind: 'animal', type: 'elk', position: [285, 15, 0.80], heading: -0.3, behavior: 'walking', isMoving: true },
        { kind: 'animal', type: 'elk', position: [300, -25, 0.80], heading: 0.5, behavior: 'grazing', isMoving: false },
    ],
};

export function predictTargetPosition(targetPosition, targetVelocity, timeOfFlightS) {
    return V3.addScaled(targetPosition, targetVelocity || [0, 0, 0], timeOfFlightS);
}

export function computeBallisticCompensatedDirection({
    scopeDirection,
    scopePosition,
    targetPosition,
    initialVelocity,
}) {
    const direction = V3.copy(scopeDirection);
    const toTarget = V3.sub(targetPosition, scopePosition);
    const range = V3.mag(toTarget);
    if (range <= 0 || initialVelocity <= 0) {
        return V3.normalize(direction);
    }

    // 6-DOF ballistic solver: uses the actual physics engine (unguided)
    // to find the launch elevation that hits the target.
    // This accounts for all aerodynamic effects: drag, body lift, fin lift,
    // Reynolds correction, pitch damping, etc.
    const physics = new BoltPhysics();
    const horizRange = V3.mag([toTarget[0], toTarget[1], 0]);
    const targetDz = toTarget[2];
    const simDt = 0.002;

    let aimUp = 0;
    for (let iter = 0; iter < 15; iter++) {
        // Build launch direction with current aimUp applied to scope direction
        const hMag = Math.sqrt(direction[0] ** 2 + direction[1] ** 2);
        const trialDir = V3.normalize([
            direction[0],
            direction[1],
            direction[2] * Math.cos(aimUp) + hMag * Math.sin(aimUp),
        ]);

        let state = physics.createLaunchState(scopePosition, trialDir, initialVelocity);
        let zAtRange = null;

        for (let step = 0; step < 15000; step++) {
            if (!state.inFlight) break;
            const prevX = state.position[0];
            state = physics.step(state, simDt, 0, 0);
            // Interpolate Z at target range crossing
            if (prevX < horizRange && state.position[0] >= horizRange) {
                const frac = (horizRange - prevX) / (state.position[0] - prevX);
                zAtRange = state.position[2] - (1 - frac) * state.velocity[2] * simDt;
                break;
            }
        }

        if (zAtRange === null) {
            aimUp += 0.03;
            continue;
        }

        const dropError = (zAtRange - scopePosition[2]) - targetDz;
        if (Math.abs(dropError) < 0.001) break;

        aimUp += Math.atan2(-dropError, horizRange) * 0.7;
        aimUp = clamp(aimUp, -0.5, 1.5);
    }

    const horizontalMagnitude = Math.sqrt(direction[0] ** 2 + direction[1] ** 2);
    direction[2] = direction[2] * Math.cos(aimUp) + horizontalMagnitude * Math.sin(aimUp);
    return V3.normalize(direction);
}

export function evaluatePreFireSolution({
    scopePosition,
    scopeDirection,
    launchDirection = scopeDirection,
    targetPosition,
    targetVelocity = [0, 0, 0],
    initialVelocity,
    limits = ENGAGEMENT_LIMITS,
}) {
    const rangeToTarget = V3.mag(V3.sub(targetPosition, scopePosition));
    const timeOfFlight = initialVelocity > 0 ? rangeToTarget / initialVelocity : Infinity;
    const predictedTarget = predictTargetPosition(targetPosition, targetVelocity, timeOfFlight);
    const lineOfSight = V3.sub(predictedTarget, scopePosition);
    const lineOfSightRange = V3.mag(lineOfSight);

    if (lineOfSightRange < 0.1) {
        return null;
    }

    const lineOfSightUnit = V3.scale(lineOfSight, 1 / lineOfSightRange);
    const aimDot = clamp(V3.dot(launchDirection, lineOfSightUnit), -1, 1);
    const offAxisDeg = degrees(Math.acos(aimDot));
    const targetSpeed = V3.mag(targetVelocity);
    const lateralOffset = V3.mag(V3.cross(lineOfSight, launchDirection));
    const requiredLateralVelocity = timeOfFlight > 0 ? lateralOffset / timeOfFlight : Infinity;
    const achievableCorrection = 0.5 * limits.maxGuidanceAccelMps2 * timeOfFlight * timeOfFlight;
    const closingVelocity = initialVelocity * aimDot;

    let feasibility = 'GOOD';
    let feasibilityReason = 'Shot is feasible';

    if (rangeToTarget > limits.maxRangeM) {
        feasibility = 'NO_SHOT';
        feasibilityReason = `Target too far: ${rangeToTarget.toFixed(0)}m`;
    } else if (rangeToTarget < limits.minRangeM) {
        feasibility = 'MARGINAL';
        feasibilityReason = 'Very close - limited guidance time';
    } else if (targetSpeed > limits.maxTargetSpeedMps) {
        feasibility = 'NO_SHOT';
        feasibilityReason = `Target moving too fast: ${targetSpeed.toFixed(1)}m/s`;
    } else if (offAxisDeg > limits.maxOffAxisDeg) {
        feasibility = 'NO_SHOT';
        feasibilityReason = `Target off-axis: ${offAxisDeg.toFixed(1)}°`;
    } else if (offAxisDeg > limits.marginalOffAxisDeg) {
        feasibility = 'MARGINAL';
        feasibilityReason = `Large correction needed: ${offAxisDeg.toFixed(1)}°`;
    } else if (closingVelocity < limits.minClosingVelocityMps) {
        feasibility = 'NO_SHOT';
        feasibilityReason = 'Not closing on target';
    } else if (requiredLateralVelocity > limits.maxGuidanceAccelMps2 * 0.5) {
        feasibility = 'MARGINAL';
        feasibilityReason = 'High maneuver load required';
    }

    const dropVector = [0, 0, -0.5 * 9.81 * timeOfFlight * timeOfFlight];
    const interceptPoint = V3.add(
        V3.add(scopePosition, V3.scale(launchDirection, rangeToTarget)),
        dropVector,
    );
    const unguidedMiss = V3.mag(V3.sub(interceptPoint, predictedTarget));
    const guidedCorrection = Math.min(achievableCorrection, lateralOffset);
    const guidedMissEstimate = Math.max(0, unguidedMiss - guidedCorrection);

    return {
        feasibility,
        feasibilityReason,
        range_m: rangeToTarget,
        tof_estimate: timeOfFlight,
        off_axis_deg: offAxisDeg,
        closing_velocity: closingVelocity,
        predicted_target: predictedTarget,
        intercept_point: interceptPoint,
        unguided_miss: unguidedMiss,
        guided_miss_estimate: guidedMissEstimate,
        required_maneuver_g: requiredLateralVelocity / 9.81,
        max_available_g: limits.maxGuidanceAccelMps2 / 9.81,
    };
}

export function getSelectableTargetMetrics({
    scopePosition,
    scopeDirection,
    targetPosition,
    zoom = 1,
    limits = ENGAGEMENT_LIMITS,
}) {
    const toTarget = V3.sub(targetPosition, scopePosition);
    const range = V3.mag(toTarget);
    if (range < 1 || range > limits.autoSelectMaxRangeM) {
        return { isSelectable: false, range, angle: Infinity };
    }

    const targetUnit = V3.normalize(toTarget);
    const dot = clamp(V3.dot(scopeDirection, targetUnit), -1, 1);
    const angle = Math.acos(dot);
    const maxAngle = limits.autoSelectBaseAngleRad / Math.max(zoom, 0.5);

    return {
        isSelectable: angle < maxAngle,
        range,
        angle,
    };
}
