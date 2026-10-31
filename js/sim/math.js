/**
 * FletchGNC Math Utilities
 * 
 * Vector3, Quaternion, and Matrix3 operations.
 * All quaternions use [w, x, y, z] convention (Hamilton).
 * All vectors are plain 3-element arrays [x, y, z].
 */

// ─── Vector3 ────────────────────────────────────────────────────────────────

export const V3 = {
    create(x = 0, y = 0, z = 0) { return [x, y, z]; },
    copy(v) { return [v[0], v[1], v[2]]; },
    zero() { return [0, 0, 0]; },

    add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
    sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    scale(v, s) { return [v[0] * s, v[1] * s, v[2] * s]; },
    negate(v) { return [-v[0], -v[1], -v[2]]; },

    dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    },

    mag(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); },
    magSq(v) { return v[0] * v[0] + v[1] * v[1] + v[2] * v[2]; },

    normalize(v) {
        const m = V3.mag(v);
        return m > 1e-12 ? [v[0] / m, v[1] / m, v[2] / m] : [0, 0, 0];
    },

    lerp(a, b, t) {
        return [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t
        ];
    },

    addScaled(a, b, s) {
        return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
    },

    clamp(v, min, max) {
        return [
            Math.max(min, Math.min(max, v[0])),
            Math.max(min, Math.min(max, v[1])),
            Math.max(min, Math.min(max, v[2]))
        ];
    },

    mulElementwise(a, b) {
        return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
    },

    toString(v, decimals = 3) {
        return `[${v[0].toFixed(decimals)}, ${v[1].toFixed(decimals)}, ${v[2].toFixed(decimals)}]`;
    }
};


// ─── Quaternion [w, x, y, z] ────────────────────────────────────────────────

export const Quat = {
    identity() { return [1, 0, 0, 0]; },
    copy(q) { return [q[0], q[1], q[2], q[3]]; },

    /**
     * Hamilton product: q1 * q2
     */
    multiply(q1, q2) {
        const [w1, x1, y1, z1] = q1;
        const [w2, x2, y2, z2] = q2;
        return [
            w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
            w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
            w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2
        ];
    },

    normalize(q) {
        const m = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
        if (m < 1e-10 || !isFinite(m)) return [1, 0, 0, 0];
        return [q[0] / m, q[1] / m, q[2] / m, q[3] / m];
    },

    /**
     * Quaternion from axis-angle representation.
     */
    fromAxisAngle(axis, angle) {
        const half = angle / 2;
        const s = Math.sin(half);
        return [Math.cos(half), axis[0] * s, axis[1] * s, axis[2] * s];
    },

    /**
     * Construct quaternion that rotates [1,0,0] to the given direction.
     */
    fromDirection(dir) {
        const d = V3.normalize(dir);
        const xAxis = [1, 0, 0];

        const dot = V3.dot(xAxis, d);
        if (dot > 0.9999) return [1, 0, 0, 0];
        if (dot < -0.9999) return [0, 0, 1, 0]; // 180 deg about Y

        const axis = V3.normalize(V3.cross(xAxis, d));
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        return Quat.fromAxisAngle(axis, angle);
    },

    /**
     * Convert quaternion to 3x3 rotation matrix (body-to-world).
     * Returns row-major [r00, r01, r02, r10, r11, r12, r20, r21, r22].
     */
    toMat3(q) {
        const [w, x, y, z] = q;
        const xx = x * x, yy = y * y, zz = z * z;
        const xy = x * y, xz = x * z, yz = y * z;
        const wx = w * x, wy = w * y, wz = w * z;
        return [
            1 - 2 * (yy + zz), 2 * (xy - wz),     2 * (xz + wy),
            2 * (xy + wz),     1 - 2 * (xx + zz),  2 * (yz - wx),
            2 * (xz - wy),     2 * (yz + wx),       1 - 2 * (xx + yy)
        ];
    },

    /**
     * Rotate a vector by this quaternion (body-to-world transform).
     */
    rotate(q, v) {
        const m = Quat.toMat3(q);
        return Mat3.mulVec(m, v);
    },

    /**
     * Rotate a vector by the inverse (conjugate) quaternion (world-to-body).
     */
    rotateInverse(q, v) {
        const qInv = [q[0], -q[1], -q[2], -q[3]];
        return Quat.rotate(qInv, v);
    },

    /**
     * Quaternion derivative: dq/dt = 0.5 * q * [0, wx, wy, wz]
     */
    derivative(q, omega) {
        const omegaQ = [0, omega[0], omega[1], omega[2]];
        const prod = Quat.multiply(q, omegaQ);
        return [prod[0] * 0.5, prod[1] * 0.5, prod[2] * 0.5, prod[3] * 0.5];
    },

    /**
     * Extract Euler angles [roll, pitch, yaw] (XYZ intrinsic).
     */
    toEuler(q) {
        const m = Quat.toMat3(q);
        // m = row-major: [r00, r01, r02, r10, r11, r12, r20, r21, r22]
        const r00 = m[0], r01 = m[1], r02 = m[2];
        const r10 = m[3], r11 = m[4], r12 = m[5];
        const r20 = m[6], r21 = m[7], r22 = m[8];

        const pitch = Math.asin(Math.max(-1, Math.min(1, -r20)));
        let roll, yaw;
        if (Math.abs(r20) < 0.9999) {
            roll = Math.atan2(r21, r22);
            yaw = Math.atan2(r10, r00);
        } else {
            roll = Math.atan2(-r12, r11);
            yaw = 0;
        }
        return [roll, pitch, yaw];
    },

    addScaled(q, dq, s) {
        return [q[0] + dq[0] * s, q[1] + dq[1] * s, q[2] + dq[2] * s, q[3] + dq[3] * s];
    }
};


