/**
 * Centralized state store with change subscriptions.
 * Replaces the monolithic STATE object from the old app.js.
 */
import { MISSION_CONSTANTS } from '../domain/engagement-rules.js';

export class StateStore {
    constructor() {
        this._listeners = new Map();
        this._batchDepth = 0;
        this._pendingNotifications = new Set();

        // ─── Simulation State (written by the canonical app shell) ───
        this.boltState = null;
        this.trajectory = [];
        this.flightLog = [];
        this.navState = null;
        this.guidanceCmd = null;

        // ─── Application State ───
        this.running = true;
        this.paused = false;
        this.inFlight = false;
        this.isArmed = false;

        // Scope
        this.scopeAzimuth = 0;
        this.scopeElevation = 0;
        this.scopePosition = [...MISSION_CONSTANTS.shooterPosition];
        this.scopeZoom = 1.0;
        this.selectedZone = 'heart';

        // Selection
        this.selectedTarget = null;
        this.lockedTargetId = -1;

        // Flight
        this.predictedTrajectory = [];
        this.impactPos = null;
        this.flightMode = 'IDLE';
        this.flightTime = 0;

        // Pre-fire
        this.preFire = null;

        // Stats
        this.shotsFired = 0;
        this.hits = 0;
        this.lastMissDistance = null;
        this.boltNumber = 0;

        // UI State
        this.uiMode = 'dashboard'; // 'dashboard' | 'focused' | 'analysis'
        this.fps = 0;

        // World
        this.targets = [];
        this.worldTime = 0;

        // Replay
        this.replayActive = false;
        this.replayIndex = 0;
        this.replayFrame = null;

        // Wind (Feature 2)
        this.windVelocity = [0, 0, 0];
        this.windGustIntensity = 0;

        // Trajectory comparison (Feature 5)
        this.lastPredictedTrajectory = [];

        // GNC lead point (Feature 8)
        this.leadPoint = null;

        // Leaderboard (Feature 12)
        this.leaderboard = [];
    }

    /**
     * Subscribe to changes on a specific property.
     */
    on(property, callback) {
        if (!this._listeners.has(property)) {
            this._listeners.set(property, new Set());
        }
        this._listeners.get(property).add(callback);
        return () => {
            const set = this._listeners.get(property);
            if (set) set.delete(callback);
        };
    }

    /**
     * Set a property and notify listeners.
     */
    set(property, value) {
        this[property] = value;
        if (this._batchDepth > 0) {
            this._pendingNotifications.add(property);
        } else {
            this._notify(property);
        }
    }

    /**
     * Batch multiple updates into a single notification cycle.
     */
    batch(fn) {
        this._batchDepth++;
        try {
            fn();
        } finally {
            this._batchDepth--;
            if (this._batchDepth === 0) {
                for (const prop of this._pendingNotifications) {
                    this._notify(prop);
                }
                this._pendingNotifications.clear();
            }
        }
    }

    // ─── Persistence ──────────────────────────────────────────────────────

    static _PERSIST_KEYS = ['scopeZoom', 'selectedZone', 'uiMode', 'shotsFired', 'hits', 'boltNumber', 'windVelocity', 'windGustIntensity', 'leaderboard'];

    saveToStorage() {
        const data = {};
        for (const key of StateStore._PERSIST_KEYS) {
            data[key] = this[key];
        }
        try {
            localStorage.setItem('fletchgnc-state', JSON.stringify(data));
        } catch {}
    }

    loadFromStorage() {
        try {
            const raw = localStorage.getItem('fletchgnc-state');
            if (!raw) return;
            const data = JSON.parse(raw);
            for (const key of StateStore._PERSIST_KEYS) {
                if (data[key] !== undefined) this.set(key, data[key]);
            }
        } catch {}
    }

    _notify(property) {
        const listeners = this._listeners.get(property);
        if (listeners) {
            for (const cb of listeners) cb(this[property]);
        }
        // Also notify wildcard listeners
        const wildcard = this._listeners.get('*');
        if (wildcard) {
            for (const cb of wildcard) cb(property, this[property]);
        }
    }
}

export const store = new StateStore();
