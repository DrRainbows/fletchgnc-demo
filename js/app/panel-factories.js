import { CGBodyPanel } from '../panels/cg-body-panel.js';
import { ChartsPanel } from '../panels/charts-panel.js';
import { Flight3DPanel } from '../panels/flight-3d-panel.js';
import { ScopePanel } from '../panels/scope-panel.js';
import { TelemetryPanel } from '../panels/telemetry-panel.js';

export const DEFAULT_PANEL_FACTORIES = {
    scope: () => new ScopePanel(),
    flight3d: () => new Flight3DPanel(),
    cgbody: () => new CGBodyPanel(),
    telemetry: () => new TelemetryPanel(),
    charts: () => new ChartsPanel(),
};

export function createPanelsFromFactories(panelFactories = DEFAULT_PANEL_FACTORIES) {
    return Object.fromEntries(
        Object.entries(panelFactories).map(([key, factory]) => [key, factory()]),
    );
}
