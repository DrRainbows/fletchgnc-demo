import {
    computeBallisticCompensatedDirection,
    MISSION_CONSTANTS,
} from '../../js/domain/engagement-rules.js';
import { FlightComputer, SimulatedIMU } from '../../js/sim/gnc.js';
import { V3 } from '../../js/sim/math.js';
import { BOLT_CONFIG, BoltPhysics } from '../../js/sim/physics.js';
import { HitZone, TargetType, World } from '../../js/sim/world.js';

export function runHeadlessScenario({
    targetRange = 200,
    targetLateral = 0,
    targetHeight = 1.2,
    targetType = TargetType.DEER,
    targetHeading = 0,
    targetSpeed = 0,
    targetBehavior = 'grazing',
    aimZone = HitZone.HEART,
    navConstant = 3.5,
    guidanceType = 'blended',
    windVelocity = [0, 0, 0],
    windGustIntensity = 0,
    physicsDt = 0.001,
    maxSteps = 12000,
}) {
    const world = new World();
    const target = world.addTarget(
        targetType,
        [targetRange, targetLateral, targetHeight],
        targetHeading,
    );

    // Set target motion
    if (targetSpeed > 0) {
        target.isMoving = true;
        target.behavior = targetBehavior;
        target.velocity = [
            Math.cos(targetHeading) * targetSpeed,
            Math.sin(targetHeading) * targetSpeed,
            0,
        ];
    }

    // Compute aim point (lead angle for movers)
    const scopePosition = [...MISSION_CONSTANTS.shooterPosition];
    const aimPoint = world.computeLeadAngle(
        scopePosition, target, BOLT_CONFIG.initialVelocity, aimZone,
    );

    const scopeDirection = V3.normalize(V3.sub(aimPoint, scopePosition));
    const launchDirection = computeBallisticCompensatedDirection({
        scopeDirection,
        scopePosition,
        targetPosition: aimPoint,
        initialVelocity: BOLT_CONFIG.initialVelocity,
    });

    const physics = new BoltPhysics();
    physics.windVelocity = [...windVelocity];
    physics.windGustIntensity = windGustIntensity;

    const flightComputer = new FlightComputer(navConstant, guidanceType);
    const imu = new SimulatedIMU();
    flightComputer.loadMission(aimPoint, target.velocity, scopeDirection);
    flightComputer.arm();

    let boltState = physics.createLaunchState(scopePosition, launchDirection);
    flightComputer.launch(boltState);
    imu.reset();

    let hit = false;
    let hitZone = null;
    let hitDistance = Infinity;
    let minRange = Infinity;

    for (let step = 0; step < maxSteps; step++) {
        if (!boltState.inFlight) break;

        // Update target position for movers
        if (target.isMoving) {
            world.update(physicsDt);
            // Update flight computer with new target position
            const newAimPoint = world.computeLeadAngle(
                scopePosition, target, BOLT_CONFIG.initialVelocity, aimZone,
            );
            flightComputer.updateMissionTarget(newAimPoint, target.velocity);
        }

        const { force } = physics.computeForcesAndMoments(boltState);
        const acceleration = V3.scale(force, 1 / BOLT_CONFIG.mass);
        const imuData = imu.sample(boltState, acceleration);
        const [finPitch, finYaw] = flightComputer.update(imuData, physicsDt);
        boltState = physics.step(boltState, physicsDt, finPitch, finYaw);

        // Check hit with penetration ray-cast
        const hitResults = world.checkAllHits(boltState.position, boltState.velocity);
        if (hitResults.length > 0) {
            hit = true;
            hitZone = hitResults[0].zone;
            hitDistance = hitResults[0].distance;
            break;
        }

        // Track closest approach to aim zone
        const zoneWorldPos = target.hitZones.find(z => z.type === aimZone);
        const zoneCenter = zoneWorldPos
            ? target.getZoneWorldPosition(zoneWorldPos)
            : target.vitalCenter;
        const dist = V3.mag(V3.sub(boltState.position, zoneCenter));
        if (dist < minRange) minRange = dist;

        if (flightComputer.isFlightComplete()) break;
    }

    // Compute actual distance from impact to aimed organ center
    const zoneForMiss = target.hitZones.find(z => z.type === aimZone);
    const aimCenter = zoneForMiss
        ? target.getZoneWorldPosition(zoneForMiss)
        : target.vitalCenter;
    const organMiss = V3.mag(V3.sub(boltState.position, aimCenter));
    const vitalMiss = V3.mag(V3.sub(boltState.position, target.vitalCenter));

    // Get wind estimate from nav state if available
    const navState = flightComputer.getNavState();

    // For zone hits via ray-cast, hitDistance is the ray-sphere closest approach
    // which is the TRUE accuracy measure (how close the bolt passed to the organ center)
    const trueOrganMiss = (hit && hitZone && isFinite(hitDistance)) ? hitDistance : organMiss;

    return {
        hit,
        hitZone,
        hitDistance: isFinite(hitDistance) ? hitDistance : organMiss,
        missDistance: hit ? trueOrganMiss : minRange,
        organMiss: trueOrganMiss,
        vitalMissDistance: vitalMiss,
        finalPosition: V3.copy(boltState.position),
        targetFinalPosition: V3.copy(target.position),
        finalSpeed: boltState.speed,
        flightMode: flightComputer.mode,
        flightTime: flightComputer.getFlightTime(),
        windEstimate: navState.windEstimate || [0, 0, 0],
    };
}
