import { V3 } from '../sim/math.js';
import { APP_RUNTIME_CONSTANTS } from './runtime-constants.js';

export function wireEventBus(context, actions) {
    const { bus, panels, world } = context;

    bus.on('weapon:toggle-arm', actions.toggleArm);
    bus.on('weapon:fire', actions.fire);
    bus.on('sim:reset', actions.resetSim);
    bus.on('flight:export', actions.exportFlightData);
    bus.on('settings:wind-changed', actions.applyWindSettings);
    bus.on('target:select-index', ({ index }) => {
        if (index >= 0 && index < world.targets.length) {
            actions.selectTarget(world.targets[index]);
        }
    });
    bus.on('ui:toggle-trajectory', () => {
        panels.flight3d?.toggleTrajectory?.();
    });
}

export function wireUiBindings(context, actions) {
    const { bus, dom, effects, panels, runtime, store } = context;

    store.on('uiMode', (mode) => {
        if (dom.dashboard) {
            dom.dashboard.className = `dashboard ${mode === 'dashboard' ? '' : mode}`;
        }
        Object.values(context.panels).forEach((panel) => panel.invalidate?.());
    });

    const debouncedSave = () => {
        if (runtime.saveTimeout) {
            clearTimeout(runtime.saveTimeout);
        }
        runtime.saveTimeout = setTimeout(
            () => store.saveToStorage(),
            APP_RUNTIME_CONSTANTS.persistenceDebounceMs,
        );
    };

    for (const property of ['scopeZoom', 'selectedZone', 'uiMode', 'windVelocity', 'windGustIntensity']) {
        store.on(property, debouncedSave);
    }

    store.on('paused', (paused) => {
        if (paused) {
            effects.pause.show();
        } else {
            effects.pause.hide();
        }
    });

    bus.on('ui:keyaction', ({ label }) => {
        if (!dom.keyToast) {
            return;
        }
        dom.keyToast.textContent = label;
        dom.keyToast.classList.add('visible');
        if (runtime.keyToastTimeout) {
            clearTimeout(runtime.keyToastTimeout);
        }
        runtime.keyToastTimeout = setTimeout(
            () => dom.keyToast.classList.remove('visible'),
            APP_RUNTIME_CONSTANTS.keyToastDurationMs,
        );
    });

    function syncWindSliders() {
        const windVelocity = store.windVelocity || [0, 0, 0];
        const speed = Math.sqrt(windVelocity[0] ** 2 + windVelocity[1] ** 2);
        const direction = (Math.atan2(windVelocity[1], windVelocity[0]) * 180 / Math.PI + 360) % 360;

        if (dom.windSpeedSlider) {
            dom.windSpeedSlider.value = speed.toFixed(1);
        }
        if (dom.windDirectionSlider) {
            dom.windDirectionSlider.value = direction.toFixed(0);
        }
        if (dom.gustSlider) {
            dom.gustSlider.value = (store.windGustIntensity || 0).toFixed(2);
        }
        if (dom.windSpeedValue) {
            dom.windSpeedValue.textContent = `${speed.toFixed(1)} m/s`;
        }
        if (dom.windDirectionValue) {
            dom.windDirectionValue.textContent = `${direction.toFixed(0)}°`;
        }
        if (dom.gustValue) {
            dom.gustValue.textContent = (store.windGustIntensity || 0).toFixed(2);
        }
    }

    function applyWindFromSliders() {
        const speed = parseFloat(dom.windSpeedSlider?.value || 0);
        const directionRad = parseFloat(dom.windDirectionSlider?.value || 0) * Math.PI / 180;
        const gustIntensity = parseFloat(dom.gustSlider?.value || 0);
        const velocity = [speed * Math.cos(directionRad), speed * Math.sin(directionRad), 0];
        bus.emit('settings:wind-changed', { velocity, gustIntensity });
        syncWindSliders();
    }

    dom.settingsButton?.addEventListener('click', () => dom.settingsPanel?.classList.toggle('hidden'));
    dom.settingsClose?.addEventListener('click', () => dom.settingsPanel?.classList.add('hidden'));
    dom.windSpeedSlider?.addEventListener('input', applyWindFromSliders);
    dom.windDirectionSlider?.addEventListener('input', applyWindFromSliders);
    dom.gustSlider?.addEventListener('input', applyWindFromSliders);
    dom.randomizeWindButton?.addEventListener('click', () => {
        actions.setRandomWind();
        syncWindSliders();
    });

    dom.leaderboardButton?.addEventListener('click', () => {
        dom.leaderboardPanel?.classList.toggle('hidden');
        actions.renderLeaderboard();
    });
    dom.leaderboardClose?.addEventListener('click', () => dom.leaderboardPanel?.classList.add('hidden'));

    store.on('windVelocity', syncWindSliders);
    store.on('windGustIntensity', syncWindSliders);
    syncWindSliders();

    if (dom.touchHint && 'ontouchstart' in window) {
        dom.touchHint.style.display = '';
    }

    if (dom.dashboard) {
        effects.shake.register(dom.dashboard);
    }

    if (panels.telemetry) {
        panels.telemetry.addLog('FletchGNC v2 Initialized');
        panels.telemetry.addLog('Arrows: Aim | A: Arm | SPACE: Fire | H: Help');
    }

    if (dom.shotCounter) {
        dom.shotCounter.textContent = `${store.hits}/${store.shotsFired}`;
    }

    effects.replay.init();
    try {
        if (!localStorage.getItem('fletchgnc-onboarded')) {
            effects.onboarding.show();
        }
    } catch {
        // Persistence is optional in private browsing contexts.
    }
}
