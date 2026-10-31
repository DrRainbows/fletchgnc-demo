export function createRenderLoop(context, actions) {
    const { effects, inputManager, runtime, store, window } = context;

    function frame(timestamp) {
        if (!store.running) {
            return;
        }

        const dt = Math.min((timestamp - runtime.lastFrameTime) / 1000, 0.05);
        runtime.lastFrameTime = timestamp;

        runtime.fpsFrames += 1;
        if (timestamp - runtime.fpsLastTime >= 1000) {
            store.set('fps', runtime.fpsFrames);
            if (context.dom.fpsCounter) {
                context.dom.fpsCounter.textContent = `${runtime.fpsFrames} FPS`;
            }
            runtime.fpsFrames = 0;
            runtime.fpsLastTime = timestamp;
        }

        if (!store.paused) {
            inputManager?.updateContinuousInput?.();
            actions.update(dt);
        }

        effects.update(dt);
        actions.render();
        runtime.frameHandle = window.requestAnimationFrame(frame);
    }

    return {
        start() {
            runtime.lastFrameTime = performance.now();
            runtime.fpsLastTime = runtime.lastFrameTime;
            runtime.frameHandle = window.requestAnimationFrame(frame);
        },
        stop() {
            if (runtime.frameHandle !== null) {
                window.cancelAnimationFrame(runtime.frameHandle);
                runtime.frameHandle = null;
            }
        },
    };
}
