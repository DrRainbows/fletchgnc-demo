/**
 * FletchGNC Physics Engine
 *
 * Full 6-DOF bolt flight dynamics with RK4 integration.
 * Faithful port of src/environment/physics.py.
 *
 * Coordinate System:
 *   World: X = downrange, Y = lateral (right), Z = vertical (up)
 *   Body:  x_b = along bolt axis (tip), y_b = right, z_b = up
 *
 * Advanced models:
 *   - Magnus effect (spin-induced lateral force)
 *   - Reynolds number-dependent drag correction
 *   - Atmospheric density model (altitude-dependent)
 *   - Full Dryden turbulence spectrum
 *   - Enhanced pitch/roll damping with AoA dependency
 *   - Body lift pitching moment (slender body theory)
 */

import { V3, Quat, Mat3, clamp } from './math.js';

// ─── Bolt Configuration ─────────────────────────────────────────────────────

export const BOLT_CONFIG = {
    mass: 0.050,                    // kg (~50g with electronics)
    length: 0.508,                  // m (20 inches)
    diameter: 0.0088,               // m (8.8mm shaft)
    Cd_0: 0.3,                      // Zero-AoA drag coefficient
    Cd_alpha: 2.0,                  // Crossflow drag coefficient
    liftCoefficientPerRad: 2.0,     // CL_alpha for fins
    referenceArea: 6.1e-5,          // m^2 (cross-sectional)
    finArea: 0.0004,                // m^2 per fin
    maxFinDeflection: 0.1745,       // rad (10 degrees)
    finMomentArm: 0.40,             // m (CG to fin CP)
    I_axial: 4.84e-7,              // kg*m^2
    I_transverse: 1.075e-3,        // kg*m^2
    initialVelocity: 120.0,         // m/s (~395 fps)
    actuatorBandwidth: 200.0,       // Hz
    maxFinRate: 17.45,              // rad/s (~1000 deg/s)

    // Enhanced physics model parameters
    C_magnus: 0.1,                  // Magnus force coefficient scaling
    enableReynoldsCorrection: true, // Re-dependent Cd
    dynamicViscosity: 1.81e-5,      // Pa*s at ~20C
    atmosphericModel: false,        // Altitude-dependent rho (off by default)
    drydenTurbulence: false,        // Full Dryden model (off by default)
    turbulenceIntensity: 1.0,       // Sigma multiplier
    C_rollDamp: 0.01,               // Roll damping coefficient
    speedOfSound: 343.0,            // m/s at sea level, 20C
};

export const PHYSICS_CONSTANTS = {
    g: 9.81,
    rho: 1.225,
    maxAngular: 50.0,
};

// ─── Bolt State ─────────────────────────────────────────────────────────────

export class BoltState {
    constructor() {
        this.position = [0, 0, 0];
        this.velocity = [120, 0, 0];
        this.quaternion = [1, 0, 0, 0];     // [w, x, y, z]
        this.angularVelocity = [0, 0, 0];   // body frame
        this.time = 0;
        this.finPitch = 0;                   // commanded
        this.finYaw = 0;                     // commanded
        this.actualFinPitch = 0;             // after actuator dynamics
        this.actualFinYaw = 0;
        this.inFlight = true;
        this.hitGround = false;

        // Enhanced telemetry
        this.reynoldsNumber = 0;
        this.machNumber = 0;
        this.dynamicPressure = 0;
        this.dragCoefficient = 0;
    }

    copy() {
        const s = new BoltState();
        s.position = V3.copy(this.position);
        s.velocity = V3.copy(this.velocity);
        s.quaternion = Quat.copy(this.quaternion);
        s.angularVelocity = V3.copy(this.angularVelocity);
        s.time = this.time;
        s.finPitch = this.finPitch;
        s.finYaw = this.finYaw;
        s.actualFinPitch = this.actualFinPitch;
        s.actualFinYaw = this.actualFinYaw;
        s.inFlight = this.inFlight;
        s.hitGround = this.hitGround;
        s.reynoldsNumber = this.reynoldsNumber;
        s.machNumber = this.machNumber;
        s.dynamicPressure = this.dynamicPressure;
        s.dragCoefficient = this.dragCoefficient;
        return s;
    }

    get speed() { return V3.mag(this.velocity); }

    get bodyXAxis() { return Quat.rotate(this.quaternion, [1, 0, 0]); }

    get angleOfAttack() {
        const spd = this.speed;
        if (spd < 0.1) return 0;
        const velUnit = V3.scale(this.velocity, 1 / spd);
        const bodyX = this.bodyXAxis;
        const cosAoa = clamp(V3.dot(velUnit, bodyX), -1, 1);
        return Math.acos(cosAoa);
    }

