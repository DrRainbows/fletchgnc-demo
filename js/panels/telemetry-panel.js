/**
 * Telemetry Panel - Structured instrument groups with collapsible sections.
 * Displays navigation, guidance, control, dynamics, margins, and session data.
 */
import { UIPanel } from '../core/ui-panel.js';
import { COLORS, FONTS, drawText, drawBar, getModeColor } from '../core/theme.js';
import { store } from '../core/state-store.js';
import { V3, degrees } from '../sim/math.js';
import { BOLT_CONFIG } from '../sim/physics.js';

export class TelemetryPanel extends UIPanel {
    constructor() {
        super('panel-telemetry', { title: 'TELEMETRY' });

        this.logs = [];
        this.maxLogs = 12;
        this._scrollOffset = 0;
        this._contentHeight = 0;

        // Collapsible groups
        this.groups = {
            nav: { label: 'NAVIGATION', expanded: true },
            guidance: { label: 'GUIDANCE', expanded: true },
            control: { label: 'CONTROL', expanded: true },
            dynamics: { label: 'DYNAMICS', expanded: false },
            margins: { label: 'MARGINS', expanded: false },
            aero: { label: 'AERODYNAMICS', expanded: false },
            session: { label: 'SESSION', expanded: true },
        };

        // Always re-render during flight
        store.on('inFlight', () => this.invalidate());
        store.on('boltState', () => { if (store.inFlight) this.invalidate(); });
        store.on('flightMode', () => this.invalidate());
        store.on('isArmed', () => this.invalidate());

        // Scroll handling
        const container = document.getElementById('panel-telemetry');
        if (container) {
            container.addEventListener('wheel', e => {
                e.preventDefault();
                this._scrollOffset = Math.max(0,
                    Math.min(this._contentHeight - 200,
                        this._scrollOffset + e.deltaY * 0.5));
                this.invalidate();
            }, { passive: false });

            container.addEventListener('click', e => {
                const rect = container.getBoundingClientRect();
                const clickY = e.clientY - rect.top + this._scrollOffset;
                // Check if click is on a section header
                for (const hit of this._headerHitZones || []) {
                    if (clickY >= hit.y && clickY < hit.y + hit.h) {
                        this.groups[hit.key].expanded = !this.groups[hit.key].expanded;
                        this.invalidate();
                        break;
                    }
                }
            });
        }
    }

    addLog(msg) {
        this.logs.push(msg);
        if (this.logs.length > this.maxLogs) this.logs.shift();
        this.invalidate();
    }

