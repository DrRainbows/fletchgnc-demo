// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startApp } from '../js/app/app-shell.js';
import { EventBus } from '../js/core/event-bus.js';
import { StateStore } from '../js/core/state-store.js';

function createFakePanels() {
    const panel = () => ({
        invalidate: vi.fn(),
        renderIfNeeded: vi.fn(),
    });

    return {
        scope: panel(),
        flight3d: { ...panel(), toggleTrajectory: vi.fn() },
        cgbody: panel(),
        charts: panel(),
        telemetry: { ...panel(), addLog: vi.fn() },
    };
}

function createFakeEffects(store) {
    const replay = {
        active: false,
        playing: false,
        init: vi.fn(),
        enter: vi.fn(() => {
            replay.active = true;
            store.batch(() => {
                store.set('replayActive', true);
                store.set('replayIndex', Math.max(0, store.trajectory.length - 1));
                store.set('replayFrame', store.trajectory.at(-1) ?? null);
            });
        }),
        exit: vi.fn(() => {
            replay.active = false;
            replay.playing = false;
            store.batch(() => {
                store.set('replayActive', false);
                store.set('replayIndex', 0);
                store.set('replayFrame', null);
            });
        }),
        togglePlay: vi.fn(() => {
            replay.playing = !replay.playing;
        }),
        stepBackward: vi.fn(),
        stepForward: vi.fn(),
    };

    const onboarding = {
        active: false,
        show: vi.fn(() => {
            onboarding.active = true;
        }),
        hide: vi.fn(() => {
            onboarding.active = false;
        }),
        nextStep: vi.fn(),
        draw: vi.fn(),
    };

    const postFlight = {
        visible: false,
        show: vi.fn(() => {
            postFlight.visible = true;
        }),
        hide: vi.fn(() => {
            postFlight.visible = false;
        }),
        draw: vi.fn(),
    };

    const killCam = {
        active: false,
        trigger: vi.fn(() => {
            killCam.active = true;
        }),
        cancel: vi.fn(() => {
            killCam.active = false;
        }),
    };

    return {
        update: vi.fn(),
        shake: { register: vi.fn(), trigger: vi.fn() },
        pause: { show: vi.fn(), hide: vi.fn() },
        replay,
        onboarding,
        postFlight,
        fireFlash: { trigger: vi.fn(), draw: vi.fn() },
        impactFlash: { trigger: vi.fn() },
        killCam,
    };
}

function createDomSkeleton() {
    document.body.innerHTML = `
        <div id="loading-screen"></div>
        <div id="load-physics">physics . . .</div>
        <div id="load-gnc">gnc . . .</div>
        <div id="load-render">render . . .</div>
        <div id="load-world">world . . .</div>
        <div id="dashboard"></div>
        <div id="panel-scope"></div>
        <div id="mode-badge"></div>
        <div id="armed-badge" class="hidden"></div>
        <div id="fps-counter"></div>
        <div id="shot-counter"></div>
        <div id="key-toast"></div>
        <div id="touch-hint" style="display:none"></div>
        <button id="settings-btn"></button>
        <div id="settings-panel" class="hidden"></div>
        <button id="settings-close"></button>
        <input id="setting-wind-speed" value="0" />
        <input id="setting-wind-dir" value="0" />
        <input id="setting-gust" value="0" />
        <div id="setting-wind-speed-val"></div>
        <div id="setting-wind-dir-val"></div>
        <div id="setting-gust-val"></div>
        <button id="setting-randomize-wind"></button>
        <button id="leaderboard-btn"></button>
        <div id="leaderboard-panel" class="hidden"></div>
        <button id="leaderboard-close"></button>
        <div id="leaderboard-body"></div>
    `;
}

function createHarness() {
    createDomSkeleton();
    const store = new StateStore();
    const bus = new EventBus();
    const panels = createFakePanels();
    const effects = createFakeEffects(store);

    const app = startApp({
        store,
        bus,
        panels,
        effects,
        skipInputManager: true,
        document,
        window,
    });
    app.renderLoop.stop();
    return app;
}

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    window.requestAnimationFrame = vi.fn(() => 1);
    window.cancelAnimationFrame = vi.fn();
});

afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    localStorage.clear();
    document.body.innerHTML = '';
});

describe('app shell smoke flows', () => {
    it('arms, fires, and resets', () => {
        const app = createHarness();
        const { actions, context } = app;

        expect(context.store.selectedTarget).toBeTruthy();

        actions.toggleArm();
        expect(context.store.isArmed).toBe(true);
        expect(context.store.lockedTargetId).toBeGreaterThanOrEqual(0);

        actions.fire();
        expect(context.store.inFlight).toBe(true);
        expect(context.store.boltState).not.toBeNull();

        actions.resetSim();
        expect(context.store.inFlight).toBe(false);
        expect(context.store.isArmed).toBe(false);
        expect(context.store.replayActive).toBe(false);
        expect(context.store.trajectory).toHaveLength(0);
    });

    it('enters replay after flight end and persists user settings', () => {
        const app = createHarness();
        const { actions, context } = app;

        actions.toggleArm();
        actions.fire();

        const impactPoint = [...context.store.selectedTarget.vitalCenter];
        context.store.set('trajectory', [
            { position: [...context.store.scopePosition], time: 0, angleOfAttack: 0, actualFinPitch: 0, actualFinYaw: 0 },
            { position: impactPoint, time: 1, angleOfAttack: 0, actualFinPitch: 0, actualFinYaw: 0 },
        ]);
        context.store.set('flightLog', [{ guidanceCmd: { accelCmd: [0, 0, 0] } }]);
        context.store.boltState.position = impactPoint;
        context.store.boltState.velocity = [100, 0, 0];
        actions.endFlight();

        expect(context.store.replayActive).toBe(true);
        expect(context.effects.replay.enter).toHaveBeenCalled();
        expect(context.effects.postFlight.show).toHaveBeenCalled();

        context.store.set('scopeZoom', 2.5);
        context.store.set('selectedZone', 'lungs');
        context.store.set('uiMode', 'focused');
        context.store.saveToStorage();

        const restored = new StateStore();
        restored.loadFromStorage();
        expect(restored.scopeZoom).toBe(2.5);
        expect(restored.selectedZone).toBe('lungs');
        expect(restored.uiMode).toBe('focused');
    });
});