    get eulerAngles() { return Quat.toEuler(this.quaternion); }
}

// ─── Physics Engine ─────────────────────────────────────────────────────────

export class BoltPhysics {
    constructor(config = BOLT_CONFIG) {
        this.cfg = config;
        this.g = PHYSICS_CONSTANTS.g;
        this.rho = PHYSICS_CONSTANTS.rho;

        // Atmospheric constants
        this.RHO_0 = 1.225;    // kg/m^3
        this.H_SCALE = 8500.0; // m
        this.T_0 = 293.15;     // K (20C)
        this.MU_0 = 1.81e-5;   // Pa*s

        // Precompute inertia tensor and inverse (diagonal)
        this.I_body = [config.I_axial, config.I_transverse, config.I_transverse];
        this.I_body_inv = [1 / config.I_axial, 1 / config.I_transverse, 1 / config.I_transverse];

        // Wind
        this.windVelocity = [0, 0, 0];
        this.windGustIntensity = 0;

        // Dryden turbulence filter state
        this._drydenGustState = [0, 0, 0];
    }

    /**
     * Get air density at altitude (optionally using exponential atmosphere model).
     */
    _getAirDensity(altitude) {
        if (!this.cfg.atmosphericModel) {
            return this.rho;
        }
        const h = Math.max(altitude, 0.0);
        return this.RHO_0 * Math.exp(-h / this.H_SCALE);
    }

    /**
     * Get temperature at altitude (standard lapse rate).
     */
    _getTemperature(altitude) {
        const h = Math.max(altitude, 0.0);
        return this.T_0 - 0.0065 * h;
    }

    /**
     * Get dynamic viscosity at altitude.
     */
    _getViscosity(altitude) {
        if (!this.cfg.atmosphericModel) {
            return this.cfg.dynamicViscosity;
        }
        const T = this._getTemperature(altitude);
        return this.MU_0 * Math.pow(T / this.T_0, 0.76);
    }

    _getWind(state) {
        const w = V3.copy(this.windVelocity);

        if (this.cfg.drydenTurbulence && this.windGustIntensity > 0) {
            // Use Dryden turbulence filter state
            w[0] += this._drydenGustState[0];
            w[1] += this._drydenGustState[1];
            w[2] += this._drydenGustState[2];
        } else if (this.windGustIntensity > 0) {
            const t = state.time;
            const intensity = this.windGustIntensity;
            w[0] += intensity * (Math.sin(2.1 * t) + 0.5 * Math.sin(7.3 * t)) / 1.5;
            w[1] += intensity * (Math.sin(3.7 * t) + 0.5 * Math.sin(11.1 * t)) / 1.5;
            w[2] += intensity * (Math.sin(5.3 * t) + 0.5 * Math.sin(13.7 * t)) / 1.5;
        }
        return w;
    }

    /**
     * Update Dryden turbulence filter state per MIL-HDBK-1797.
     */
    _updateDrydenGust(state, dt) {
        if (!this.cfg.drydenTurbulence || this.windGustIntensity <= 0) {
            return;
        }

        const airspeed = V3.mag(state.velocity);
        if (airspeed < 0.1) {
            return;
        }

        const h = Math.max(state.position[2], 0.01);
        const intensity = this.cfg.turbulenceIntensity;
        const W20 = this.windGustIntensity;

        // Dryden scale lengths for low altitude
        const denom = Math.pow(0.177 + 0.000823 * h, 1.2);
        const Lu = denom > 1e-10 ? h / denom : h;
        const Lv = Lu;
        const Lw = h;

        const sigma_w = 0.1 * W20 * intensity;
        const sigma_u = sigma_w * intensity;
        const sigma_v = sigma_u;

        const scaleLengths = [Lu, Lv, Lw];
        const sigmas = [sigma_u, sigma_v, sigma_w];

        for (let i = 0; i < 3; i++) {
            const L = Math.max(scaleLengths[i], 0.01);
            const alpha = clamp(airspeed * dt / L, 0.0, 1.0);
            // Use Box-Muller for normally-distributed random number
            const u1 = Math.random();
            const u2 = Math.random();
            const noise = Math.sqrt(-2.0 * Math.log(u1 + 1e-30)) * Math.cos(2.0 * Math.PI * u2) * sigmas[i];
            this._drydenGustState[i] = (1.0 - alpha) * this._drydenGustState[i] + alpha * noise;
        }
    }

