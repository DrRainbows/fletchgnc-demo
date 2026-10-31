/**
 * 3D Flight View Panel - Three.js trajectory visualization.
 *
 * Ground grid, trajectory line with vertex colors, bolt model tracking
 * quaternion, target markers, predicted trajectory, orbit controls.
 *
 * Coordinate mapping: World (X=downrange, Y=lateral, Z=up) →
 *                     Three.js (X=downrange, Y=up, Z=lateral)
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BasePanel } from '../core/base-panel.js';
import { store } from '../core/state-store.js';
import { MISSION_CONSTANTS } from '../domain/engagement-rules.js';
import { V3 } from '../sim/math.js';

// World [x,y,z] → Three.js [x,z,y] (swap Y↔Z for Y-up convention)
function toThree(p) { return [p[0], p[2], p[1]]; }

export class Flight3DPanel extends BasePanel {
    constructor() {
        super('panel-flight3d', {
            title: 'FLIGHT 3D',
            titleHtml: '<span>FLIGHT 3D</span>' +
                '<button class="cam-preset-btn" data-preset="chase">CHASE</button>' +
                '<button class="cam-preset-btn" data-preset="top">TOP</button>' +
                '<button class="cam-preset-btn" data-preset="side">SIDE</button>' +
                '<button class="cam-preset-btn" data-preset="reset">RESET</button>',
        });

        this.titleBar.style.pointerEvents = 'auto';
        this.titleBar.addEventListener('click', e => {
            const btn = e.target.closest('.cam-preset-btn');
            if (btn) this._setCameraPreset(btn.dataset.preset);
        });
        this._initialized = false;
        this._trajectoryPoints = [];
        this._predictedPoints = [];
        this._maxTrajectoryPoints = 2000;
        this.showTrajectory = true; // toggle with T key

        // Defer Three.js init until container has size
        this._initRAF = requestAnimationFrame(() => this._init());

        store.on('trajectory', () => { this._updateTrajectory(); this.needsRender = true; });
        store.on('inFlight', () => { this.needsRender = true; });
        store.on('boltState', () => { if (store.inFlight) { this._updateBolt(); this.needsRender = true; } });
        store.on('predictedTrajectory', () => { this._updatePredicted(); this.needsRender = true; });
        store.on('impactPos', () => { this._updateImpact(); this.needsRender = true; });
        store.on('selectedTarget', () => { this._updateTargets(); this.needsRender = true; });
        store.on('selectedZone', () => { this._updateTargets(); this.needsRender = true; });
        store.on('targets', () => { this._updateTargetPositions(); this.needsRender = true; });
        store.on('replayFrame', () => { this._updateReplayBolt(); this.needsRender = true; });
        store.on('replayIndex', () => { this._updateReplayTrajectory(); this.needsRender = true; });
        store.on('lastPredictedTrajectory', () => { this._updateGhostLine(); this.needsRender = true; });
    }

    onResize(width, height) {
        if (!this._initialized) {
            return;
        }

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    _init() {
        const rect = this.container.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) {
            this._initRAF = requestAnimationFrame(() => this._init());
            return;
        }

        const w = rect.width;
        const h = rect.height;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
        });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x0c1018);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x0c1018, 0.0015);

        // Camera (Y=up in Three.js)
        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 2000);
        this.camera.position.set(-15, 20, 25);
        this.camera.lookAt(100, 2, 0);

        // Controls
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.maxPolarAngle = Math.PI * 0.48;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 1200;
        this.controls.target.set(100, 2, 0);
        this.controls.addEventListener('change', () => { this.needsRender = true; });

        // Build scene
        this._buildGround();
        this._buildTrajectoryLine();
        this._buildPredictedLine();
        this._buildGhostLine();
        this._buildBoltModel();
        this._buildShooterMarker();
        this._buildTargetMarkers();
        this._buildImpactMarker();
        this._buildLighting();

        this._initialized = true;
        this.needsRender = true;
    }

    _buildGround() {
        const gridSize = 1200;
        const divisions = 60;
        // GridHelper creates grid in XZ plane with Y=up — matches our mapping
        const grid = new THREE.GridHelper(gridSize, divisions, 0x1a3a28, 0x182818);
        grid.position.set(gridSize / 2 - 20, 0, 0);
        this.scene.add(grid);

        // Procedural ground texture
        const texCanvas = document.createElement('canvas');
        texCanvas.width = 512;
        texCanvas.height = 512;
        const tctx = texCanvas.getContext('2d');

        // Radial gradient base
        const grad = tctx.createRadialGradient(256, 256, 0, 256, 256, 360);
        grad.addColorStop(0, '#14220e');
        grad.addColorStop(0.6, '#0e1a0a');
        grad.addColorStop(1, '#080e06');
        tctx.fillStyle = grad;
        tctx.fillRect(0, 0, 512, 512);

        // Noise dots for grass texture
        for (let i = 0; i < 3000; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const g = 10 + Math.random() * 20;
            tctx.fillStyle = `rgba(${g}, ${g + 10}, ${g - 5}, 0.3)`;
            tctx.fillRect(x, y, 1, 1);
        }

        const groundTex = new THREE.CanvasTexture(texCanvas);
        groundTex.wrapS = THREE.RepeatWrapping;
        groundTex.wrapT = THREE.RepeatWrapping;
        groundTex.repeat.set(20, 20);

        const planeGeo = new THREE.PlaneGeometry(gridSize, gridSize);
        const planeMat = new THREE.MeshLambertMaterial({
            map: groundTex,
            side: THREE.DoubleSide,
        });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        // PlaneGeometry is in XY, rotate to XZ (lie flat)
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(gridSize / 2 - 20, -0.01, 0);
        plane.receiveShadow = true;
        this.scene.add(plane);

        // Range markers (in XZ plane)
        for (let r = 100; r <= 1000; r += 100) {
            const markerGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(r, 0, -60),
                new THREE.Vector3(r, 0, 60),
            ]);
            const markerMat = new THREE.LineBasicMaterial({ color: 0x203020, transparent: true, opacity: 0.5 });
            const marker = new THREE.Line(markerGeo, markerMat);
            this.scene.add(marker);
        }
    }

    _buildLighting() {
        const ambient = new THREE.AmbientLight(0x405060, 0.6);
        this.scene.add(ambient);
        const dir = new THREE.DirectionalLight(0x8090a0, 0.8);
        dir.position.set(50, 50, 30);
        dir.castShadow = true;
        dir.shadow.mapSize.width = 512;
        dir.shadow.mapSize.height = 512;
        dir.shadow.camera.near = 0.5;
        dir.shadow.camera.far = 600;
        dir.shadow.camera.left = -100;
        dir.shadow.camera.right = 100;
        dir.shadow.camera.top = 100;
        dir.shadow.camera.bottom = -100;
        this.scene.add(dir);
    }

    _buildTrajectoryLine() {
        // Preallocate trajectory line with vertex colors
        const maxPts = this._maxTrajectoryPoints;
        const positions = new Float32Array(maxPts * 3);
        const colors = new Float32Array(maxPts * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setDrawRange(0, 0);

        const mat = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 });
        this.trajectoryLine = new THREE.Line(geo, mat);
        this.scene.add(this.trajectoryLine);
    }

    _buildPredictedLine() {
        const maxPts = 200;
        const positions = new Float32Array(maxPts * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setDrawRange(0, 0);

        const mat = new THREE.LineDashedMaterial({
            color: 0x00d4ff,
            transparent: true,
            opacity: 0.3,
            dashSize: 2,
            gapSize: 2,
        });
        this.predictedLine = new THREE.Line(geo, mat);
        this.scene.add(this.predictedLine);
    }

    _buildGhostLine() {
        const maxPts = 200;
        const positions = new Float32Array(maxPts * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setDrawRange(0, 0);

        const mat = new THREE.LineDashedMaterial({
            color: 0xffc830,
            transparent: true,
            opacity: 0.25,
            dashSize: 3,
            gapSize: 3,
        });
        this.ghostLine = new THREE.Line(geo, mat);
        this.scene.add(this.ghostLine);
    }

    _updateGhostLine() {
        if (!this._initialized || !this.ghostLine) return;
        const predicted = store.lastPredictedTrajectory;
        if (!predicted || predicted.length === 0) {
            this.ghostLine.geometry.setDrawRange(0, 0);
            return;
        }
        const positions = this.ghostLine.geometry.attributes.position.array;
        const count = Math.min(predicted.length, 200);
        for (let i = 0; i < count; i++) {
            const p = toThree(predicted[i]);
            const idx = i * 3;
            positions[idx] = p[0]; positions[idx + 1] = p[1]; positions[idx + 2] = p[2];
        }
        this.ghostLine.geometry.attributes.position.needsUpdate = true;
        this.ghostLine.geometry.setDrawRange(0, count);
        this.ghostLine.computeLineDistances();
    }

    _buildBoltModel() {
        const group = new THREE.Group();

        // Shaft - cylinder along X
        const shaftGeo = new THREE.CylinderGeometry(0.15, 0.15, 3, 8);
        shaftGeo.rotateZ(Math.PI / 2);
        const shaftMat = new THREE.MeshPhongMaterial({ color: 0xc0d0e0, emissive: 0x203040 });
        const shaft = new THREE.Mesh(shaftGeo, shaftMat);
        shaft.castShadow = true;
        group.add(shaft);

        // Tip - cone
        const tipGeo = new THREE.ConeGeometry(0.2, 0.8, 8);
        tipGeo.rotateZ(-Math.PI / 2);
        const tipMat = new THREE.MeshPhongMaterial({ color: 0xe0e8f0, emissive: 0x304050 });
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.x = 1.9;
        tip.castShadow = true;
        group.add(tip);

        // Triangular fins (4 total) using ShapeGeometry
        const finShape = new THREE.Shape();
        finShape.moveTo(0, 0);
        finShape.lineTo(0.2, 0.8);
        finShape.lineTo(0.5, 0);
        finShape.closePath();

        const finGeo = new THREE.ShapeGeometry(finShape);
        finGeo.translate(-0.25, 0, 0);

        const finMat = new THREE.MeshPhongMaterial({
            color: 0xff8040,
            emissive: 0x402010,
            side: THREE.DoubleSide,
        });

        for (let i = 0; i < 4; i++) {
            const fin = new THREE.Mesh(finGeo, finMat);
            fin.position.x = -1.2;
            fin.rotation.x = (i * Math.PI) / 2;
            fin.castShadow = true;
            group.add(fin);
        }

        // Glow point at tip
        const glowGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x00d4ff,
            transparent: true,
            opacity: 0.6,
        });
        this.boltGlow = new THREE.Mesh(glowGeo, glowMat);
        this.boltGlow.position.x = 2;
        group.add(this.boltGlow);

        group.visible = false;
        this.boltModel = group;
        this.scene.add(group);
    }

    _buildShooterMarker() {
        const geo = new THREE.SphereGeometry(0.5, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0x4080ff });
        this.shooterMarker = new THREE.Mesh(geo, mat);
        const sp = toThree(MISSION_CONSTANTS.shooterPosition);
        this.shooterMarker.position.set(sp[0], sp[1], sp[2]);
        this.scene.add(this.shooterMarker);
    }

    _buildTargetMarkers() {
        this.targetMarkers = [];
    }

    _buildImpactMarker() {
        const group = new THREE.Group();

        const geo = new THREE.SphereGeometry(0.4, 12, 12);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffc830 });
        const sphere = new THREE.Mesh(geo, mat);
        group.add(sphere);

        const ringGeo = new THREE.RingGeometry(0.6, 1.2, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffc830,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2; // Lie flat on ground
        this._impactRing = ring;
        group.add(ring);

        group.visible = false;
        this.impactMarker = group;
        this.scene.add(group);

        // Particle burst system
        const particleCount = 40;
        const pPositions = new Float32Array(particleCount * 3);
        const pColors = new Float32Array(particleCount * 3);
        const pGeo = new THREE.BufferGeometry();
        pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
        pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
        const pMat = new THREE.PointsMaterial({
            vertexColors: true,
            size: 0.4,
            transparent: true,
            opacity: 1,
            sizeAttenuation: true,
        });
        this._impactParticles = new THREE.Points(pGeo, pMat);
        this._impactParticles.visible = false;
        this.scene.add(this._impactParticles);

        this._particleVelocities = new Float32Array(particleCount * 3);
        this._particleLife = 0;
        this._particleCount = particleCount;
    }

    toggleTrajectory() {
        this.showTrajectory = !this.showTrajectory;
        if (this._initialized && this.trajectoryLine) {
            this.trajectoryLine.visible = this.showTrajectory;
            this.needsRender = true;
        }
    }

    _updateTrajectory() {
        if (!this._initialized) return;
        const traj = store.trajectory;
        this.trajectoryLine.visible = this.showTrajectory;
        const positions = this.trajectoryLine.geometry.attributes.position.array;
        const colors = this.trajectoryLine.geometry.attributes.color.array;
        const count = Math.min(traj.length, this._maxTrajectoryPoints);

        for (let i = 0; i < count; i++) {
            const p = toThree(traj[i].position);
            const idx = i * 3;
            positions[idx] = p[0];
            positions[idx + 1] = p[1];
            positions[idx + 2] = p[2];

            const t = i / Math.max(count - 1, 1);
            colors[idx] = 0.2 + t * 0.8;
            colors[idx + 1] = 0.7 + t * 0.3;
            colors[idx + 2] = 1.0;
        }

        this.trajectoryLine.geometry.attributes.position.needsUpdate = true;
        this.trajectoryLine.geometry.attributes.color.needsUpdate = true;
        this.trajectoryLine.geometry.setDrawRange(0, count);
    }

    _updatePredicted() {
        if (!this._initialized) return;
        const predicted = store.predictedTrajectory;
        if (!predicted || predicted.length === 0) {
            this.predictedLine.geometry.setDrawRange(0, 0);
            return;
        }

        const positions = this.predictedLine.geometry.attributes.position.array;
        const count = Math.min(predicted.length, 200);

        for (let i = 0; i < count; i++) {
            const p = toThree(predicted[i]);
            const idx = i * 3;
            positions[idx] = p[0];
            positions[idx + 1] = p[1];
            positions[idx + 2] = p[2];
        }

        this.predictedLine.geometry.attributes.position.needsUpdate = true;
        this.predictedLine.geometry.setDrawRange(0, count);
        this.predictedLine.computeLineDistances();
    }

    _updateBolt() {
        if (!this._initialized || !store.boltState) return;
        const bs = store.boltState;

        this.boltModel.visible = store.inFlight;
        if (!store.inFlight) return;

        // Position: world → Three.js coordinate swap
        const tp = toThree(bs.position);
        this.boltModel.position.set(tp[0], tp[1], tp[2]);

        // Orientation from quaternion [w,x,y,z] → Three.js set(x,y,z,w)
        // World coords: X=fwd, Y=lateral, Z=up → Three.js: X=fwd, Y=up, Z=lateral
        // Y↔Z swap is an odd permutation; negate one swapped component for handedness
        const q = bs.quaternion;
        this.boltModel.quaternion.set(q[1], q[3], -q[2], q[0]);

        // Glow pulse
        const t = performance.now() * 0.003;
        this.boltGlow.material.opacity = 0.4 + 0.3 * Math.sin(t);

        // Camera follow (smooth)
        if (store.inFlight) {
            const target = new THREE.Vector3(tp[0], tp[1], tp[2]);
            this.controls.target.lerp(target, 0.05);
        }
    }

    _updateReplayBolt() {
        if (!this._initialized || !store.replayActive) return;
        const frame = store.replayFrame;
        if (!frame) { this.boltModel.visible = false; return; }

        this.boltModel.visible = true;
        const tp = toThree(frame.position);
        this.boltModel.position.set(tp[0], tp[1], tp[2]);

        if (frame.quaternion) {
            const q = frame.quaternion;
            this.boltModel.quaternion.set(q[1], q[3], -q[2], q[0]);
        }

        // Camera follow during replay
        const target = new THREE.Vector3(tp[0], tp[1], tp[2]);
        this.controls.target.lerp(target, 0.1);
    }

    _updateReplayTrajectory() {
        if (!this._initialized || !store.replayActive) return;
        const traj = store.trajectory;
        const idx = store.replayIndex;
        if (!traj || traj.length === 0) return;

        // Show trajectory up to current replay index
        const positions = this.trajectoryLine.geometry.attributes.position.array;
        const colors = this.trajectoryLine.geometry.attributes.color.array;
        const count = Math.min(idx + 1, traj.length, this._maxTrajectoryPoints);

        for (let i = 0; i < count; i++) {
            const p = toThree(traj[i].position);
            const ii = i * 3;
            positions[ii] = p[0];
            positions[ii + 1] = p[1];
            positions[ii + 2] = p[2];
            const t = i / Math.max(count - 1, 1);
            colors[ii] = 0.2 + t * 0.8;
            colors[ii + 1] = 0.7 + t * 0.3;
            colors[ii + 2] = 1.0;
        }

        this.trajectoryLine.geometry.attributes.position.needsUpdate = true;
        this.trajectoryLine.geometry.attributes.color.needsUpdate = true;
        this.trajectoryLine.geometry.setDrawRange(0, count);
    }

    /**
     * Build a simple 3D animal mesh from primitives.
     * World anatomy: size = [length_X, width_Y, height_Z]
     * Three.js: X=downrange, Y=up, Z=lateral (swap Y↔Z)
     */
    _buildAnimalMesh(group, target, bodyColor, isSelected) {
        const sz = target.size; // [length, width, height]
        const L = sz[0], W = sz[1], H = sz[2];
        const mat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const selMat = isSelected
            ? new THREE.MeshLambertMaterial({ color: bodyColor, emissive: 0x443320, emissiveIntensity: 0.4 })
            : mat;
        const useMat = isSelected ? selMat : mat;

        const type = target.type;

        if (type === 'boar') {
            // Barrel-shaped body
            const bodyGeo = new THREE.CylinderGeometry(H * 0.4, H * 0.45, L * 0.7, 8);
            bodyGeo.rotateZ(Math.PI / 2);
            const body = new THREE.Mesh(bodyGeo, useMat);
            body.position.set(0, H * 0.5, 0);
            group.add(body);

            // Head - cone
            const headGeo = new THREE.ConeGeometry(H * 0.25, L * 0.3, 6);
            headGeo.rotateZ(-Math.PI / 2);
            const head = new THREE.Mesh(headGeo, useMat);
            head.position.set(L * 0.45, H * 0.45, 0);
            group.add(head);

            // 4 stubby legs
            const legGeo = new THREE.CylinderGeometry(0.04, 0.05, H * 0.45, 5);
            const legPositions = [
                [L * 0.2, H * 0.22, W * 0.25],
                [L * 0.2, H * 0.22, -W * 0.25],
                [-L * 0.2, H * 0.22, W * 0.25],
                [-L * 0.2, H * 0.22, -W * 0.25],
            ];
            for (const lp of legPositions) {
                const leg = new THREE.Mesh(legGeo, mat);
                leg.position.set(lp[0], lp[1], lp[2]);
                group.add(leg);
            }
        } else {
            // Deer / Elk body - elongated ellipsoid via scaled sphere
            const bodyGeo = new THREE.CylinderGeometry(H * 0.28, H * 0.32, L * 0.6, 8);
            bodyGeo.rotateZ(Math.PI / 2);
            const body = new THREE.Mesh(bodyGeo, useMat);
            body.position.set(0, H * 0.65, 0);
            group.add(body);

            // Neck
            const neckGeo = new THREE.CylinderGeometry(H * 0.1, H * 0.18, H * 0.5, 6);
            neckGeo.rotateZ(-Math.PI / 6);
            const neck = new THREE.Mesh(neckGeo, useMat);
            neck.position.set(L * 0.35, H * 0.85, 0);
            group.add(neck);

            // Head
            const headGeo = new THREE.SphereGeometry(H * 0.14, 6, 6);
            headGeo.scale(1.4, 1, 1);
            const head = new THREE.Mesh(headGeo, useMat);
            head.position.set(L * 0.5, H * 1.05, 0);
            group.add(head);

            // Antlers (elk gets bigger ones)
            if (type === 'elk') {
                const antlerMat = new THREE.MeshLambertMaterial({ color: 0xc8b080 });
                for (const side of [-1, 1]) {
                    const antGeo = new THREE.ConeGeometry(0.04, H * 0.5, 4);
                    const antler = new THREE.Mesh(antGeo, antlerMat);
                    antler.position.set(L * 0.48, H * 1.25, side * 0.12);
                    antler.rotation.z = side * 0.4;
                    group.add(antler);
                    // Branch
                    const brGeo = new THREE.ConeGeometry(0.025, H * 0.25, 4);
                    const branch = new THREE.Mesh(brGeo, antlerMat);
                    branch.position.set(L * 0.47, H * 1.15, side * 0.18);
                    branch.rotation.z = side * 0.8;
                    group.add(branch);
                }
            } else if (type === 'deer') {
                const antlerMat = new THREE.MeshLambertMaterial({ color: 0xc8b080 });
                for (const side of [-1, 1]) {
                    const antGeo = new THREE.ConeGeometry(0.025, H * 0.35, 4);
                    const antler = new THREE.Mesh(antGeo, antlerMat);
                    antler.position.set(L * 0.48, H * 1.2, side * 0.08);
                    antler.rotation.z = side * 0.3;
                    group.add(antler);
                }
            }

            // 4 legs
            const legLen = H * 0.55;
            const legGeo = new THREE.CylinderGeometry(0.03, 0.04, legLen, 5);
            const legPositions = [
                [L * 0.22, legLen / 2, W * 0.18],
                [L * 0.22, legLen / 2, -W * 0.18],
                [-L * 0.22, legLen / 2, W * 0.18],
                [-L * 0.22, legLen / 2, -W * 0.18],
            ];
            for (const lp of legPositions) {
                const leg = new THREE.Mesh(legGeo, mat);
                leg.position.set(lp[0], lp[1], lp[2]);
                group.add(leg);
            }

            // Tail (small)
            const tailGeo = new THREE.ConeGeometry(0.04, H * 0.15, 4);
            const tailMat = new THREE.MeshLambertMaterial({ color: 0xf0e8d0 });
            const tail = new THREE.Mesh(tailGeo, tailMat);
            tail.position.set(-L * 0.35, H * 0.75, 0);
            tail.rotation.z = Math.PI * 0.7;
            group.add(tail);
        }

        // Apply heading rotation: world heading rotates in XY plane → Three.js rotates around Y axis
        group.rotation.y = -target.heading;

        // Selection ring on ground
        if (isSelected) {
            const ringGeo = new THREE.RingGeometry(L * 0.5, L * 0.55, 24);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0x00ff88, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.02;
            group.add(ring);
        }
    }

    _updateTargets() {
        if (!this._initialized) return;

        // Clear old markers
        for (const m of this.targetMarkers) {
            this.scene.remove(m);
            m.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        this.targetMarkers = [];

        const targets = store.targets;
        if (!targets) return;

        for (const target of targets) {
            const group = new THREE.Group();
            const isSelected = target === store.selectedTarget;
            const isDowned = target.isDowned;
            const bodyColor = isDowned ? 0x4a2020 : isSelected ? 0x8a5030 : 0x6a4020;

            this._buildAnimalMesh(group, target, bodyColor, isSelected);

            // Anatomical zone spheres (visible on selected target)
            if (isSelected && target.hitZones) {
                const selectedZone = store.selectedZone;
                const zoneColors = {
                    heart: 0xff2020, lungs: 0xff5050, head: 0xffaa30,
                    neck: 0xdd8820, spine: 0xffc830, gut: 0x808080,
                    leg: 0x606060, body: 0x505050,
                };
                for (const zone of target.hitZones) {
                    const isActiveZone = zone.type === selectedZone;
                    const zColor = zoneColors[zone.type] || 0xff3030;
                    const zGeo = new THREE.SphereGeometry(zone.radius * (isActiveZone ? 1.2 : 0.8), 10, 10);
                    const zMat = new THREE.MeshBasicMaterial({
                        color: zColor,
                        transparent: true,
                        opacity: isActiveZone ? 0.6 : 0.2,
                        wireframe: !isActiveZone,
                    });
                    const zMesh = new THREE.Mesh(zGeo, zMat);
                    const zWorld = target.getZoneWorldPosition(zone);
                    const zLocal = [zWorld[0] - target.position[0], zWorld[1] - target.position[1], zWorld[2] - target.position[2]];
                    const zOff = toThree(zLocal);
                    zMesh.position.set(zOff[0], zOff[1], zOff[2]);
                    group.add(zMesh);

                    // Glow ring for active zone
                    if (isActiveZone) {
                        const ringGeo = new THREE.RingGeometry(zone.radius * 1.3, zone.radius * 1.6, 16);
                        const ringMat = new THREE.MeshBasicMaterial({
                            color: zColor, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
                        });
                        const ring = new THREE.Mesh(ringGeo, ringMat);
                        ring.position.copy(zMesh.position);
                        ring.lookAt(ring.position.x + 1, ring.position.y, ring.position.z);
                        group.add(ring);
                    }
                }
            }

            if (isDowned) group.rotation.z = Math.PI / 2;

            const tp = toThree(target.position);
            group.position.set(tp[0], tp[1], tp[2]);
            group.userData.targetId = target.id;
            this.scene.add(group);
            this.targetMarkers.push(group);
        }
    }

    /** Update target positions without recreating geometry */
    _updateTargetPositions() {
        if (!this._initialized || this.targetMarkers.length === 0) return;
        const targets = store.targets;
        if (!targets) return;

        for (const marker of this.targetMarkers) {
            const target = targets.find(t => t.id === marker.userData.targetId);
            if (target) {
                const tp = toThree(target.position);
                marker.position.set(tp[0], tp[1], tp[2]);
            }
        }
    }

    _updateImpact() {
        if (!this._initialized) return;
        const pos = store.impactPos;
        if (!pos) {
            this.impactMarker.visible = false;
            this._impactParticles.visible = false;
            return;
        }
        this.impactMarker.visible = true;
        const tp = toThree(pos);
        this.impactMarker.position.set(tp[0], tp[1], tp[2]);

        if (!this._lastImpactPos || this._lastImpactPos[0] !== pos[0] || this._lastImpactPos[2] !== pos[2]) {
            this._lastImpactPos = [...pos];
            this._spawnImpactParticles(pos);
        }
    }

    _spawnImpactParticles(pos) {
        const positions = this._impactParticles.geometry.attributes.position.array;
        const colors = this._impactParticles.geometry.attributes.color.array;
        const vels = this._particleVelocities;
        const n = this._particleCount;
        const tp = toThree(pos);

        for (let i = 0; i < n; i++) {
            const idx = i * 3;
            positions[idx] = tp[0];
            positions[idx + 1] = tp[1];
            positions[idx + 2] = tp[2];

            // Random velocity burst (Y=up in Three.js)
            vels[idx] = (Math.random() - 0.5) * 8;
            vels[idx + 1] = Math.random() * 12 + 2; // up
            vels[idx + 2] = (Math.random() - 0.5) * 8;

            const t = Math.random();
            colors[idx] = 1.0;
            colors[idx + 1] = 0.5 + t * 0.5;
            colors[idx + 2] = t * 0.5;
        }

        this._impactParticles.geometry.attributes.position.needsUpdate = true;
        this._impactParticles.geometry.attributes.color.needsUpdate = true;
        this._impactParticles.visible = true;
        this._impactParticles.material.opacity = 1;
        this._particleLife = 1.0;
    }

    _updateParticles(dt) {
        if (this._particleLife <= 0) return false;

        const positions = this._impactParticles.geometry.attributes.position.array;
        const vels = this._particleVelocities;
        const n = this._particleCount;
        const stepDt = Math.min(dt, 0.033);

        for (let i = 0; i < n; i++) {
            const idx = i * 3;
            positions[idx] += vels[idx] * stepDt;
            positions[idx + 1] += vels[idx + 1] * stepDt; // Y=up in Three.js
            positions[idx + 2] += vels[idx + 2] * stepDt;
            vels[idx + 1] -= 9.81 * stepDt; // gravity on Y axis
            vels[idx] *= 0.98;
            vels[idx + 2] *= 0.98;
        }

        this._particleLife -= dt * 0.8;
        this._impactParticles.material.opacity = Math.max(0, this._particleLife);
        this._impactParticles.geometry.attributes.position.needsUpdate = true;

        if (this._particleLife <= 0) {
            this._impactParticles.visible = false;
        }
        return this._particleLife > 0;
    }

    renderIfNeeded() {
        if (!this._initialized) return;

        const now = performance.now();
        const dt = this._lastRenderTime ? (now - this._lastRenderTime) / 1000 : 0.016;
        this._lastRenderTime = now;

        if (this._particleLife > 0) {
            this._updateParticles(dt);
            this.needsRender = true;
        }

        if (this._impactRing && this.impactMarker.visible) {
            const ringScale = 1 + Math.sin(now * 0.002) * 0.3;
            this._impactRing.scale.set(ringScale, ringScale, 1);
            this._impactRing.material.opacity = 0.3 + 0.2 * Math.sin(now * 0.003);
        }

        if (!this.needsRender || !this.visible) return;
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.needsRender = false;
    }

    resetCamera() {
        if (!this._initialized) return;
        const target = store.selectedTarget;
        const range = target ? target.position[0] : 150;
        this.camera.position.set(-10, 15, 20);
        this.controls.target.set(Math.min(range * 0.6, 200), 2, 0);
        this.controls.update();
        this.needsRender = true;
    }

    _setCameraPreset(name) {
        if (!this._initialized) return;
        const tgt = store.selectedTarget;
        const range = tgt ? tgt.position[0] : 150;
        const focusX = Math.min(range * 0.6, 200);

        switch (name) {
            case 'chase':
                this.camera.position.set(focusX - 20, 10, 15);
                this.controls.target.set(focusX + 30, 2, 0);
                break;
            case 'top':
                this.camera.position.set(focusX, 200, 0.1);
                this.controls.target.set(focusX, 0, 0);
                break;
            case 'side':
                this.camera.position.set(focusX, 5, 80);
                this.controls.target.set(focusX, 2, 0);
                break;
            case 'reset':
            default:
                this.resetCamera();
                return;
        }
        this.controls.update();
        this.needsRender = true;
    }
}
