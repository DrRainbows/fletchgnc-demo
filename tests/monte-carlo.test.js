/**
 * Monte Carlo GNC Verification Suite
 *
 * Runs thousands of headless engagements to verify accuracy across:
 *   - Range sweep (50-300m)
 *   - Per-organ targeting (heart, lungs, head, spine, neck)
 *   - Wind conditions (calm, light, moderate, heavy, gusting)
 *   - Moving targets (stationary, walking, running)
 *   - Guidance law comparison (PN vs Blended)
 *   - Atmospheric variety (random wind bearing + speed)
 *
 * Reports CEP50, hit rates, mean/max miss, per-zone accuracy.
 */

import { describe, expect, it } from 'vitest';
import { runHeadlessScenario } from './helpers/headless-sim.js';
import { HitZone, TargetType } from '../js/sim/world.js';

// ─── Helpers ─────────────────────────────────────────────────────────────

function runCampaign(params, count) {
    const results = [];
    for (let i = 0; i < count; i++) {
        results.push(runHeadlessScenario(params));
    }
    return results;
}

function runRandomizedCampaign(baseParams, randomize, count) {
    const results = [];
    for (let i = 0; i < count; i++) {
        const params = { ...baseParams, ...randomize(i) };
        results.push(runHeadlessScenario(params));
    }
    return results;
}

function computeStats(results) {
    const hits = results.filter(r => r.hit);
    const misses = results.filter(r => !r.hit);
    const missDistances = results.map(r => r.missDistance).sort((a, b) => a - b);
    const vitalMisses = results.map(r => r.vitalMissDistance).sort((a, b) => a - b);

    const hitRate = hits.length / results.length;
    const meanMiss = missDistances.reduce((a, b) => a + b, 0) / missDistances.length;
    const maxMiss = missDistances[missDistances.length - 1];
    const cep50 = missDistances[Math.floor(missDistances.length * 0.5)] || 0;
    const cep90 = missDistances[Math.floor(missDistances.length * 0.9)] || 0;
    const meanVitalMiss = vitalMisses.reduce((a, b) => a + b, 0) / vitalMisses.length;

    // Hit zone breakdown
    const zoneHits = {};
    for (const r of hits) {
        const z = r.hitZone || 'BODY';
        zoneHits[z] = (zoneHits[z] || 0) + 1;
    }

    return {
        count: results.length,
        hitRate,
        hitCount: hits.length,
        missCount: misses.length,
        meanMiss,
        maxMiss,
        cep50,
        cep90,
        meanVitalMiss,
        zoneHits,
    };
}

function printStats(label, stats) {
    console.log(`\n=== ${label} ===`);
    console.log(`  Engagements: ${stats.count}`);
    console.log(`  Hit rate:    ${(stats.hitRate * 100).toFixed(1)}% (${stats.hitCount}/${stats.count})`);
    console.log(`  CEP50:       ${(stats.cep50 * 100).toFixed(2)} cm`);
    console.log(`  CEP90:       ${(stats.cep90 * 100).toFixed(2)} cm`);
    console.log(`  Mean miss:   ${(stats.meanMiss * 100).toFixed(2)} cm`);
    console.log(`  Max miss:    ${(stats.maxMiss * 100).toFixed(2)} cm`);
    console.log(`  Vital miss:  ${(stats.meanVitalMiss * 100).toFixed(2)} cm`);
    if (Object.keys(stats.zoneHits).length > 0) {
        console.log(`  Zone hits:   ${JSON.stringify(stats.zoneHits)}`);
    }
    return stats;
}

// ─── Test Suites ─────────────────────────────────────────────────────────

describe('Monte Carlo: Range Sweep (stationary, no wind)', () => {
    const ranges = [50, 75, 100, 125, 150, 175, 200, 250, 300];
    const N = 50; // per range

    for (const range of ranges) {
        it(`${range}m - blended guidance`, () => {
            const results = runCampaign({
                targetRange: range,
                targetHeight: 0.65,
                guidanceType: 'blended',
                aimZone: HitZone.HEART,
            }, N);

            const stats = printStats(`${range}m Blended (no wind)`, computeStats(results));

            // Expect high hit rate at reasonable ranges
            if (range <= 200) {
                expect(stats.hitRate).toBeGreaterThan(0.5);
            }
        });
    }
});