    /**
     * Compute total forces (world frame) and moments (body frame).
     */
    computeForcesAndMoments(state) {
        const cfg = this.cfg;
        const wind = this._getWind(state);
        const airspeedVec = V3.sub(state.velocity, wind);
        const airspeed = V3.mag(airspeedVec);

        if (airspeed < 0.1) {
            return {
                force: [0, 0, -cfg.mass * this.g],
                moment: [0, 0, 0]
            };
        }

        const airUnit = V3.scale(airspeedVec, 1 / airspeed);

        // Atmospheric properties
        const altitude = state.position[2];
        const rho = this._getAirDensity(altitude);
        const mu = this._getViscosity(altitude);

        const q = 0.5 * rho * airspeed * airspeed;

        // Enhanced telemetry
        state.dynamicPressure = q;
        state.machNumber = airspeed / (cfg.speedOfSound || 343.0);

        // Reynolds number
        const Re = rho * airspeed * cfg.diameter / mu;
        state.reynoldsNumber = Re;

        // Gravity
        const F_gravity = [0, 0, -cfg.mass * this.g];

        // Angle of attack
        const bodyX = state.bodyXAxis;
        const cosAoa = clamp(V3.dot(airUnit, bodyX), -1, 1);
        const aoa = Math.acos(cosAoa);
        const sinAoa = Math.sin(aoa);

        // AoA-dependent drag with Reynolds correction
        let Cd_total = cfg.Cd_0 + cfg.Cd_alpha * sinAoa * sinAoa;

        if (cfg.enableReynoldsCorrection) {
            const Re_ref = rho * 100.0 * cfg.diameter / mu;
            if (Re_ref > 0.0) {
                const Re_ratio = Re / Re_ref;
                const Cd_correction = 1.0 + 0.15 * Math.abs(Re_ratio - 1.0);
                Cd_total *= Cd_correction;
            }
        }

        state.dragCoefficient = Cd_total;
        const F_drag = V3.scale(airUnit, -q * Cd_total * cfg.referenceArea);

        // Lift direction
        let liftDir = [0, 0, 0];
        let liftDirValid = false;
        if (aoa > 0.001) {
            liftDir = V3.sub(bodyX, V3.scale(airUnit, cosAoa));
            const ldNorm = V3.mag(liftDir);
            if (ldNorm > 0.001) {
                liftDir = V3.scale(liftDir, 1 / ldNorm);
                liftDirValid = true;
            }
        }

        // Body crossflow lift (slender body theory)
        let F_bodyLift = [0, 0, 0];
        if (liftDirValid) {
            const Cn = 2.0 * sinAoa * Math.cos(aoa);
            F_bodyLift = V3.scale(liftDir, q * cfg.referenceArea * Cn);
        }

        // Fin lift from AoA
        let F_finLift = [0, 0, 0];
        if (liftDirValid) {
            const mag = q * cfg.finArea * cfg.liftCoefficientPerRad * aoa * 4;
            F_finLift = V3.scale(liftDir, mag);
        }

        // Control forces from fin deflection
        const stabilityArm = cfg.finMomentArm;
        const finArm = [-stabilityArm, 0, 0];

        // Pitch control (body Z)
        const pitchForceMag = q * cfg.liftCoefficientPerRad * state.actualFinPitch * cfg.finArea * 2;
        const pitchForceBody = [0, 0, pitchForceMag];
        const F_pitchControl = Quat.rotate(state.quaternion, pitchForceBody);

        // Yaw control (body Y)
        const yawForceMag = q * cfg.liftCoefficientPerRad * state.actualFinYaw * cfg.finArea * 2;
        const yawForceBody = [0, yawForceMag, 0];
        const F_yawControl = Quat.rotate(state.quaternion, yawForceBody);

        // Magnus effect
        let F_magnus = [0, 0, 0];
        const omega = state.angularVelocity;
        const spinRate = omega[0];

        if (Math.abs(spinRate) > 0.001) {
            const spinParam = Math.abs(spinRate) * cfg.diameter / (2.0 * airspeed);
            const C_mag = cfg.C_magnus * spinParam;
            const omegaAxialWorld = Quat.rotate(state.quaternion, [spinRate, 0, 0]);
            const magnusDir = V3.cross(omegaAxialWorld, airUnit);
            const magDirNorm = V3.mag(magnusDir);
            if (magDirNorm > 1e-10) {
                F_magnus = V3.scale(magnusDir, (rho / 2.0) * airspeed * cfg.referenceArea * C_mag);
            }
        }

        // Total force
        const F_total = [
            F_gravity[0] + F_drag[0] + F_bodyLift[0] + F_finLift[0] + F_pitchControl[0] + F_yawControl[0] + F_magnus[0],
            F_gravity[1] + F_drag[1] + F_bodyLift[1] + F_finLift[1] + F_pitchControl[1] + F_yawControl[1] + F_magnus[1],
            F_gravity[2] + F_drag[2] + F_bodyLift[2] + F_finLift[2] + F_pitchControl[2] + F_yawControl[2] + F_magnus[2]
        ];

        // ─── Moments (body frame) ───

        // Weathercock stability
        let M_stability = [0, 0, 0];
        if (aoa > 0.001 && liftDirValid) {
            const mag = q * cfg.liftCoefficientPerRad * aoa * cfg.finArea * 4 * stabilityArm;
            const momentAxisWorld = V3.cross(bodyX, liftDir);
            const momentAxisBody = Quat.rotateInverse(state.quaternion, momentAxisWorld);
            M_stability = V3.scale(momentAxisBody, -mag);
        }

        // Body lift pitching moment (slender body)
        let M_bodyLift = [0, 0, 0];
        if (aoa > 0.001 && liftDirValid) {
            const xCpXCg = cfg.finMomentArm;
            const bodyLiftMomentMag = 2.0 * q * cfg.referenceArea * cfg.length
                * sinAoa * Math.cos(aoa) * xCpXCg / cfg.length;
            const momentAxisWorld = V3.cross(bodyX, liftDir);
            const momentAxisBody = Quat.rotateInverse(state.quaternion, momentAxisWorld);
            const momentAxisNorm = V3.mag(momentAxisBody);
            if (momentAxisNorm > 1e-10) {
                const momentAxisUnit = V3.scale(momentAxisBody, 1 / momentAxisNorm);
                M_bodyLift = V3.scale(momentAxisUnit, -bodyLiftMomentMag);
            }
        }

        // Control moments
        const M_pitchControl = V3.negate(V3.cross(finArm, pitchForceBody));
        const M_yawControl = V3.negate(V3.cross(finArm, yawForceBody));

        // Pitch damping (AoA-enhanced Cmq derivative model)
        const d = cfg.diameter;
        const Cmq = -cfg.liftCoefficientPerRad * (stabilityArm / d) ** 2 * (cfg.finArea / cfg.referenceArea);
        const Cmq_eff = Cmq * (1.0 + 2.0 * aoa);

        const dampFactor = Cmq_eff * q * cfg.referenceArea * d / (2.0 * airspeed);

        // Roll damping
        const rollDamping = -(cfg.C_rollDamp || 0.01) * q * cfg.referenceArea * d
            * omega[0] / (2.0 * airspeed);

        const M_damping = [rollDamping, dampFactor * omega[1], dampFactor * omega[2]];

        const M_total = [
            M_stability[0] + M_bodyLift[0] + M_pitchControl[0] + M_yawControl[0] + M_damping[0],
            M_stability[1] + M_bodyLift[1] + M_pitchControl[1] + M_yawControl[1] + M_damping[1],
            M_stability[2] + M_bodyLift[2] + M_pitchControl[2] + M_yawControl[2] + M_damping[2]
        ];

        return { force: F_total, moment: M_total };
    }

