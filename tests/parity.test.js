import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
    computeBallisticCompensatedDirection,
    evaluatePreFireSolution,
} from '../js/domain/engagement-rules.js';
import { FlightComputer } from '../js/sim/gnc.js';
import { runHeadlessScenario } from './helpers/headless-sim.js';

const FIXTURES = JSON.parse(
    readFileSync(new URL('../../tests/fixtures/parity-scenarios.json', import.meta.url), 'utf8'),
);

describe('browser parity fixtures', () => {
    it('matches shared pre-fire classifications', () => {
        for (const scenario of FIXTURES.preFire) {
            const launchDirection = computeBallisticCompensatedDirection({
                scopeDirection: scenario.scopeDirection,
                scopePosition: scenario.scopePosition,
                targetPosition: scenario.targetPosition,
                initialVelocity: scenario.initialVelocity,
            });
            const solution = evaluatePreFireSolution({
                scopePosition: scenario.scopePosition,
                scopeDirection: scenario.scopeDirection,
                launchDirection,
                targetPosition: scenario.targetPosition,
                targetVelocity: scenario.targetVelocity,
                initialVelocity: scenario.initialVelocity,
            });

            expect(solution, scenario.id).not.toBeNull();
            expect(solution.feasibility, scenario.id).toBe(scenario.expectedFeasibility);
        }
    });

    it('validates predicted trajectory shape and mission loading', () => {
        for (const scenario of FIXTURES.predictedTrajectory) {
            const launchDirection = computeBallisticCompensatedDirection({
                scopeDirection: scenario.scopeDirection,
                scopePosition: scenario.scopePosition,
                targetPosition: scenario.targetPosition,
                initialVelocity: scenario.initialVelocity,
            });
            const flightComputer = new FlightComputer();
            flightComputer.loadMission(
                scenario.targetPosition,
                scenario.targetVelocity,
                scenario.scopeDirection,
            );
            flightComputer.arm();

            const mission = flightComputer.getMission();
            expect(mission.targetPosition, scenario.id).toEqual(scenario.targetPosition);

            const trajectory = flightComputer.computePredictedTrajectory(
                scenario.scopePosition,
                launchDirection,
                scenario.initialVelocity,
                Math.max(150, scenario.minPoints),
            );
            const xs = trajectory.map((point) => point[0]);
            const zs = trajectory.map((point) => point[2]);

            expect(trajectory.length, scenario.id).toBeGreaterThanOrEqual(scenario.minPoints);
            expect(xs.at(-1) - xs[0], scenario.id).toBeGreaterThan(scenario.minDownrangeAdvance);
            for (let index = 0; index < xs.length - 1; index += 1) {
                expect(xs[index + 1], scenario.id).toBeGreaterThanOrEqual(xs[index] - 1e-6);
            }
            expect(Math.max(...zs), scenario.id).toBeGreaterThan(scenario.minPeakAltitude);
            expect(zs.at(-1), scenario.id).toBeLessThanOrEqual(scenario.maxEndAltitude);
        }
    });

    it('matches shared headless flight outcomes', () => {
        for (const scenario of FIXTURES.flightOutcomes) {
            const result = runHeadlessScenario({
                targetRange: scenario.targetRange,
                targetLateral: scenario.targetLateral,
                targetHeight: scenario.targetHeight,
                navConstant: scenario.navConstant,
            });

            expect(result.hit, scenario.id).toBe(scenario.expectedHit);
            expect(result.missDistance, scenario.id).toBeLessThanOrEqual(scenario.maxMissDistance);
        }
    });
});
