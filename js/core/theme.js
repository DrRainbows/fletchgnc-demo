/**
 * FletchGNC Theme - Colors, fonts, and drawing constants.
 * Mirrored in style.css via CSS custom properties.
 */
export const COLORS = {
    bg: '#060a10',
    panelBg: '#0c1018',
    panelBgRaised: '#111820',
    border: '#1a2535',
    borderAccent: '#1e3a50',
    borderActive: '#2a4a60',

    text: '#c0d4e8',
    textDim: '#5a7090',
    textHighlight: '#e0f0ff',
    textMuted: '#3a5070',

    cyan: '#00d4ff',
    green: '#30e060',
    red: '#ff3040',
    yellow: '#ffc830',
    orange: '#ff8c00',
    magenta: '#e040e0',
    blue: '#4080ff',

    glowCyan: 'rgba(0, 212, 255, 0.25)',
    glowRed: 'rgba(255, 48, 64, 0.25)',

    targetMarker: '#ff6040',
    reticleIdle: '#30e060',
    reticleLocked: '#ff3030',
    trajectory: '#50c8ff',
    predicted: 'rgba(0, 212, 255, 0.5)',
    ground: '#1a2a18',
    sky: '#0a1628',
    finColor: '#ff8040',
    boltBody: '#c0d0e0',
    velocityVec: '#30e060',
    aoaArc: '#ffc830',
};

export const FONTS = {
    ui: "'Inter', -apple-system, system-ui, sans-serif",
    data: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace",
    hud: "'JetBrains Mono', monospace",
};

export const FONT_SIZES = {
    xs: '10px',
    sm: '11px',
    base: '13px',
    lg: '16px',
    xl: '20px',
};

/**
 * Draw a panel background with title.
 */
export function drawPanel(ctx, x, y, w, h, title = '') {
    ctx.fillStyle = COLORS.panelBg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (title) {
        ctx.fillStyle = COLORS.textDim;
        ctx.font = `${FONT_SIZES.xs} ${FONTS.data}`;
        ctx.textAlign = 'left';
        ctx.fillText(title.toUpperCase(), x + 8, y + 14);
    }
}

/**
 * Draw text with standard parameters.
 */
export function drawText(ctx, text, x, y, color = COLORS.text, font = `12px ${FONTS.data}`, align = 'left') {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
}

/**
 * Draw a horizontal bar gauge.
 */
export function drawBar(ctx, x, y, w, h, pct, color) {
    ctx.fillStyle = '#181e28';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(1, w * Math.min(1, Math.max(0, pct))), h);
}

/**
 * Convert hex color + alpha (0-1) to rgba() string.
 * Avoids #RRGGBBAA which has spotty browser support in Canvas 2D.
 */
export function rgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Get mode display color.
 */
export function getModeColor(mode) {
    switch (mode) {
        case 'IMPACT': return COLORS.green;
        case 'MISS': return COLORS.red;
        case 'ARMED': return COLORS.yellow;
        case 'BOOST':
        case 'MIDCOURSE':
        case 'TERMINAL': return COLORS.cyan;
        default: return COLORS.textDim;
    }
}