    /**
     * Compute state derivatives for RK4 integration.
     */
    derivatives(state) {
        const { force, moment } = this.computeForcesAndMoments(state);

        const dPosition = V3.copy(state.velocity);
        const dVelocity = V3.scale(force, 1 / this.cfg.mass);

        // Euler's equations: dw = I^-1 (M - w x Iw)
        const omega = state.angularVelocity;
        const Iw = [
            this.I_body[0] * omega[0],
            this.I_body[1] * omega[1],
            this.I_body[2] * omega[2]
        ];
        const wxIw = V3.cross(omega, Iw);
        const dAngVel = [
            this.I_body_inv[0] * (moment[0] - wxIw[0]),
            this.I_body_inv[1] * (moment[1] - wxIw[1]),
            this.I_body_inv[2] * (moment[2] - wxIw[2])
        ];

        // Quaternion derivative
        const dQuat = Quat.derivative(state.quaternion, omega);

        return { dPosition, dVelocity, dQuat, dAngVel };
    }

    /**
     * Apply actuator dynamics: first-order lag + rate limiting.
     */
    _applyActuatorDynamics(state, cmdPitch, cmdYaw, dt) {
        const cfg = this.cfg;
        const tau = 1 / (2 * Math.PI * cfg.actuatorBandwidth);
        const alpha = dt / (tau + dt);

        let deltaPitch = alpha * (cmdPitch - state.actualFinPitch);
        let deltaYaw = alpha * (cmdYaw - state.actualFinYaw);

        const maxDelta = cfg.maxFinRate * dt;
        deltaPitch = clamp(deltaPitch, -maxDelta, maxDelta);
        deltaYaw = clamp(deltaYaw, -maxDelta, maxDelta);

        return [
            state.actualFinPitch + deltaPitch,
            state.actualFinYaw + deltaYaw
        ];
    }