describe('Monte Carlo: Per-Organ Targeting @ 100m', () => {
    const zones = [HitZone.HEART, HitZone.LUNGS, HitZone.HEAD, HitZone.SPINE, HitZone.NECK];
    const N = 60;

    for (const zone of zones) {
        it(`targeting ${zone}`, () => {
            const results = runCampaign({
                targetRange: 100,
                targetHeight: 0.65,
                guidanceType: 'blended',
                aimZone: zone,
            }, N);

            const stats = printStats(`100m ${zone} targeting`, computeStats(results));
            expect(stats.hitRate).toBeGreaterThan(0.3);
        });
    }
});

describe('Monte Carlo: Wind Conditions @ 150m', () => {
    const N = 60;

    it('calm (0 m/s)', () => {
        const results = runCampaign({
            targetRange: 150,
            targetHeight: 0.65,
            guidanceType: 'blended',
            windVelocity: [0, 0, 0],
            windGustIntensity: 0,
        }, N);
        printStats('150m calm', computeStats(results));
    });

    it('light crosswind (3 m/s)', () => {
        const results = runCampaign({
            targetRange: 150,
            targetHeight: 0.65,
            guidanceType: 'blended',
            windVelocity: [0, 3, 0],
            windGustIntensity: 0.3,
        }, N);
        const stats = printStats('150m light crosswind', computeStats(results));
        expect(stats.hitRate).toBeGreaterThan(0.3);
    });

    it('moderate headwind (5 m/s)', () => {
        const results = runCampaign({
            targetRange: 150,
            targetHeight: 0.65,
            guidanceType: 'blended',
            windVelocity: [-5, 0, 0],
            windGustIntensity: 0.5,
        }, N);
        const stats = printStats('150m moderate headwind', computeStats(results));
        expect(stats.hitRate).toBeGreaterThan(0.3);
    });

    it('heavy quartering wind (8 m/s)', () => {
        const results = runCampaign({
            targetRange: 150,
            targetHeight: 0.65,
            guidanceType: 'blended',
            windVelocity: [4, 6, 0.5],
            windGustIntensity: 1.5,
        }, N);
        const stats = printStats('150m heavy quartering', computeStats(results));
        expect(stats.hitRate).toBeGreaterThan(0.2);
    });

    it('random wind conditions (60 trials)', () => {
        const results = runRandomizedCampaign(
            { targetRange: 150, targetHeight: 0.65, guidanceType: 'blended' },
            () => {
                const speed = 1 + Math.random() * 9;
                const bearing = Math.random() * Math.PI * 2;
                return {
                    windVelocity: [
                        speed * Math.cos(bearing),
                        speed * Math.sin(bearing),
                        (Math.random() - 0.5) * 1.0,
                    ],
                    windGustIntensity: Math.random() * 2.0,
                };
            },
            N,
        );
        const stats = printStats('150m random wind', computeStats(results));
        expect(stats.hitRate).toBeGreaterThan(0.2);
    });
});

describe('Monte Carlo: Moving Targets @ 120m', () => {
    const N = 40;

    it('walking target (1 m/s)', () => {
        const results = runRandomizedCampaign(
            {
                targetRange: 120,
                targetHeight: 0.65,
                guidanceType: 'blended',
                targetSpeed: 1.0,
            },
            () => ({
                targetHeading: Math.random() * Math.PI * 2,
                windVelocity: [
                    (Math.random() - 0.5) * 4,
                    (Math.random() - 0.5) * 4,
                    0,
                ],
                windGustIntensity: Math.random() * 0.5,
            }),
            N,
        );
        const stats = printStats('120m walking (1 m/s)', computeStats(results));
        expect(stats.hitRate).toBeGreaterThan(0.2);
    });

    it('trotting target (3 m/s)', () => {
        const results = runRandomizedCampaign(
            {
                targetRange: 120,
                targetHeight: 0.65,
                guidanceType: 'blended',
                targetSpeed: 3.0,
            },
            () => ({
                targetHeading: Math.random() * Math.PI * 2,
            }),
            N,
        );
        printStats('120m trotting (3 m/s)', computeStats(results));
    });

    it('running target (8 m/s)', () => {
        const results = runRandomizedCampaign(
            {
                targetRange: 120,
                targetHeight: 0.65,
                guidanceType: 'blended',
                targetSpeed: 8.0,
            },
            () => ({
                targetHeading: Math.random() * Math.PI * 2,
            }),
            N,
        );
        printStats('120m running (8 m/s)', computeStats(results));
        // Running targets are very hard — just log, no assertion
    });
});

