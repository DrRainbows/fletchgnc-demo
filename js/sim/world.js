/**
 * FletchGNC - World Simulation
 * 
 * Targets with anatomical hit zones, animal behavior, and world state.
 * Faithful port of src/environment/world.py.
 */

import { MISSION_CONSTANTS } from '../domain/engagement-rules.js';
import { V3, clamp } from './math.js';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const TargetType = { DEER: 'deer', ELK: 'elk', BOAR: 'boar', STATIC: 'target' };
export const AnimalBehavior = { GRAZING: 'grazing', WALKING: 'walking', ALERT: 'alert', RUNNING: 'running', BEDDED: 'bedded' };
export const HitZone = { HEART: 'heart', LUNGS: 'lungs', HEAD: 'head', SPINE: 'spine', NECK: 'neck', GUT: 'gut', LEG: 'leg', BODY: 'body' };

// ─── Anatomy Data ───────────────────────────────────────────────────────────

const ANATOMY = {
    [TargetType.DEER]: {
        size: [1.8, 0.4, 1.3],
        zones: [
            { type: HitZone.HEART, offset: [-0.25, 0, -0.1], radius: 0.08, lethality: 1.0 },
            { type: HitZone.LUNGS, offset: [-0.15, 0, 0], radius: 0.15, lethality: 0.95 },
            { type: HitZone.HEAD, offset: [0.7, 0, 0.3], radius: 0.12, lethality: 1.0 },
            { type: HitZone.NECK, offset: [0.5, 0, 0.15], radius: 0.10, lethality: 0.85 },
            { type: HitZone.SPINE, offset: [0.0, 0, 0.4], radius: 0.06, lethality: 0.9 },
        ]
    },
    [TargetType.ELK]: {
        size: [2.4, 0.5, 1.6],
        zones: [
            { type: HitZone.HEART, offset: [-0.35, 0, -0.15], radius: 0.12, lethality: 1.0 },
            { type: HitZone.LUNGS, offset: [-0.2, 0, 0], radius: 0.20, lethality: 0.95 },
            { type: HitZone.HEAD, offset: [0.9, 0, 0.4], radius: 0.15, lethality: 1.0 },
            { type: HitZone.NECK, offset: [0.6, 0, 0.2], radius: 0.12, lethality: 0.85 },
            { type: HitZone.SPINE, offset: [0.0, 0, 0.5], radius: 0.08, lethality: 0.9 },
        ]
    },
    [TargetType.BOAR]: {
        size: [1.4, 0.6, 0.8],
        zones: [
            { type: HitZone.HEART, offset: [-0.15, 0, -0.05], radius: 0.08, lethality: 1.0 },
            { type: HitZone.LUNGS, offset: [-0.05, 0, 0], radius: 0.12, lethality: 0.95 },
            { type: HitZone.HEAD, offset: [0.5, 0, 0.1], radius: 0.10, lethality: 1.0 },
        ]
    },
    [TargetType.STATIC]: {
        size: [0.1, 1.0, 1.0],
        zones: [
            { type: HitZone.HEART, offset: [0, 0, 0], radius: 0.05, lethality: 1.0 },
            { type: HitZone.LUNGS, offset: [0, 0, 0], radius: 0.15, lethality: 0.9 },
        ]
    },
};

// ─── Target ─────────────────────────────────────────────────────────────────

export class Target {
    constructor(id, type, position, heading = 0) {
        this.id = id;
        this.type = type;
        this.position = V3.copy(position);
        this.velocity = [0, 0, 0];
        this.heading = heading;
        this.isMoving = false;

        const anatomy = ANATOMY[type] || ANATOMY[TargetType.DEER];
        this.size = [...anatomy.size];
        this.hitZones = anatomy.zones.map(z => ({
            type: z.type,
            offset: V3.copy(z.offset),
            radius: z.radius,
            lethality: z.lethality
        }));

        // Animal behavior state
        this.behavior = AnimalBehavior.GRAZING;
        this.behaviorTime = 0;
        this.behaviorDuration = 5;
        this.turnRate = 0;
        this.targetHeading = heading;
        this.isDowned = false;

        // For reset
        this._initialPos = V3.copy(position);
        this._initialHeading = heading;
    }

    getZoneWorldPosition(zone) {
        const c = Math.cos(this.heading);
        const s = Math.sin(this.heading);
        const o = zone.offset;
        return V3.add(this.position, [
            c * o[0] - s * o[1],
            s * o[0] + c * o[1],
            o[2]
        ]);
    }

    get vitalCenter() {
        const heart = this.hitZones.find(z => z.type === HitZone.HEART);
        return heart ? this.getZoneWorldPosition(heart) : V3.copy(this.position);
    }