    /**
     * Advance simulation by one time step using RK4 integration.
     */
    step(state, dt, finPitch = 0, finYaw = 0) {
        if (!state.inFlight) return state;

        const newState = state.copy();
        newState.finPitch = clamp(finPitch, -this.cfg.maxFinDeflection, this.cfg.maxFinDeflection);
        newState.finYaw = clamp(finYaw, -this.cfg.maxFinDeflection, this.cfg.maxFinDeflection);

        // Actuator dynamics
        const [actPitch, actYaw] = this._applyActuatorDynamics(newState, newState.finPitch, newState.finYaw, dt);
        newState.actualFinPitch = actPitch;
        newState.actualFinYaw = actYaw;

        // Update Dryden turbulence
        this._updateDrydenGust(newState, dt);

        // RK4 integration
        const k1 = this.derivatives(newState);

        const s2 = newState.copy();
        s2.position = V3.addScaled(newState.position, k1.dPosition, 0.5 * dt);
        s2.velocity = V3.addScaled(newState.velocity, k1.dVelocity, 0.5 * dt);
        s2.quaternion = Quat.normalize(Quat.addScaled(newState.quaternion, k1.dQuat, 0.5 * dt));
        s2.angularVelocity = V3.addScaled(newState.angularVelocity, k1.dAngVel, 0.5 * dt);
        const k2 = this.derivatives(s2);

        const s3 = newState.copy();
        s3.position = V3.addScaled(newState.position, k2.dPosition, 0.5 * dt);
        s3.velocity = V3.addScaled(newState.velocity, k2.dVelocity, 0.5 * dt);
        s3.quaternion = Quat.normalize(Quat.addScaled(newState.quaternion, k2.dQuat, 0.5 * dt));
        s3.angularVelocity = V3.addScaled(newState.angularVelocity, k2.dAngVel, 0.5 * dt);
        const k3 = this.derivatives(s3);

        const s4 = newState.copy();
        s4.position = V3.addScaled(newState.position, k3.dPosition, dt);
        s4.velocity = V3.addScaled(newState.velocity, k3.dVelocity, dt);
        s4.quaternion = Quat.normalize(Quat.addScaled(newState.quaternion, k3.dQuat, dt));
        s4.angularVelocity = V3.addScaled(newState.angularVelocity, k3.dAngVel, dt);
        const k4 = this.derivatives(s4);

        // Combine: state + (dt/6)(k1 + 2k2 + 2k3 + k4)
        const dt6 = dt / 6;
        for (let i = 0; i < 3; i++) {
            newState.position[i] += dt6 * (k1.dPosition[i] + 2 * k2.dPosition[i] + 2 * k3.dPosition[i] + k4.dPosition[i]);
            newState.velocity[i] += dt6 * (k1.dVelocity[i] + 2 * k2.dVelocity[i] + 2 * k3.dVelocity[i] + k4.dVelocity[i]);
            newState.angularVelocity[i] += dt6 * (k1.dAngVel[i] + 2 * k2.dAngVel[i] + 2 * k3.dAngVel[i] + k4.dAngVel[i]);
        }
        for (let i = 0; i < 4; i++) {
            newState.quaternion[i] += dt6 * (k1.dQuat[i] + 2 * k2.dQuat[i] + 2 * k3.dQuat[i] + k4.dQuat[i]);
        }

        // Normalize quaternion
        newState.quaternion = Quat.normalize(newState.quaternion);

        // Clamp angular velocity
        const maxW = PHYSICS_CONSTANTS.maxAngular;
        newState.angularVelocity = V3.clamp(newState.angularVelocity, -maxW, maxW);

        newState.time = state.time + dt;

        // Ground impact
        if (newState.position[2] < 0) {
            newState.inFlight = false;
            newState.hitGround = true;
            newState.position[2] = 0;
            newState.velocity = [0, 0, 0];
        }

        return newState;
    }

    /**
     * Create initial state for bolt launch.
     */
    createLaunchState(launchPos, launchDir, initialVelocity = null) {
        const v0 = initialVelocity || this.cfg.initialVelocity;
        const dir = V3.normalize(launchDir);
        const state = new BoltState();
        state.position = V3.copy(launchPos);
        state.velocity = V3.scale(dir, v0);
        state.quaternion = Quat.fromDirection(dir);
        state.angularVelocity = [0, 0, 0];
        state.time = 0;
        state.inFlight = true;
        return state;
    }
}