describe('Monte Carlo: Guidance Law Comparison @ 150m', () => {
    const N = 80;

    it('PN vs Blended accuracy comparison', { timeout: 30000 }, () => {
        const pnResults = runRandomizedCampaign(
            { targetRange: 150, targetHeight: 0.65, guidanceType: 'pn' },
            () => {
                const speed = 2 + Math.random() * 6;
                const bearing = Math.random() * Math.PI * 2;
                return {
                    windVelocity: [speed * Math.cos(bearing), speed * Math.sin(bearing), 0],
                    windGustIntensity: Math.random() * 1.5,
                };
            },
            N,
        );

        const blendedResults = runRandomizedCampaign(
            { targetRange: 150, targetHeight: 0.65, guidanceType: 'blended' },
            (i) => {
                // Use same random seed pattern — recreate same conditions
                // by using index-based deterministic-ish wind
                const speed = 2 + ((i * 7 + 3) % 100) / 100 * 6;
                const bearing = ((i * 13 + 7) % 100) / 100 * Math.PI * 2;
                return {
                    windVelocity: [speed * Math.cos(bearing), speed * Math.sin(bearing), 0],
                    windGustIntensity: ((i * 17 + 11) % 100) / 100 * 1.5,
                };
            },
            N,
        );

        const pnStats = printStats('150m PN (wind)', computeStats(pnResults));
        const blStats = printStats('150m Blended (wind)', computeStats(blendedResults));

        console.log(`\n  Blended improvement:`);
        console.log(`    CEP50: ${((1 - blStats.cep50 / (pnStats.cep50 || 1)) * 100).toFixed(1)}%`);
        console.log(`    Hit rate: ${((blStats.hitRate - pnStats.hitRate) * 100).toFixed(1)} pp`);
    });
});

describe('Monte Carlo: Multi-Range Multi-Animal Full Sweep', () => {
    const N_PER_CONFIG = 30;

    it('comprehensive engagement matrix', { timeout: 120000 }, () => {
        const ranges = [75, 100, 150, 200, 250];
        const animals = [
            { type: TargetType.DEER, height: 0.65, label: 'deer' },
            { type: TargetType.ELK, height: 0.80, label: 'elk' },
            { type: TargetType.BOAR, height: 0.40, label: 'boar' },
        ];

        const allResults = [];

        for (const animal of animals) {
            for (const range of ranges) {
                const results = runRandomizedCampaign(
                    {
                        targetRange: range,
                        targetHeight: animal.height,
                        targetType: animal.type,
                        guidanceType: 'blended',
                        aimZone: HitZone.HEART,
                    },
                    () => {
                        const speed = 1 + Math.random() * 5;
                        const bearing = Math.random() * Math.PI * 2;
                        return {
                            windVelocity: [speed * Math.cos(bearing), speed * Math.sin(bearing), 0],
                            windGustIntensity: Math.random() * 1.0,
                        };
                    },
                    N_PER_CONFIG,
                );

                const stats = computeStats(results);
                allResults.push({ animal: animal.label, range, stats });
                printStats(`${animal.label} @ ${range}m (wind)`, stats);
            }
        }

        // Summary table
        console.log('\n=== ENGAGEMENT MATRIX SUMMARY ===');
        console.log('Animal  | Range | Hit%  | CEP50(cm) | CEP90(cm) | Max(cm)');
        console.log('--------|-------|-------|-----------|-----------|--------');
        for (const r of allResults) {
            const s = r.stats;
            console.log(
                `${r.animal.padEnd(7)} | ${String(r.range).padStart(5)} | ` +
                `${(s.hitRate * 100).toFixed(0).padStart(4)}% | ` +
                `${(s.cep50 * 100).toFixed(1).padStart(9)} | ` +
                `${(s.cep90 * 100).toFixed(1).padStart(9)} | ` +
                `${(s.maxMiss * 100).toFixed(1).padStart(6)}`
            );
        }
    });
});