    update(dt) {
        if (this.type === TargetType.STATIC || this.isDowned) return;

        this.behaviorTime += dt;
        if (this.behaviorTime >= this.behaviorDuration) {
            this._changeBehavior();
        }

        this._updateBehavior(dt);

        // Smooth heading changes
        if (Math.abs(this.heading - this.targetHeading) > 0.01) {
            let diff = this.targetHeading - this.heading;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            this.heading += clamp(diff, -this.turnRate * dt, this.turnRate * dt);
        }

        // Apply velocity
        if (this.isMoving) {
            this.position = V3.addScaled(this.position, this.velocity, dt);
            this.position[0] = clamp(
                this.position[0],
                MISSION_CONSTANTS.defaultTargetClamp.downrange[0],
                MISSION_CONSTANTS.defaultTargetClamp.downrange[1],
            );
            this.position[1] = clamp(
                this.position[1],
                MISSION_CONSTANTS.defaultTargetClamp.lateral[0],
                MISSION_CONSTANTS.defaultTargetClamp.lateral[1],
            );
        }
    }

    _changeBehavior() {
        this.behaviorTime = 0;
        const r = Math.random();

        const transitions = {
            [AnimalBehavior.GRAZING]: [[0.4, AnimalBehavior.GRAZING], [0.8, AnimalBehavior.WALKING], [1, AnimalBehavior.ALERT]],
            [AnimalBehavior.WALKING]: [[0.3, AnimalBehavior.GRAZING], [0.8, AnimalBehavior.WALKING], [1, AnimalBehavior.ALERT]],
            [AnimalBehavior.ALERT]: [[0.5, AnimalBehavior.GRAZING], [0.8, AnimalBehavior.WALKING], [0.95, AnimalBehavior.ALERT], [1, AnimalBehavior.RUNNING]],
            [AnimalBehavior.RUNNING]: [[0.5, AnimalBehavior.WALKING], [1, AnimalBehavior.ALERT]],
        };

        const choices = transitions[this.behavior] || transitions[AnimalBehavior.GRAZING];
        for (const [threshold, behavior] of choices) {
            if (r <= threshold) {
                this.behavior = behavior;
                break;
            }
        }

        // Duration and heading
        switch (this.behavior) {
            case AnimalBehavior.GRAZING:
                this.behaviorDuration = 3 + Math.random() * 5;
                break;
            case AnimalBehavior.WALKING:
                this.behaviorDuration = 2 + Math.random() * 4;
                this.targetHeading = this.heading + (Math.random() - 0.5) * Math.PI / 1.5;
                break;
            case AnimalBehavior.ALERT:
                this.behaviorDuration = 1 + Math.random() * 2;
                break;
            case AnimalBehavior.RUNNING:
                this.behaviorDuration = 2 + Math.random() * 3;
                this.targetHeading = this.heading + (Math.random() - 0.5) * Math.PI;
                break;
        }
    }

    _updateBehavior(dt) {
        switch (this.behavior) {
            case AnimalBehavior.GRAZING:
                this.isMoving = false;
                this.velocity = [0, 0, 0];
                this.turnRate = 0.3;
                if (Math.random() < 0.01) {
                    this.targetHeading = this.heading + (Math.random() - 0.5) * 0.4;
                }
                break;
            case AnimalBehavior.WALKING: {
                this.isMoving = true;
                const speed = this.type === TargetType.DEER ? 1.0 : 0.8;
                this.velocity = [Math.cos(this.heading) * speed, Math.sin(this.heading) * speed, 0];
                this.turnRate = 0.8;
                break;
            }
            case AnimalBehavior.ALERT:
                this.isMoving = false;
                this.velocity = [0, 0, 0];
                this.turnRate = 2.0;
                if (Math.random() < 0.05) {
                    this.targetHeading = this.heading + (Math.random() - 0.5) * Math.PI;
                }
                break;
            case AnimalBehavior.RUNNING: {
                this.isMoving = true;
                const speed = this.type === TargetType.DEER ? 8.0 : 6.0;
                this.velocity = [Math.cos(this.heading) * speed, Math.sin(this.heading) * speed, 0];
                this.turnRate = 1.5;
                break;
            }
        }
    }

