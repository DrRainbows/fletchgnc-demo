import { EventBus, bus as sharedBus } from '../core/event-bus.js';
import { StateStore, store as sharedStore } from '../core/state-store.js';
import { effects as sharedEffects } from '../core/effects.js';
import { InputManager } from '../core/input-manager.js';
import { FlightComputer, SimulatedIMU } from '../sim/gnc.js';
import { BoltPhysics } from '../sim/physics.js';
import { World } from '../sim/world.js';

export function resolveDom(doc = document) {
    return {
        dashboard: doc.getElementById('dashboard'),
        scopePanel: doc.getElementById('panel-scope'),
        modeBadge: doc.getElementById('mode-badge'),
        armedBadge: doc.getElementById('armed-badge'),
        fpsCounter: doc.getElementById('fps-counter'),
        shotCounter: doc.getElementById('shot-counter'),
        keyToast: doc.getElementById('key-toast'),
        touchHint: doc.getElementById('touch-hint'),
        loadingScreen: doc.getElementById('loading-screen'),
        settingsButton: doc.getElementById('settings-btn'),
        settingsPanel: doc.getElementById('settings-panel'),
        settingsClose: doc.getElementById('settings-close'),
        windSpeedSlider: doc.getElementById('setting-wind-speed'),
        windDirectionSlider: doc.getElementById('setting-wind-dir'),
        gustSlider: doc.getElementById('setting-gust'),
        windSpeedValue: doc.getElementById('setting-wind-speed-val'),
        windDirectionValue: doc.getElementById('setting-wind-dir-val'),
        gustValue: doc.getElementById('setting-gust-val'),
        randomizeWindButton: doc.getElementById('setting-randomize-wind'),
        leaderboardButton: doc.getElementById('leaderboard-btn'),
        leaderboardPanel: doc.getElementById('leaderboard-panel'),
        leaderboardClose: doc.getElementById('leaderboard-close'),
        leaderboardBody: doc.getElementById('leaderboard-body'),
    };
}

export function createAppContext(options = {}) {
    const doc = options.document ?? document;
    const wnd = options.window ?? window;

    const context = {
        document: doc,
        window: wnd,
        dom: resolveDom(doc),
        store: options.store ?? sharedStore,
        bus: options.bus ?? sharedBus,
        effects: options.effects ?? sharedEffects,
        world: options.world ?? new World(),
        physics: options.physics ?? new BoltPhysics(),
        imu: options.imu ?? new SimulatedIMU(),
        flightComputer: options.flightComputer ?? new FlightComputer(),
        inputManager: options.inputManager ?? null,
        panels: options.panels ?? {},
        runtime: {
            frameHandle: null,
            lastFrameTime: 0,
            fpsFrames: 0,
            fpsLastTime: 0,
            saveTimeout: null,
        },
        config: options.config ?? {},
    };

    if (!context.inputManager && !options.skipInputManager) {
        const factory = options.inputManagerFactory
            ?? ((scopeElement) => new InputManager(scopeElement));
        context.inputManager = factory(context.dom.scopePanel);
    }

    return context;
}

export function createIsolatedContext(options = {}) {
    return createAppContext({
        ...options,
        store: options.store ?? new StateStore(),
        bus: options.bus ?? new EventBus(),
    });
}