    render(ctx, w, h) {
        ctx.fillStyle = COLORS.panelBg;
        ctx.fillRect(0, 0, w, h);

        const hitZones = [];
        let y = 24 - this._scrollOffset;
        const col1 = 10;
        const col2 = w * 0.52;
        const lineH = 15;
        const font = FONTS.data;

        const row = (label, value, color = COLORS.text) => {
            if (y > -lineH && y < h + lineH) {
                drawText(ctx, label, col1 + 14, y, COLORS.textDim, `10px ${font}`);
                drawText(ctx, value, col2, y, color, `10px ${font}`);
            }
            y += lineH;
        };

        const sectionHeader = (key, text, expandable = true) => {
            y += 4;
            const headerY = y;

            if (y > -20 && y < h + 20) {
                // Dark background bar
                ctx.fillStyle = '#0d1520';
                ctx.fillRect(0, y - 12, w, 18);

                // Left accent bar
                ctx.fillStyle = COLORS.borderAccent;
                ctx.fillRect(0, y - 12, 3, 18);

                // Header text
                drawText(ctx, text, col1 + 6, y + 1, COLORS.textDim, `bold 10px ${font}`);

                // Collapse indicator
                if (expandable) {
                    const expanded = this.groups[key]?.expanded;
                    const chevron = expanded ? '\u25BC' : '\u25B6';
                    drawText(ctx, chevron, w - 16, y + 1, '#2a4060', `8px ${font}`);
                }
            }

            if (expandable) {
                hitZones.push({ key, y: headerY - 12 + this._scrollOffset, h: 18 });
            }
            y += lineH + 2;
        };

        const flightMode = store.flightMode || 'IDLE';
        const navState = store.navState;
        const guidanceCmd = store.guidanceCmd;
        const boltState = store.boltState;
        const flightTime = store.flightTime || 0;
        const selectedTarget = store.selectedTarget;
        const inFlight = store.inFlight;

        // ─── Status ───
        sectionHeader('_status', 'STATUS', false);
        row('MODE', flightMode, getModeColor(flightMode));
        row('TIME', `${flightTime.toFixed(3)}s`);
        row('STATE', store.isArmed ? 'ARMED' : (inFlight ? 'FLIGHT' : 'IDLE'),
            store.isArmed ? COLORS.red : (inFlight ? COLORS.cyan : COLORS.textDim));

        // ─── Navigation ───
        sectionHeader('nav', 'NAVIGATION');
        if (this.groups.nav.expanded) {
            if (navState) {
                row('POS X', `${navState.position[0].toFixed(1)}m`);
                row('POS Y', `${navState.position[1].toFixed(2)}m`);
                row('POS Z', `${navState.position[2].toFixed(2)}m`);
                row('SPEED', `${navState.speed.toFixed(1)} m/s`, COLORS.cyan);
            } else if (boltState) {
                row('POS X', `${boltState.position[0].toFixed(1)}m`);
                row('POS Y', `${boltState.position[1].toFixed(2)}m`);
                row('POS Z', `${boltState.position[2].toFixed(2)}m`);
                row('SPEED', `${(boltState.speed || 0).toFixed(1)} m/s`, COLORS.cyan);
            }

            if (boltState && boltState.eulerAngles) {
                const e = boltState.eulerAngles;
                row('ROLL', `${degrees(e[0]).toFixed(1)}\u00B0`);
                row('PITCH', `${degrees(e[1]).toFixed(1)}\u00B0`);
                row('YAW', `${degrees(e[2]).toFixed(1)}\u00B0`);
            }
        }

        // ─── Guidance ───
        sectionHeader('guidance', 'GUIDANCE');
        if (this.groups.guidance.expanded) {
            let rangeToTarget = 0;
            if (selectedTarget) {
                const refPos = navState ? navState.position : store.scopePosition;
                rangeToTarget = V3.mag(V3.sub(selectedTarget.position, refPos));
            }
            row('RANGE', `${rangeToTarget.toFixed(1)}m`);

            if (guidanceCmd) {
                // Guidance mode indicator
                const gMode = guidanceCmd.guidanceMode || guidanceCmd.blendAlpha !== undefined
                    ? `BLEND(${(guidanceCmd.blendAlpha || 0).toFixed(2)})`
                    : 'PN';
                row('LAW', gMode, COLORS.cyan);

                row('Vc', `${guidanceCmd.closingVelocity.toFixed(1)} m/s`);
                if (guidanceCmd.rangeToTarget !== undefined) {
                    row('GNC RNG', `${guidanceCmd.rangeToTarget.toFixed(1)}m`);
                }
                if (guidanceCmd.timeToIntercept !== undefined && guidanceCmd.timeToIntercept < 100) {
                    row('TTI', `${guidanceCmd.timeToIntercept.toFixed(3)}s`, COLORS.yellow);
                }
                const losRateMag = V3.mag(guidanceCmd.losRate);
                row('LOS RATE', `${losRateMag.toFixed(3)} rad/s`);
                const accelMag = V3.mag(guidanceCmd.accelCmd);
                row('ACCEL CMD', `${(accelMag / 9.81).toFixed(1)}g`);

                // Per-axis accel breakdown
                if (guidanceCmd.accelCmd) {
                    const ap = guidanceCmd.accelCmd[1] || 0;
                    const ay = guidanceCmd.accelCmd[2] || 0;
                    row('  PITCH', `${(ap / 9.81).toFixed(2)}g`, COLORS.finColor);
                    row('  YAW', `${(ay / 9.81).toFixed(2)}g`, COLORS.magenta);
                }

                // ZEM magnitude (optimal/blended guidance)
                if (guidanceCmd.zem) {
                    const zemMag = V3.mag(guidanceCmd.zem);
                    const zemColor = zemMag < 0.5 ? COLORS.green : zemMag < 2.0 ? COLORS.yellow : COLORS.red;
                    row('ZEM', `${zemMag.toFixed(2)}m`, zemColor);
                }

                // Effective N
                if (guidanceCmd.nEff !== undefined) {
                    row('N_eff', guidanceCmd.nEff.toFixed(2));
                }
            }
        }

        // ─── Control ───
        sectionHeader('control', 'CONTROL');
        if (this.groups.control.expanded) {
            const lastLog = store.flightLog.length > 0 ? store.flightLog[store.flightLog.length - 1] : null;
            const finP = lastLog ? lastLog.finPitch : (boltState ? boltState.actualFinPitch : 0);
            const finY = lastLog ? lastLog.finYaw : (boltState ? boltState.actualFinYaw : 0);
            const maxDefl = BOLT_CONFIG.maxFinDeflection;

            row('FIN PITCH', `${degrees(finP || 0).toFixed(1)}\u00B0`, COLORS.finColor);
            if (y > 0 && y < h) {
                drawBar(ctx, col2 + 50, y - lineH + 4, w - col2 - 60, 5,
                    Math.abs(finP || 0) / maxDefl, COLORS.finColor);
            }

            row('FIN YAW', `${degrees(finY || 0).toFixed(1)}\u00B0`, COLORS.magenta);
            if (y > 0 && y < h) {
                drawBar(ctx, col2 + 50, y - lineH + 4, w - col2 - 60, 5,
                    Math.abs(finY || 0) / maxDefl, COLORS.magenta);
            }

            const totalDefl = Math.sqrt((finP || 0) ** 2 + (finY || 0) ** 2);
            const satPct = totalDefl / maxDefl;
            row('TOTAL', `${degrees(totalDefl).toFixed(1)}\u00B0`, satPct > 0.9 ? COLORS.red : COLORS.text);
        }

        // ─── Dynamics (collapsed by default) ───
        sectionHeader('dynamics', 'DYNAMICS');
        if (this.groups.dynamics.expanded) {
            if (boltState && boltState.angularVelocity) {
                const av = boltState.angularVelocity;
                row('ROLL RATE', `${degrees(av[0]).toFixed(1)}\u00B0/s`);
                row('PITCH RATE', `${degrees(av[1]).toFixed(1)}\u00B0/s`, COLORS.finColor);
                row('YAW RATE', `${degrees(av[2]).toFixed(1)}\u00B0/s`, COLORS.magenta);
            }

            // Acceleration in g's from trajectory
            const traj = store.trajectory;
            if (traj.length >= 2) {
                const curr = traj[traj.length - 1];
                const prev = traj[traj.length - 2];
                const dt = curr.time - prev.time;
                if (dt > 0) {
                    const dv = V3.sub(curr.velocity, prev.velocity);
                    const accel = V3.mag(V3.scale(dv, 1 / dt));
                    row('ACCEL', `${(accel / 9.81).toFixed(1)}g`, COLORS.cyan);
                }
            }

            // Kinetic energy
            if (boltState) {
                const ke = 0.5 * BOLT_CONFIG.mass * (boltState.speed || 0) ** 2;
                row('KE', `${ke.toFixed(1)} J`, COLORS.yellow);
            }
        }

        // ─── Margins (collapsed by default) ───
        sectionHeader('margins', 'MARGINS');
        if (this.groups.margins.expanded) {
            if (boltState) {
                const cmdP = boltState.finPitch || 0;
                const actP = boltState.actualFinPitch || 0;
                const cmdY = boltState.finYaw || 0;
                const actY = boltState.actualFinYaw || 0;
                const maxDefl = BOLT_CONFIG.maxFinDeflection;

                row('CMD \u03B4p', `${degrees(cmdP).toFixed(1)}\u00B0`, 'rgba(255, 128, 64, 0.5)');
                row('ACT \u03B4p', `${degrees(actP).toFixed(1)}\u00B0`, COLORS.finColor);
                row('CMD \u03B4y', `${degrees(cmdY).toFixed(1)}\u00B0`, 'rgba(224, 64, 224, 0.5)');
                row('ACT \u03B4y', `${degrees(actY).toFixed(1)}\u00B0`, COLORS.magenta);

                // Control authority remaining
                const totalDefl = Math.sqrt(actP ** 2 + actY ** 2);
                const authority = Math.max(0, 1 - totalDefl / maxDefl);
                const authColor = authority < 0.1 ? COLORS.red : authority < 0.3 ? COLORS.yellow : COLORS.green;
                row('AUTHORITY', `${(authority * 100).toFixed(0)}%`, authColor);
                if (y > 0 && y < h) {
                    drawBar(ctx, col2 + 40, y - lineH + 4, w - col2 - 50, 5, authority, authColor);
                }

                if (authority < 0.1) {
                    y += 2;
                    if (y > 0 && y < h) {
                        drawText(ctx, '\u26A0 SATURATED', col1 + 14, y,
                            COLORS.red, `bold 9px ${font}`);
                    }
                    y += lineH;
                }
            }
        }

        // ─── Aerodynamics (collapsed by default) ───
        sectionHeader('aero', 'AERODYNAMICS');
        if (this.groups.aero.expanded) {
            if (boltState) {
                row('AoA', `${degrees(boltState.angleOfAttack || 0).toFixed(2)}\u00B0`, COLORS.aoaArc);
                const speed = boltState.speed || 0;
                const q = boltState.dynamicPressure || (0.5 * 1.225 * speed * speed);
                row('DYN PRESS', `${q.toFixed(0)} Pa`);
                const mach = boltState.machNumber || (speed / 343);
                row('MACH', mach.toFixed(3));
                if (boltState.reynoldsNumber) {
                    row('REYNOLDS', `${(boltState.reynoldsNumber / 1e5).toFixed(1)}e5`);
                }
                if (boltState.dragCoefficient) {
                    row('Cd', boltState.dragCoefficient.toFixed(4));
                }
            }
        }

        // ─── Session Stats ───
        sectionHeader('session', 'SESSION');
        if (this.groups.session.expanded) {
            row('SHOTS', `${store.shotsFired}`);
            row('HITS', `${store.hits}`, store.hits > 0 ? COLORS.green : COLORS.textDim);
            const hitPct = store.shotsFired > 0 ? (store.hits / store.shotsFired * 100).toFixed(0) : '--';
            row('HIT RATE', `${hitPct}%`, store.hits > 0 ? COLORS.green : COLORS.textDim);
            if (store.lastMissDistance !== null) {
                row('LAST MISS', `${store.lastMissDistance.toFixed(3)}m`,
                    store.lastMissDistance < 0.1 ? COLORS.green : COLORS.yellow);
            }
            if (store.selectedTarget) {
                const tgt = store.selectedTarget;
                row('TARGET', `T${tgt.id + 1} ${tgt.type.toUpperCase()}`);
                row('ZONE', store.selectedZone.toUpperCase(), COLORS.cyan);
            }
        }

        // Track content height for scrolling
        this._contentHeight = y + this._scrollOffset;
        this._headerHitZones = hitZones;

        // Scrollbar indicator
        if (this._contentHeight > h) {
            const scrollRatio = this._scrollOffset / (this._contentHeight - h);
            const barHeight = Math.max(20, (h / this._contentHeight) * h);
            const barY = scrollRatio * (h - barHeight);
            ctx.fillStyle = '#1a2535';
            ctx.fillRect(w - 3, barY, 2, barHeight);
        }

        // ─── Log Messages (fixed at bottom) ───
        const logH = this.logs.length * 12 + 8;
        const logTop = h - logH;
        ctx.fillStyle = 'rgba(10, 14, 20, 0.88)';
        ctx.fillRect(0, logTop, w, logH);

        ctx.strokeStyle = COLORS.border;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, logTop);
        ctx.lineTo(w, logTop);
        ctx.stroke();

        let ly = logTop + 12;
        for (const log of this.logs) {
            drawText(ctx, log, col1, ly, '#6888a8', `10px ${font}`);
            ly += 12;
        }
    }
}
