import { COLORS, FONTS, drawText, rgba } from '../../core/theme.js';

export function drawScopeBackground(ctx) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(w, h) * 0.6;

    ctx.fillStyle = '#030508';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    const groundY = cy + h * 0.15;

    const skyGradient = ctx.createLinearGradient(0, cy - radius, 0, groundY);
    skyGradient.addColorStop(0, '#060e20');
    skyGradient.addColorStop(0.4, '#0a1830');
    skyGradient.addColorStop(0.8, '#121e38');
    skyGradient.addColorStop(1, '#182840');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, w, groundY);

    ctx.fillStyle = 'rgba(200, 220, 255, 0.06)';
    const starSeed = [0.12, 0.34, 0.56, 0.78, 0.91, 0.23, 0.67, 0.45];
    for (let index = 0; index < starSeed.length; index++) {
        const sx = cx - radius * 0.8 + starSeed[index] * radius * 1.6;
        const sy = cy - radius * 0.9 + starSeed[(index + 3) % starSeed.length] * radius * 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.6, 0, Math.PI * 2);
        ctx.fill();
    }

    const groundGradient = ctx.createLinearGradient(0, groundY, 0, cy + radius);
    groundGradient.addColorStop(0, '#1a2a18');
    groundGradient.addColorStop(0.3, '#162214');
    groundGradient.addColorStop(1, '#0a140a');
    ctx.fillStyle = groundGradient;
    ctx.fillRect(0, groundY, w, h);

    const horizonGlow = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, radius * 0.7);
    horizonGlow.addColorStop(0, 'rgba(255, 160, 60, 0.05)');
    horizonGlow.addColorStop(0.4, 'rgba(255, 120, 40, 0.02)');
    horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(cx - radius, groundY - radius * 0.25, radius * 2, radius * 0.5);

    ctx.fillStyle = '#0a180a';
    ctx.beginPath();
    ctx.moveTo(cx - radius, groundY);
    for (let index = 0; index <= 50; index++) {
        const px = cx - radius + (2 * radius * index / 50);
        const treeHeight = 2.5
            + Math.sin(index * 1.7) * 1.8
            + Math.sin(index * 3.1) * 1.2
            + Math.sin(index * 0.7) * 2;
        ctx.lineTo(px, groundY - Math.max(0, treeHeight));
    }
    ctx.lineTo(cx + radius, groundY);
    ctx.closePath();
    ctx.fill();

    const hazeGradient = ctx.createLinearGradient(0, groundY - 30, 0, groundY + 10);
    hazeGradient.addColorStop(0, 'rgba(20, 30, 45, 0)');
    hazeGradient.addColorStop(0.5, 'rgba(20, 30, 45, 0.08)');
    hazeGradient.addColorStop(1, 'rgba(20, 30, 45, 0)');
    ctx.fillStyle = hazeGradient;
    ctx.fillRect(cx - radius, groundY - 30, radius * 2, 40);

    ctx.strokeStyle = '#1a3020';
    ctx.lineWidth = 0.5;
    for (let range = 100; range <= 1000; range += 100) {
        const fy = groundY - (range / 1000) * (groundY - (cy - radius)) * 0.3;
        ctx.beginPath();
        ctx.moveTo(cx - radius, fy);
        ctx.lineTo(cx + radius, fy);
        ctx.stroke();
        ctx.fillStyle = '#2a4030';
        ctx.font = `9px ${FONTS.data}`;
        ctx.textAlign = 'left';
        ctx.fillText(`${range}m`, cx - radius + 4, fy - 2);
    }

    ctx.restore();
}

export function drawScopeMask(ctx, w, h, cx, cy, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
    ctx.fillStyle = '#020304';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#080c12';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#1a2535';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
    ctx.strokeStyle = '#0e1620';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

export function drawScopeVignette(ctx, cx, cy, radius) {
    const vignette = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.5, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.75, 'rgba(0,0,0,0.15)');
    vignette.addColorStop(0.9, 'rgba(0,0,0,0.4)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vignette;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    const blueTint = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius);
    blueTint.addColorStop(0, 'rgba(0,20,50,0)');
    blueTint.addColorStop(0.8, 'rgba(0,15,40,0)');
    blueTint.addColorStop(1, 'rgba(0,20,50,0.12)');
    ctx.fillStyle = blueTint;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
}

export function drawMilDotReticle(ctx, cx, cy, radius, isArmed) {
    const color = isArmed ? COLORS.reticleLocked : COLORS.reticleIdle;
    const gap = 14;
    const len = 40;
    const now = performance.now();

    const glowAlpha = isArmed ? (0.12 + 0.08 * Math.sin(now * 0.005)) : 0.08;
    ctx.save();
    ctx.globalAlpha = glowAlpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy);
    ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy);
    ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();

    const milSpacing = radius * 0.08;
    ctx.fillStyle = color;
    for (let index = 1; index <= 5; index++) {
        const offset = gap + len + index * milSpacing;
        const hashW = 2;
        const hashH = index % 5 === 0 ? 7 : 4;

        if (cx + offset < cx + radius * 0.88) {
            ctx.fillRect(cx + offset - hashW / 2, cy - hashH, hashW, hashH * 2);
        }
        if (cx - offset > cx - radius * 0.88) {
            ctx.fillRect(cx - offset - hashW / 2, cy - hashH, hashW, hashH * 2);
        }
        if (cy + offset < cy + radius * 0.88) {
            ctx.fillRect(cx - hashH, cy + offset - hashW / 2, hashH * 2, hashW);
        }
    }

    for (let index = 1; index <= 3; index++) {
        const offset = gap + len + index * milSpacing;
        ctx.fillStyle = rgba(color, 0.13);
        ctx.beginPath();
        ctx.arc(cx + offset, cy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy + offset, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = rgba(color, 0.5);
        ctx.beginPath();
        ctx.arc(cx + offset, cy, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy + offset, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}
