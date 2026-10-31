import { BasePanel } from './base-panel.js';

/**
 * Canvas-backed dashboard panel with automatic HiDPI sizing.
 */
export class UIPanel extends BasePanel {
    constructor(containerId, options = {}) {
        super(containerId, options);

        if (!this.canvas && options.hasCanvas !== false) {
            this.canvas = document.createElement('canvas');
            this.container.appendChild(this.canvas);
        }

        this.ctx = this.canvas?.getContext('2d') ?? null;
        this.w = 0;
        this.h = 0;
    }

    onResize(width, height) {
        if (!this.canvas) {
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.w = Math.floor(width * dpr);
        this.h = Math.floor(height * dpr);
    }

    renderIfNeeded(state) {
        if (!this.visible || !this.needsRender || !this.ctx) {
            return;
        }
        if (this.w === 0 || this.h === 0) {
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Use CSS pixel dimensions for drawing
        const cssW = this.w / dpr;
        const cssH = this.h / dpr;
        this.render(this.ctx, cssW, cssH, state);
        this.needsRender = false;
    }

    render(ctx, w, h, state) {}
}