// ─── Matrix 3x3 (row-major, 9 elements) ────────────────────────────────────

export const Mat3 = {
    identity() { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; },

    /**
     * Matrix-vector multiply: M * v
     */
    mulVec(m, v) {
        return [
            m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
            m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
            m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
        ];
    },

    /**
     * Diagonal matrix from 3-element array.
     */
    diag(d) {
        return [d[0], 0, 0, 0, d[1], 0, 0, 0, d[2]];
    },

    /**
     * Inverse of a 3x3 matrix. Returns null if singular.
     */
    inverse(m) {
        const [a, b, c, d, e, f, g, h, i] = m;
        const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
        if (Math.abs(det) < 1e-15) return null;
        const invDet = 1 / det;
        return [
            (e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet,
            (f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet,
            (d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet
        ];
    },

    /**
     * Scale all elements by a scalar.
     */
    scale(m, s) {
        return m.map(v => v * s);
    }
};


// ─── Utility ────────────────────────────────────────────────────────────────

export function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

export function radians(deg) { return deg * Math.PI / 180; }
export function degrees(rad) { return rad * 180 / Math.PI; }

/**
 * Gaussian random number (Box-Muller transform).
 */
let _spareGaussian = null;
let _hasSpare = false;

export function gaussRandom(mean = 0, sigma = 1) {
    if (_hasSpare) {
        _hasSpare = false;
        return mean + sigma * _spareGaussian;
    }
    let u, v, s;
    do {
        u = Math.random() * 2 - 1;
        v = Math.random() * 2 - 1;
        s = u * u + v * v;
    } while (s >= 1 || s === 0);
    s = Math.sqrt(-2 * Math.log(s) / s);
    _spareGaussian = v * s;
    _hasSpare = true;
    return mean + sigma * u * s;
}

/**
 * Generate 3-element array of Gaussian random values.
 */
export function gaussRandom3(mean = 0, sigma = 1) {
    return [gaussRandom(mean, sigma), gaussRandom(mean, sigma), gaussRandom(mean, sigma)];
}