    checkHit(point, velocity = null) {
        // Transform to local coordinates
        const rel = V3.sub(point, this.position);
        const c = Math.cos(-this.heading);
        const s = Math.sin(-this.heading);
        const local = [c * rel[0] - s * rel[1], s * rel[0] + c * rel[1], rel[2]];

        // Bounding box check
        const halfSize = this.size.map(sz => sz / 2);
        if (Math.abs(local[0]) > halfSize[0] || Math.abs(local[1]) > halfSize[1] || Math.abs(local[2]) > halfSize[2]) {
            return { hit: false, zone: null, distance: Infinity };
        }

        // Check anatomical zones at current position (smallest first)
        let bestZone = null;
        let bestDist = Infinity;
        const sortedZones = [...this.hitZones].sort((a, b) => a.radius - b.radius);
        for (const zone of sortedZones) {
            const zoneWorld = this.getZoneWorldPosition(zone);
            const dist = V3.mag(V3.sub(point, zoneWorld));
            if (dist <= zone.radius && dist < bestDist) {
                bestZone = zone.type;
                bestDist = dist;
            }
        }

        // Cast ray along velocity to check organ penetration.
        // Use closest approach distance (perpendicular distance from
        // ray to organ center) as the accuracy metric.
        if (velocity) {
            const speed = V3.mag(velocity);
            if (speed > 1) {
                const dir = V3.scale(velocity, 1 / speed);
                for (const zone of sortedZones) {
                    const zoneWorld = this.getZoneWorldPosition(zone);
                    const oc = V3.sub(point, zoneWorld);
                    const b = V3.dot(oc, dir);
                    const ocSq = V3.dot(oc, oc);
                    // Closest approach = perpendicular distance from ray to center
                    const closestApproachSq = ocSq - b * b;
                    const closestApproach = Math.sqrt(Math.max(0, closestApproachSq));
                    if (closestApproach <= zone.radius) {
                        if (closestApproach < bestDist) {
                            bestZone = zone.type;
                            bestDist = closestApproach;
                        }
                    }
                }
            }
        }

        return { hit: true, zone: bestZone, distance: bestDist };
    }

    reset() {
        this.position = V3.copy(this._initialPos);
        this.heading = this._initialHeading;
        this.velocity = [0, 0, 0];
        this.isMoving = false;
        this.isDowned = false;
        this.behavior = AnimalBehavior.GRAZING;
        this.behaviorTime = 0;
        this.behaviorDuration = 5;
    }
}

// ─── World ──────────────────────────────────────────────────────────────────

export class World {
    constructor() {
        this.targets = [];
        this.time = 0;
        this._nextId = 0;
        this.shooterPosition = [...MISSION_CONSTANTS.shooterPosition];
    }

    addTarget(type, position, heading = 0) {
        const target = new Target(this._nextId++, type, position, heading);
        this.targets.push(target);
        return target;
    }

    addWalkingDeer(range, lateral = 0) {
        const pos = [range, lateral, 0.65];
        const heading = Math.random() * 2 * Math.PI - Math.PI;
        const target = this.addTarget(TargetType.DEER, pos, heading);
        target.behavior = AnimalBehavior.WALKING;
        target.isMoving = true;
        return target;
    }

    setupDefaultTargets() {
        this.targets = [];
        this._nextId = 0;

        for (const spec of MISSION_CONSTANTS.defaultTargetLayout) {
            if (spec.kind === 'walkingDeer') {
                this.addWalkingDeer(spec.range, spec.lateral);
                continue;
            }

            const target = this.addTarget(spec.type, spec.position, spec.heading);
            target.behavior = spec.behavior;
            target.isMoving = Boolean(spec.isMoving);
            if (target.isMoving) {
                target._updateBehavior(0);
            }
        }
    }

    update(dt) {
        this.time += dt;
        for (const target of this.targets) {
            target.update(dt);
        }
    }

    checkAllHits(point, velocity = null) {
        const results = [];
        for (const target of this.targets) {
            const result = target.checkHit(point, velocity);
            if (result.hit) {
                results.push({ target, ...result });
            }
        }
        return results;
    }

    computeLeadAngle(shooterPos, target, boltSpeed, aimZone = HitZone.HEART) {
        let aimPoint = target.vitalCenter;
        for (const zone of target.hitZones) {
            if (zone.type === aimZone) {
                aimPoint = target.getZoneWorldPosition(zone);
                break;
            }
        }

        if (!target.isMoving || V3.mag(target.velocity) < 0.1) return aimPoint;

        // Iterative intercept solution — extrapolate selected zone, not always vitalCenter
        const zoneBasePos = V3.copy(aimPoint);
        for (let i = 0; i < 5; i++) {
            const range = V3.mag(V3.sub(aimPoint, shooterPos));
            const tof = range / boltSpeed;
            aimPoint = V3.addScaled(zoneBasePos, target.velocity, tof);
        }

        return aimPoint;
    }

    reset() {
        this.time = 0;
        for (const target of this.targets) target.reset();
    }
}
