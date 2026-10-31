const LOAD_SEQUENCE = [
    ['load-physics', 100],
    ['load-gnc', 250],
    ['load-render', 450],
    ['load-world', 600],
];

export function runBootSequence(dom) {
    for (const [id, delay] of LOAD_SEQUENCE) {
        setTimeout(() => {
            const element = document.getElementById(id);
            if (!element) {
                return;
            }
            element.textContent = element.textContent.replace('. . .', '[OK]');
            element.classList.add('ready');
        }, delay);
    }

    setTimeout(() => {
        if (!dom.loadingScreen) {
            return;
        }

        dom.loadingScreen.classList.add('fade-out');
        setTimeout(() => dom.loadingScreen?.remove(), 500);
    }, 800);
}
