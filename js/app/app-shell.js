import { runBootSequence } from './boot.js';
import { createAppContext } from './context.js';
import { createPanelsFromFactories, DEFAULT_PANEL_FACTORIES } from './panel-factories.js';
import { createActionLayer } from './actions.js';
import { createRenderLoop } from './render-loop.js';
import { wireEventBus, wireUiBindings } from './ui.js';

export function startApp(options = {}) {
    const context = createAppContext(options);
    const panelFactories = options.panelFactories ?? DEFAULT_PANEL_FACTORIES;

    runBootSequence(context.dom);
    context.store.loadFromStorage();
    context.world.setupDefaultTargets();
    context.store.set('targets', context.world.targets);

    if (!options.panels) {
        context.panels = createPanelsFromFactories(panelFactories);
    }

    const actions = createActionLayer(context);
    wireEventBus(context, actions);
    wireUiBindings(context, actions);

    actions.initializeWindFromState();

    if (context.world.targets.length > 0) {
        actions.selectTarget(context.world.targets[0]);
    }

    actions.updateHeaderBadges();

    const renderLoop = createRenderLoop(context, actions);
    renderLoop.start();

    return {
        context,
        actions,
        renderLoop,
    };
}
