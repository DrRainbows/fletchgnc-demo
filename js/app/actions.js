import { V3, clamp, degrees } from '../sim/math.js';
import { BOLT_CONFIG } from '../sim/physics.js';
import { FlightMode } from '../sim/gnc.js';
import {
    computeBallisticCompensatedDirection,
    evaluatePreFireSolution,
    getSelectableTargetMetrics,
    MISSION_CONSTANTS,
} from '../domain/engagement-rules.js';
import { APP_RUNTIME_CONSTANTS } from './runtime-constants.js';

export function createActionLayer(context) {
    const {
        dom,
        effects,
        flightComputer,
        panels,
        physics,
        store,
        window,
        world,
        imu,
    } = context;

    function applyWindSettings({ velocity, gustIntensity }) {
        physics.windVelocity = velocity;
        physics.windGustIntensity = gustIntensity;
        store.batch(() => {
            store.set('windVelocity', velocity);
            store.set('windGustIntensity', gustIntensity);
        });
    }

    function initializeWindFromState() {
        if (store.windVelocity && V3.mag(store.windVelocity) > 0.01) {
            physics.windVelocity = V3.copy(store.windVelocity);
            physics.windGustIntensity = store.windGustIntensity;
            return;
        }

        setRandomWind();
    }

    function setRandomWind() {
        const speed = 2 + Math.random() * 6;
        const bearing = Math.random() * Math.PI * 2;
        const velocity = [
            speed * Math.cos(bearing),
            speed * Math.sin(bearing),
            (Math.random() - 0.5) * 0.5,
        ];
        const gustIntensity = Math.random() * 1.5;
        applyWindSettings({ velocity, gustIntensity });
    }

    function getAimPoint(target = store.selectedTarget) {
        if (!target) {
            return null;
        }

        return world.computeLeadAngle(
            store.scopePosition,
            target,
            BOLT_CONFIG.initialVelocity,
            store.selectedZone,
        );
    }

    function getScopeDirection() {
        const azimuth = store.scopeAzimuth;
        const elevation = store.scopeElevation;
        return [
            Math.cos(elevation) * Math.cos(azimuth),
            Math.cos(elevation) * Math.sin(azimuth),
            Math.sin(elevation),
        ];
    }

    function applyBallisticCompensation(scopeDirection) {
        const aimPoint = getAimPoint();
        if (!aimPoint) {
            return V3.copy(scopeDirection);
        }

        return computeBallisticCompensatedDirection({
            scopeDirection,
            scopePosition: store.scopePosition,
            targetPosition: aimPoint,
            initialVelocity: BOLT_CONFIG.initialVelocity,
        });
    }

    function updateHeaderBadges() {
        if (!dom.modeBadge || !dom.armedBadge || !dom.scopePanel) {
            return;
        }

        const mode = store.flightMode || FlightMode.IDLE;
        dom.modeBadge.textContent = mode;
        dom.modeBadge.className = 'mode-badge';
        if ([FlightMode.BOOST, FlightMode.MIDCOURSE, FlightMode.TERMINAL].includes(mode)) {
            dom.modeBadge.classList.add('flight');
        } else if (mode === FlightMode.IMPACT) {
            dom.modeBadge.classList.add('impact');
        } else if (mode === FlightMode.MISS) {
            dom.modeBadge.classList.add('miss');
        }

        dom.armedBadge.className = store.isArmed ? 'armed-badge' : 'armed-badge hidden';
        dom.scopePanel.classList.toggle('armed', store.isArmed);
    }

    function renderLeaderboard() {
        if (!dom.leaderboardBody) {
            return;
        }

        const leaderboard = store.leaderboard;
        if (!leaderboard || leaderboard.length === 0) {
            dom.leaderboardBody.innerHTML = '<div class="lb-empty">No shots recorded yet.</div>';
            return;
        }

        dom.leaderboardBody.innerHTML = leaderboard.map((entry, index) => `
        <div class="lb-entry ${entry.isHit ? 'lb-hit' : 'lb-miss'}">
            <span class="lb-rank">#${index + 1}</span>
            <span class="lb-zone">${entry.zone}</span>
            <span class="lb-range">${entry.range.toFixed(0)}m</span>
            <span class="lb-miss">${entry.missDistance.toFixed(3)}m</span>
            <span class="lb-time">${entry.flightTime.toFixed(3)}s</span>
        </div>
    `).join('');
    }

    function selectTarget(target) {
        if (!target || store.isArmed || store.inFlight || store.replayActive) {
            return;
        }

        store.set('selectedTarget', target);

        const aimPoint = getAimPoint(target);
        const toTarget = V3.sub(aimPoint || target.position, store.scopePosition);
        const distance = V3.mag(toTarget);
        if (distance > 0) {
            store.batch(() => {
                store.set('scopeAzimuth', Math.atan2(toTarget[1], toTarget[0]));
                store.set('scopeElevation', Math.atan2(
                    toTarget[2],
                    Math.sqrt(toTarget[0] ** 2 + toTarget[1] ** 2),
                ));
            });
        }

        panels.telemetry?.addLog(
            `Target T${target.id + 1}: ${target.type.toUpperCase()} @ ${distance.toFixed(0)}m`,
        );
    }

    function computePreFire(scopeDirection) {
        const target = store.selectedTarget;
        if (!target) {
            return null;
        }

        const launchDirection = applyBallisticCompensation(scopeDirection);
        const predictedTrajectory = flightComputer.computePredictedTrajectory(
            store.scopePosition,
            launchDirection,
            BOLT_CONFIG.initialVelocity,
            MISSION_CONSTANTS.predictedTrajectoryPoints,
        );
        store.set('predictedTrajectory', predictedTrajectory);

        const preFire = evaluatePreFireSolution({
            scopePosition: store.scopePosition,
            scopeDirection,
            launchDirection,
            targetPosition: getAimPoint(target),
            targetVelocity: target.velocity,
            initialVelocity: BOLT_CONFIG.initialVelocity,
        });

        if (!preFire) {
            store.set('preFire', null);
            return null;
        }

        if (preFire.feasibility === 'NO_SHOT') {
            store.batch(() => {
                store.set('isArmed', false);
                store.set('lockedTargetId', -1);
                store.set('preFire', null);
                store.set('predictedTrajectory', []);
            });
            flightComputer.reset();
            panels.telemetry?.addLog(`Auto-disarmed: ${preFire.feasibilityReason}`);
            updateHeaderBadges();
            return preFire;
        }

        store.set('preFire', preFire);
        return preFire;
    }

    function toggleArm() {
        if (store.isArmed) {
            store.batch(() => {
                store.set('isArmed', false);
                store.set('lockedTargetId', -1);
            });
            flightComputer.reset();
            panels.telemetry?.addLog('Disarmed');
            updateHeaderBadges();
            return;
        }

        if (!store.selectedTarget) {
            panels.telemetry?.addLog('No target selected');
            return;
        }

        const scopeDirection = getScopeDirection();
        const launchDirection = applyBallisticCompensation(scopeDirection);
        const aimPoint = getAimPoint(store.selectedTarget);
        const preFire = evaluatePreFireSolution({
            scopePosition: store.scopePosition,
            scopeDirection,
            launchDirection,
            targetPosition: aimPoint,
            targetVelocity: store.selectedTarget.velocity,
            initialVelocity: BOLT_CONFIG.initialVelocity,
        });

        if (!preFire || preFire.feasibility === 'NO_SHOT') {
            panels.telemetry?.addLog(
                `No-shot: ${preFire?.feasibilityReason ?? 'invalid targeting solution'}`,
            );
            return;
        }

        flightComputer.loadMission(aimPoint, store.selectedTarget.velocity, scopeDirection);
        flightComputer.arm();

        store.batch(() => {
            store.set('isArmed', true);
            store.set('lockedTargetId', store.selectedTarget.id);
            store.set('boltNumber', store.boltNumber + 1);
            store.set('preFire', preFire);
        });

        const distance = V3.mag(V3.sub(store.selectedTarget.position, store.scopePosition));
        panels.telemetry?.addLog(
            `BOLT #${store.boltNumber} ARMED: ${store.selectedZone.toUpperCase()} @ ${distance.toFixed(0)}m`,
        );
        updateHeaderBadges();
    }

    function fire() {
        if (!store.isArmed) {
            panels.telemetry?.addLog('Not armed');
            return;
        }
        if (store.inFlight) {
            panels.telemetry?.addLog('Already in flight');
            return;
        }

        const launchDirection = applyBallisticCompensation(getScopeDirection());
        const boltState = physics.createLaunchState(store.scopePosition, launchDirection);
        flightComputer.launch(boltState);
        imu.reset();

        store.batch(() => {
            store.set('boltState', boltState);
            store.set('trajectory', []);
            store.set('flightLog', []);
            store.set('impactPos', null);
            store.set('inFlight', true);
            store.set('shotsFired', store.shotsFired + 1);
            store.set('flightMode', FlightMode.BOOST);
            store.set('guidanceCmd', null);
            store.set('navState', null);
            store.set('lastPredictedTrajectory', [...(store.predictedTrajectory || [])]);
        });

        panels.telemetry?.addLog(`BOLT #${store.boltNumber} FIRED!`);
        effects.fireFlash.trigger();
        effects.postFlight.hide();
        updateHeaderBadges();
    }

    function endFlight() {
        const boltState = store.boltState;
        if (!boltState) {
            return;
        }

        store.set('inFlight', false);

        let isHit = false;
        let hitZoneName = 'BODY';
        let missDistance = 0;

        const hitResults = world.checkAllHits(boltState.position, boltState.velocity);
        if (hitResults.length > 0) {
            const { target, zone, distance } = hitResults[0];
            store.set('hits', store.hits + 1);
            missDistance = Number.isFinite(distance) ? distance : 0;
            store.set('lastMissDistance', missDistance);
            hitZoneName = zone ? zone.toUpperCase() : 'BODY';
            isHit = true;
            if (target) {
                target.isDowned = true;
            }
            panels.telemetry?.addLog(`HIT! ${hitZoneName} ${missDistance.toFixed(3)}m`);
        } else if (store.selectedTarget) {
            missDistance = V3.mag(V3.sub(boltState.position, store.selectedTarget.vitalCenter));
            store.set('lastMissDistance', missDistance);
            panels.telemetry?.addLog(`MISS - ${missDistance.toFixed(3)}m`);
        } else {
            panels.telemetry?.addLog('MISS');
        }

        store.set('impactPos', V3.copy(boltState.position));
        store.set('flightMode', flightComputer.mode);

        const hitRate = store.shotsFired > 0
            ? (store.hits / store.shotsFired * 100).toFixed(0)
            : '--';
        panels.telemetry?.addLog(`${store.hits}/${store.shotsFired} (${hitRate}%)`);
        if (dom.shotCounter) {
            dom.shotCounter.textContent = `${store.hits}/${store.shotsFired}`;
        }

        effects.impactFlash.trigger(isHit);
        effects.shake.trigger(isHit ? 8 : 4);

        const vitalZones = ['heart', 'lungs', 'head'];
        if (isHit && vitalZones.includes(hitZoneName.toLowerCase())) {
            effects.killCam.trigger(boltState.position, store.scopePosition);
        }

        let maxAoA = 0;
        let maxFinDeflection = 0;
        let maxAccelG = 0;
        for (const entry of store.trajectory) {
            maxAoA = Math.max(maxAoA, Math.abs(degrees(entry.angleOfAttack || 0)));
            const finMagnitude = Math.sqrt(
                (entry.actualFinPitch || 0) ** 2 + (entry.actualFinYaw || 0) ** 2,
            );
            maxFinDeflection = Math.max(maxFinDeflection, degrees(finMagnitude));
        }

        for (const entry of store.flightLog) {
            if (!entry.guidanceCmd) {
                continue;
            }
            maxAccelG = Math.max(maxAccelG, V3.mag(entry.guidanceCmd.accelCmd || [0, 0, 0]) / 9.81);
        }

        const range = store.selectedTarget
            ? V3.mag(V3.sub(store.selectedTarget.position, store.scopePosition))
            : 0;

        effects.postFlight.show({
            hit: isHit,
            zone: hitZoneName,
            boltNumber: store.boltNumber,
            targetType: store.selectedTarget ? store.selectedTarget.type.toUpperCase() : 'UNKNOWN',
            range: range.toFixed(0),
            missDistance,
            flightTime: store.flightTime,
            impactSpeed: boltState.speed || 0,
            maxAoA,
            maxFinDefl: maxFinDeflection,
            maxAccelG,
            hits: store.hits,
            shotsFired: store.shotsFired,
            hitRate,
        });

        store.batch(() => {
            store.set('isArmed', false);
            store.set('lockedTargetId', -1);
        });
        flightComputer.reset();
        effects.replay.enter();

        const leaderboardEntry = {
            boltNumber: store.boltNumber,
            range,
            missDistance,
            zone: hitZoneName,
            targetType: store.selectedTarget ? store.selectedTarget.type : 'unknown',
            flightTime: store.flightTime,
            isHit,
            date: new Date().toISOString(),
        };
        const leaderboard = [...(store.leaderboard || []), leaderboardEntry]
            .sort((a, b) => {
                if (a.isHit !== b.isHit) {
                    return a.isHit ? -1 : 1;
                }
                return a.missDistance - b.missDistance;
            })
            .slice(0, 10);
        store.set('leaderboard', leaderboard);
        store.saveToStorage();
        updateHeaderBadges();
    }

    function updateFlight(dt) {
        const numberOfSteps = Math.min(
            Math.round(dt / APP_RUNTIME_CONSTANTS.physicsDt),
            APP_RUNTIME_CONSTANTS.maxSubsteps,
        );
        let boltState = store.boltState;

        for (let step = 0; step < numberOfSteps; step++) {
            if (!boltState?.inFlight) {
                break;
            }

            const forces = physics.computeForcesAndMoments(boltState);
            const acceleration = V3.scale(forces.force, 1 / BOLT_CONFIG.mass);
            const imuData = imu.sample(boltState, acceleration);
            const [finPitch, finYaw] = flightComputer.update(
                imuData,
                APP_RUNTIME_CONSTANTS.physicsDt,
            );
            boltState = physics.step(
                boltState,
                APP_RUNTIME_CONSTANTS.physicsDt,
                finPitch,
                finYaw,
            );
        }

        if (!boltState) {
            return;
        }

        store.batch(() => {
            store.set('boltState', boltState);
            store.set('flightTime', flightComputer.getFlightTime());
            store.set('flightMode', flightComputer.mode);

            const trajectory = store.trajectory;
            if (
                trajectory.length === 0
                || boltState.time - trajectory[trajectory.length - 1].time >= 0.01
            ) {
                trajectory.push({
                    position: V3.copy(boltState.position),
                    velocity: V3.copy(boltState.velocity),
                    quaternion: [...boltState.quaternion],
                    angularVelocity: V3.copy(boltState.angularVelocity),
                    time: boltState.time,
                    speed: boltState.speed,
                    angleOfAttack: boltState.angleOfAttack,
                    actualFinPitch: boltState.actualFinPitch,
                    actualFinYaw: boltState.actualFinYaw,
                    eulerAngles: boltState.eulerAngles,
                    finPitch: boltState.finPitch,
                    finYaw: boltState.finYaw,
                });
                store.set('trajectory', trajectory);
            }

            store.set('flightLog', flightComputer.flightLog);
            store.set('navState', flightComputer.getNavState());

            const lastLog = flightComputer.flightLog.length > 0
                ? flightComputer.flightLog[flightComputer.flightLog.length - 1]
                : null;
            if (lastLog?.guidanceCmd) {
                store.set('guidanceCmd', lastLog.guidanceCmd);
            }
        });

        if (!boltState.inFlight || flightComputer.isFlightComplete()) {
            endFlight();
        }
    }

    function autoSelectTarget(scopeDirection, zoom = 1) {
        let bestTarget = null;
        let bestAngle = Infinity;

        for (const target of world.targets) {
            if (target.isDowned) {
                continue;
            }

            const metrics = getSelectableTargetMetrics({
                scopePosition: store.scopePosition,
                scopeDirection,
                targetPosition: target.position,
                zoom,
            });
            if (!metrics.isSelectable || metrics.angle >= bestAngle) {
                continue;
            }

            bestTarget = target;
            bestAngle = metrics.angle;
        }

        if (bestTarget && bestTarget !== store.selectedTarget) {
            store.set('selectedTarget', bestTarget);
        }
    }

    function update(dt) {
        world.update(dt);
        store.set('targets', world.targets);
        store.set('worldTime', world.time);

        const scopeDirection = getScopeDirection();
        if (!store.isArmed && !store.inFlight && !store.replayActive) {
            autoSelectTarget(scopeDirection, store.scopeZoom || 1);
        }

        if (store.isArmed && store.selectedTarget) {
            computePreFire(scopeDirection);
        } else {
            store.batch(() => {
                store.set('preFire', null);
                store.set('predictedTrajectory', []);
            });
        }

        if (store.inFlight && store.boltState) {
            updateFlight(dt);
        }

        if (store.selectedTarget && (store.isArmed || store.inFlight)) {
            const aimPoint = getAimPoint(store.selectedTarget);
            flightComputer.updateMissionTarget(aimPoint, store.selectedTarget.velocity);
            store.set('leadPoint', V3.copy(aimPoint));
        } else {
            store.set('leadPoint', null);
        }

        updateHeaderBadges();
    }

    function render() {
        panels.scope?.invalidate();

        if (store.inFlight) {
            panels.flight3d?.invalidate();
            panels.cgbody?.invalidate();
            panels.charts?.invalidate();
            panels.telemetry?.invalidate();
        }

        if (!store.inFlight) {
            panels.flight3d?.invalidate();
        }

        if (store.replayActive) {
            panels.flight3d?.invalidate();
            panels.cgbody?.invalidate();
            panels.charts?.invalidate();
        }

        for (const panel of Object.values(panels)) {
            panel.renderIfNeeded?.(store);
        }
    }

    function resetSim() {
        store.batch(() => {
            store.set('inFlight', false);
            store.set('boltState', null);
            store.set('trajectory', []);
            store.set('flightLog', []);
            store.set('predictedTrajectory', []);
            store.set('lastPredictedTrajectory', []);
            store.set('leadPoint', null);
            store.set('impactPos', null);
            store.set('isArmed', false);
            store.set('lockedTargetId', -1);
            store.set('preFire', null);
            store.set('flightMode', FlightMode.IDLE);
            store.set('flightTime', 0);
            store.set('guidanceCmd', null);
            store.set('navState', null);
        });

        flightComputer.reset();
        imu.reset();
        world.reset();
        effects.postFlight.hide();
        effects.impactFlash.trigger(false);
        effects.replay.exit();

        store.set('targets', world.targets);
        setRandomWind();
        panels.telemetry?.addLog('Reset');
        updateHeaderBadges();
    }

    function exportFlightData() {
        if (!store.trajectory || store.trajectory.length === 0) {
            panels.telemetry?.addLog('No flight data to export');
            return;
        }

        const payload = {
            summary: {
                boltNumber: store.boltNumber,
                flightTime: store.flightTime,
                impactPos: store.impactPos,
                scopePos: store.scopePosition,
                targetType: store.selectedTarget ? store.selectedTarget.type : null,
                missDistance: store.lastMissDistance,
                windVelocity: store.windVelocity,
                windGustIntensity: store.windGustIntensity,
                shotsFired: store.shotsFired,
                hits: store.hits,
                exportTime: new Date().toISOString(),
            },
            trajectory: store.trajectory.map((frame) => ({
                t: frame.time,
                pos: frame.position,
                vel: frame.velocity,
                quat: frame.quaternion,
                aoa: frame.angleOfAttack,
                speed: frame.speed,
                finPitch: frame.actualFinPitch,
                finYaw: frame.actualFinYaw,
            })),
            predictedTrajectory: store.lastPredictedTrajectory || [],
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `fletchgnc-bolt-${store.boltNumber}-${Date.now()}.json`;
        anchor.click();
        window.URL.revokeObjectURL(url);
        panels.telemetry?.addLog(`EXPORTED BOLT #${store.boltNumber}`);
    }

    return {
        applyBallisticCompensation,
        applyWindSettings,
        autoSelectTarget,
        computePreFire,
        endFlight,
        exportFlightData,
        fire,
        getAimPoint,
        getScopeDirection,
        initializeWindFromState,
        render,
        renderLeaderboard,
        resetSim,
        selectTarget,
        setRandomWind,
        toggleArm,
        update,
        updateFlight,
        updateHeaderBadges,
    };
}