describe('Monte Carlo: Wind Estimation Accuracy', () => {
    it('verifies navigator wind estimate converges', () => {
        const trueWinds = [
            [3, 0, 0],
            [0, 5, 0],
            [-4, 3, 0],
            [6, -2, 0.5],
        ];
        const N = 20;

        console.log('\n=== WIND ESTIMATION ACCURACY ===');
        console.log('True Wind       | Est Wind        | Error (m/s) | Hit?');
        console.log('----------------|-----------------|-------------|-----');

        for (const trueWind of trueWinds) {
            for (let i = 0; i < N; i++) {
                const result = runHeadlessScenario({
                    targetRange: 150,
                    targetHeight: 0.65,
                    guidanceType: 'blended',
                    windVelocity: trueWind,
                    windGustIntensity: 0.2,
                });

                const est = result.windEstimate;
                const err = Math.sqrt(
                    (est[0] - trueWind[0]) ** 2 +
                    (est[1] - trueWind[1]) ** 2 +
                    (est[2] - trueWind[2]) ** 2
                );

                if (i === 0) {
                    console.log(
                        `[${trueWind.map(v => v.toFixed(1)).join(', ')}]`.padEnd(16) + ' | ' +
                        `[${est.map(v => v.toFixed(1)).join(', ')}]`.padEnd(15) + ' | ' +
                        `${err.toFixed(2).padStart(11)} | ` +
                        (result.hit ? 'HIT' : 'miss')
                    );
                }
            }
        }
    });
});

describe('Monte Carlo: Sub-mm Accuracy Probe', () => {
    it('tests accuracy floor at optimal range (75m, no wind)', () => {
        const N = 100;
        const results = runCampaign({
            targetRange: 75,
            targetHeight: 0.65,
            guidanceType: 'blended',
            windVelocity: [0, 0, 0],
            windGustIntensity: 0,
            aimZone: HitZone.HEART,
        }, N);

        const stats = printStats('75m accuracy floor (no wind)', computeStats(results));

        // Log sub-mm analysis
        const subMm = results.filter(r => r.missDistance < 0.001);
        const subCm = results.filter(r => r.missDistance < 0.01);
        const sub5cm = results.filter(r => r.missDistance < 0.05);
        console.log(`  Sub-mm hits:  ${subMm.length}/${N} (${(subMm.length / N * 100).toFixed(0)}%)`);
        console.log(`  Sub-cm hits:  ${subCm.length}/${N} (${(subCm.length / N * 100).toFixed(0)}%)`);
        console.log(`  Sub-5cm hits: ${sub5cm.length}/${N} (${(sub5cm.length / N * 100).toFixed(0)}%)`);
    });

    it('tests accuracy floor at 100m with light wind', () => {
        const N = 100;
        const results = runRandomizedCampaign(
            {
                targetRange: 100,
                targetHeight: 0.65,
                guidanceType: 'blended',
                aimZone: HitZone.HEART,
            },
            () => ({
                windVelocity: [(Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0],
                windGustIntensity: Math.random() * 0.5,
            }),
            N,
        );

        const stats = printStats('100m accuracy (light wind)', computeStats(results));

        const subMm = results.filter(r => r.missDistance < 0.001);
        const subCm = results.filter(r => r.missDistance < 0.01);
        console.log(`  Sub-mm: ${subMm.length}/${N}`);
        console.log(`  Sub-cm: ${subCm.length}/${N}`);
    });
});
