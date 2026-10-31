export class BasePanel {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Panel container #${containerId} not found`);
        }

        this.title = options.title || '';
        this.visible = true;
        this.needsRender = true;
        this.canvas = this.container.querySelector('canvas');
        this.titleBar = null;

        this._createTitleBar(options.titleHtml);
        this._observeContainerSize();
    }

    _createTitleBar(titleHtml) {
        if (!this.title && !titleHtml) {
            return;
        }

        this.titleBar = document.createElement('div');
        this.titleBar.className = 'panel-title-bar';
        this.titleBar.innerHTML = titleHtml || `<span>${this.title}</span>`;
        this.container.insertBefore(this.titleBar, this.container.firstChild);
    }

    _observeContainerSize() {
        this._resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width <= 0 || height <= 0) {
                    continue;
                }

                this.needsRender = true;
                this.onResize(width, height);
            }
        });
        this._resizeObserver.observe(this.container);
    }

    onResize(width, height) {}

    invalidate() {
        this.needsRender = true;
    }

    setVisible(visible) {
        this.visible = visible;
        this.container.style.display = visible ? '' : 'none';
        if (visible) {
            this.needsRender = true;
        }
    }

    destroy() {
        this._resizeObserver?.disconnect();
    }
}
