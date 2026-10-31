/**
 * Lightweight pub/sub event bus for cross-panel communication.
 */
export class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        const listeners = this._listeners.get(event);
        if (listeners) listeners.delete(callback);
    }

    emit(event, data) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            for (const cb of listeners) cb(data);
        }
    }
}

export const bus = new EventBus();
