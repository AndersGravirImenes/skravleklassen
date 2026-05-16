/**
 * MONIAC 3D — Phillips-maskin i Blade Runner 2049-estetikk
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const COLORS = {
    income: 0xff9a3c,
    consume: 0xff4d8b,
    tax: 0xff5c00,
    save: 0xc8a890,
    gov: 0xffc857,
    invest: 0xffb347,
};

const TANK_DEFS = [
    { id: 'G', label: 'G', sub: 'OFFENTLIG', pos: [-3.2, 0, -2.4], color: COLORS.gov },
    { id: 'C', label: 'C', sub: 'FORBRUK', pos: [-3.2, 0, 2.4], color: COLORS.consume },
    { id: 'Y', label: 'Y', sub: 'NASJONALINNTEKT', pos: [0, 0, 0], color: COLORS.income, hub: true },
    { id: 'T', label: 'T', sub: 'SKATT', pos: [3.2, 0, -2.4], color: COLORS.tax },
    { id: 'I', label: 'I', sub: 'INVESTERING', pos: [3.2, 0, 0], color: COLORS.invest },
    { id: 'S', label: 'S', sub: 'SPARING', pos: [3.2, 0, 2.4], color: COLORS.save },
];

const PIPES = [
    { from: 'G', to: 'Y', color: COLORS.gov },
    { from: 'I', to: 'Y', color: COLORS.invest },
    { from: 'Y', to: 'C', color: COLORS.consume },
    { from: 'Y', to: 'T', color: COLORS.tax },
    { from: 'Y', to: 'S', color: COLORS.save },
    { from: 'C', to: 'Y', color: COLORS.consume },
];

function initMoniac() {
    const canvas = document.getElementById('moniac-canvas');
    const panel = document.getElementById('moniac');
    if (!canvas || !panel) return;

    const hud = {
        bnp: document.getElementById('moniac-bnp'),
        ledighet: document.getElementById('moniac-ledighet'),
        inflasjon: document.getElementById('moniac-inflasjon'),
        status: document.getElementById('moniac-status'),
    };

    const controls = {
        gov: document.getElementById('moniac-gov'),
        rate: document.getElementById('moniac-rate'),
        tax: document.getElementById('moniac-tax'),
        mpc: document.getElementById('moniac-mpc'),
    };

    const labels = {
        gov: document.getElementById('moniac-gov-val'),
        rate: document.getElementById('moniac-rate-val'),
        tax: document.getElementById('moniac-tax-val'),
        mpc: document.getElementById('moniac-mpc-val'),
    };

    const state = { Y: 0.42, C: 0.3, T: 0.18, S: 0.15, G: 0.2, I: 0.22 };
    const tanks = {};
    const pipeMeshes = [];
    let flowParticles = [];
    let dustParticles;
    let running = true;
    let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0604);
    scene.fog = new THREE.FogExp2(0x1a0c08, 0.045);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    camera.position.set(7.5, 5.2, 9.5);

    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, reducedMotion ? 1 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = !reducedMotion;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    let composer = null;
    let bloomPass = null;
    if (!reducedMotion) {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.42, 0.18);
        composer.addPass(bloomPass);
    }

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.inset = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    canvas.parentElement.appendChild(labelRenderer.domElement);

    const orbit = new OrbitControls(camera, canvas);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.06;
    orbit.minDistance = 6;
    orbit.maxDistance = 18;
    orbit.maxPolarAngle = Math.PI / 2.05;
    orbit.target.set(0, 0.8, 0);
    orbit.autoRotate = !reducedMotion;
    orbit.autoRotateSpeed = 0.35;

    // —— Lighting (Las Vegas orange haze) ——
    scene.add(new THREE.AmbientLight(0xffc4a0, 0.25));
    const keyLight = new THREE.DirectionalLight(0xff9a3c, 1.1);
    keyLight.position.set(5, 12, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const rimPink = new THREE.PointLight(0xff4d8b, 2.2, 22);
    rimPink.position.set(-6, 3, 4);
    scene.add(rimPink);

    const rimAmber = new THREE.PointLight(0xff5c00, 1.8, 20);
    rimAmber.position.set(6, 2, -5);
    scene.add(rimAmber);

    const hubGlow = new THREE.PointLight(0xff9a3c, 1.4, 8);
    hubGlow.position.set(0, 1.5, 0);
    scene.add(hubGlow);

    // —— Floor grid (2049 wasteland platform) ——
    const floorGeo = new THREE.PlaneGeometry(24, 24, 24, 24);
    const floorMat = new THREE.MeshStandardMaterial({
        color: 0x160c08,
        metalness: 0.85,
        roughness: 0.35,
        emissive: 0xff5c00,
        emissiveIntensity: 0.04,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.35;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(22, 44, 0xff9a3c, 0x3d2018);
    grid.position.y = -1.34;
    grid.material.opacity = 0.35;
    grid.material.transparent = true;
    scene.add(grid);

    const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(4.2, 4.6, 0.35, 6),
        new THREE.MeshStandardMaterial({
            color: 0x25140e,
            metalness: 0.7,
            roughness: 0.4,
            emissive: 0xff5c00,
            emissiveIntensity: 0.06,
        })
    );
    pedestal.position.y = -1.15;
    pedestal.receiveShadow = true;
    scene.add(pedestal);

    // —— Tanks ——
    const TANK_W = 1.15;
    const TANK_H = 2.2;
    const TANK_D = 1.15;

    function createTank(def) {
        const group = new THREE.Group();
        group.position.set(def.pos[0], def.pos[1], def.pos[2]);

        const glass = new THREE.Mesh(
            new THREE.BoxGeometry(TANK_W, TANK_H, TANK_D),
            new THREE.MeshPhysicalMaterial({
                color: 0x2a1410,
                metalness: 0.15,
                roughness: 0.08,
                transmission: 0.72,
                thickness: 0.4,
                transparent: true,
                opacity: 0.55,
                envMapIntensity: 1,
            })
        );
        glass.castShadow = true;
        group.add(glass);

        const liquid = new THREE.Mesh(
            new THREE.BoxGeometry(TANK_W * 0.82, 0.1, TANK_D * 0.82),
            new THREE.MeshStandardMaterial({
                color: def.color,
                emissive: def.color,
                emissiveIntensity: 0.55,
                metalness: 0.3,
                roughness: 0.2,
                transparent: true,
                opacity: 0.92,
            })
        );
        group.add(liquid);

        const frame = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(TANK_W + 0.06, TANK_H + 0.06, TANK_D + 0.06)),
            new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0.85 })
        );
        group.add(frame);

        if (def.hub) {
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(1.35, 0.03, 8, 48),
                new THREE.MeshStandardMaterial({
                    color: COLORS.income,
                    emissive: COLORS.income,
                    emissiveIntensity: 1.2,
                    metalness: 0.9,
                    roughness: 0.2,
                })
            );
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 0.2;
            group.add(ring);

            const ring2 = ring.clone();
            ring2.scale.set(1.15, 1.15, 1.15);
            ring2.material = ring2.material.clone();
            ring2.material.emissiveIntensity = 0.4;
            ring2.material.opacity = 0.5;
            ring2.material.transparent = true;
            group.add(ring2);
        }

        const labelEl = document.createElement('div');
        labelEl.className = 'moniac-label';
        labelEl.innerHTML = `${def.label}<small>${def.sub}</small>`;
        const labelObj = new CSS2DObject(labelEl);
        labelObj.position.set(0, TANK_H / 2 + 0.55, 0);
        group.add(labelObj);

        scene.add(group);
        return { group, liquid, glass, TANK_H, id: def.id, color: def.color };
    }

    TANK_DEFS.forEach((def) => {
        tanks[def.id] = createTank(def);
    });

    function setTankLevel(tank, level) {
        const lvl = Math.max(0.08, Math.min(0.95, level));
        const h = tank.TANK_H * lvl * 0.92;
        tank.liquid.scale.y = h / 0.1;
        tank.liquid.position.y = -tank.TANK_H / 2 + h / 2 + 0.05;
        const pulse = 0.55 + lvl * 0.35;
        tank.liquid.material.emissiveIntensity = pulse;
    }

    // —— Pipes ——
    const PORT = {
        top: [0, TANK_H / 2, 0],
        bottom: [0, -TANK_H / 2, 0],
        left: [-TANK_W / 2, 0, 0],
        right: [TANK_W / 2, 0, 0],
    };

    function portWorld(id, side) {
        const t = tanks[id];
        if (!t) return new THREE.Vector3();
        const off = PORT[side] || [0, 0, 0];
        const gp = t.group.position;
        return new THREE.Vector3(gp.x + off[0], gp.y + off[1], gp.z + off[2]);
    }

    function mid(a, b, yLift = 0.4) {
        return new THREE.Vector3(
            (a.x + b.x) * 0.5,
            Math.max(a.y, b.y) + yLift,
            (a.z + b.z) * 0.5
        );
    }

    function pipePath(from, to) {
        const paths = {
            'G-Y': () => {
                const a = portWorld('G', 'right');
                const b = portWorld('Y', 'left');
                return [a, mid(a, b, 0.5), b];
            },
            'I-Y': () => {
                const a = portWorld('I', 'left');
                const b = portWorld('Y', 'right');
                return [a, mid(a, b, 0.5), b];
            },
            'Y-C': () => {
                const a = portWorld('Y', 'left');
                const b = portWorld('C', 'top');
                return [a, mid(a, b, 0.35), b];
            },
            'Y-T': () => {
                const a = portWorld('Y', 'top');
                const b = portWorld('T', 'bottom');
                return [a, mid(a, b, 0.8), b];
            },
            'Y-S': () => {
                const a = portWorld('Y', 'right');
                const b = portWorld('S', 'top');
                return [a, mid(a, b, 0.35), b];
            },
            'C-Y': () => {
                const a = portWorld('C', 'right');
                const b = portWorld('Y', 'bottom');
                return [a, mid(a, b, 0.25), b];
            },
        };
        const fn = paths[`${from}-${to}`];
        if (fn) return fn();
        return [portWorld(from, 'bottom'), portWorld(to, 'top')];
    }

    PIPES.forEach((p) => {
        const pts = pipePath(p.from, p.to);
        const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
        const tube = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 32, 0.07, 8, false),
            new THREE.MeshStandardMaterial({
                color: 0x1a0c08,
                metalness: 0.9,
                roughness: 0.25,
                emissive: p.color,
                emissiveIntensity: 0.15,
                transparent: true,
                opacity: 0.85,
            })
        );
        tube.castShadow = true;
        scene.add(tube);
        pipeMeshes.push({ curve, color: p.color, key: `${p.from}-${p.to}` });
    });

    // —— Ambient dust / ash (2049) ——
    function buildDust(count) {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 18;
            pos[i * 3 + 1] = Math.random() * 10;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 18;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        dustParticles = new THREE.Points(
            geo,
            new THREE.PointsMaterial({
                color: 0xff9a3c,
                size: 0.04,
                transparent: true,
                opacity: 0.35,
                depthWrite: false,
            })
        );
        scene.add(dustParticles);
    }

    buildDust(reducedMotion ? 80 : 220);

    // Distant hologram pillars (Las Vegas ruins)
    [-8, 8].forEach((x) => {
        const holo = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 6 + Math.random() * 4, 0.15),
            new THREE.MeshStandardMaterial({
                color: 0xff9a3c,
                emissive: 0xff5c00,
                emissiveIntensity: 0.9,
                transparent: true,
                opacity: 0.35,
            })
        );
        holo.position.set(x, 2, -7 - Math.random() * 3);
        scene.add(holo);
    });

    // —— Physics (unchanged model) ——
    function readControls() {
        return {
            gov: Number(controls.gov.value) / 100,
            rate: Number(controls.rate.value) / 100,
            tax: Number(controls.tax.value) / 100,
            mpc: Number(controls.mpc.value) / 100,
        };
    }

    function updateLabels(c) {
        labels.gov.textContent = Math.round(c.gov * 100) + '%';
        labels.rate.textContent = (c.rate * 100).toFixed(1).replace('.0', '') + '%';
        labels.tax.textContent = Math.round(c.tax * 100) + '%';
        labels.mpc.textContent = Math.round(c.mpc * 100) + '%';
    }

    function computeFlows(c) {
        const investFlow = Math.max(0.04, 0.28 * (1 - c.rate * 1.3));
        return {
            gToY: c.gov * 0.45 + 0.02,
            iToY: investFlow * 0.4,
            yToC: state.Y * c.mpc * 0.35,
            yToT: state.Y * c.tax * 0.3,
            yToS: state.Y * (1 - c.mpc) * 0.25,
            cToY: state.C * 0.28,
        };
    }

    function stepPhysics(c, dt) {
        const investBase = 0.28 * (1 - c.rate * 1.35);
        const inject = c.gov * 0.55 + Math.max(0.05, investBase);
        const leak = Math.max(0.12, c.tax * 0.55 + (1 - c.mpc) * 0.35);
        const targetY = Math.min(0.98, inject / leak);
        const k = 1 - Math.pow(0.001, dt);

        state.Y += (targetY - state.Y) * k;
        state.G += (c.gov * 0.85 - state.G) * k * 0.8;
        state.I += (Math.max(0.08, investBase) - state.I) * k * 0.8;
        state.T += (state.Y * c.tax * 0.9 - state.T) * k;
        state.S += (state.Y * (1 - c.mpc) * 0.75 - state.S) * k;
        state.C += (state.Y * c.mpc * 0.82 - state.C) * k;

        if (hud.bnp) hud.bnp.textContent = String(Math.round(state.Y * 100)).padStart(3, '0');
        if (hud.ledighet) hud.ledighet.textContent = ((1 - state.Y) * 11.5 + 2.2).toFixed(1) + '%';
        if (hud.inflasjon) hud.inflasjon.textContent = Math.max(0, (state.Y - 0.62) * 52 + (c.gov - 0.35) * 12).toFixed(1) + '%';

        if (hud.status) {
            if (state.Y > 0.88) hud.status.textContent = 'OVEROPPHETET — VENTILER ÅPNER';
            else if (state.Y < 0.28) hud.status.textContent = 'DEFLATORISK SJOK — PUMPE TOM';
            else if (c.rate > 0.055 && state.I < 0.15) hud.status.textContent = 'PENGEPOLITISK BREMS';
            else hud.status.textContent = 'NOMINAL SIRKULASJON STABIL';
        }

        setTankLevel(tanks.Y, state.Y);
        setTankLevel(tanks.C, state.C);
        setTankLevel(tanks.T, state.T);
        setTankLevel(tanks.S, state.S);
        setTankLevel(tanks.G, state.G);
        setTankLevel(tanks.I, state.I);

        hubGlow.intensity = 0.8 + state.Y * 1.2;
        rimPink.intensity = 1.2 + state.C * 2;
        scene.fog.density = 0.038 + state.Y * 0.018;

        return computeFlows(c);
    }

    const flowSphereGeo = new THREE.SphereGeometry(0.055, 6, 6);
    const flowMats = new Map();

    function flowMaterial(color) {
        if (!flowMats.has(color)) {
            flowMats.set(
                color,
                new THREE.MeshStandardMaterial({
                    color,
                    emissive: color,
                    emissiveIntensity: 1.6,
                    metalness: 0.2,
                    roughness: 0.3,
                    transparent: true,
                    opacity: 0.92,
                })
            );
        }
        return flowMats.get(color);
    }

    const flowKeyMap = {
        'G-Y': 'gToY',
        'I-Y': 'iToY',
        'Y-C': 'yToC',
        'Y-T': 'yToT',
        'Y-S': 'yToS',
        'C-Y': 'cToY',
    };

    function spawnParticles(flows) {
        const cap = window.innerWidth < 768 ? 70 : 140;
        pipeMeshes.forEach(({ curve, color, key }) => {
            const rate = flows[flowKeyMap[key]] || 0.05;
            if (Math.random() < rate * 2.5 && flowParticles.length < cap) {
                const mesh = new THREE.Mesh(flowSphereGeo, flowMaterial(color));
                scene.add(mesh);
                flowParticles.push({ mesh, curve, t: 0, speed: 0.25 + rate * 0.8 + Math.random() * 0.2 });
            }
        });
    }

    function updateFlowParticles(dt) {
        flowParticles = flowParticles.filter((p) => {
            p.t += p.speed * dt;
            if (p.t >= 1) {
                scene.remove(p.mesh);
                return false;
            }
            const pt = p.curve.getPointAt(Math.min(1, Math.max(0, p.t)));
            if (!Number.isFinite(pt.x)) return false;
            p.mesh.position.copy(pt);
            const s = 0.7 + Math.sin(p.t * Math.PI) * 0.5;
            p.mesh.scale.setScalar(s);
            return true;
        });
    }

    function updateDust(dt) {
        if (!dustParticles || reducedMotion) return;
        const arr = dustParticles.geometry.attributes.position.array;
        for (let i = 0; i < arr.length; i += 3) {
            arr[i + 1] -= dt * (0.15 + (i % 5) * 0.02);
            if (arr[i + 1] < 0) arr[i + 1] = 10;
        }
        dustParticles.geometry.attributes.position.needsUpdate = true;
    }

    let last = performance.now();
    let animId = 0;

    function renderFrame() {
        if (composer) {
            composer.render();
        } else {
            renderer.render(scene, camera);
        }
        labelRenderer.render(scene, camera);
    }

    function renderStill() {
        const c = readControls();
        updateLabels(c);
        stepPhysics(c, 0.016);
        renderFrame();
    }

    function animate(now) {
        if (!running) return;
        animId = requestAnimationFrame(animate);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        const c = readControls();
        updateLabels(c);
        const flows = stepPhysics(c, dt);

        if (!reducedMotion) {
            spawnParticles(flows);
            updateFlowParticles(dt);
            updateDust(dt);
            orbit.update();
        }

        renderFrame();
    }

    function resize() {
        const parent = canvas.parentElement;
        const width = Math.max(280, parent.clientWidth);
        const height = Math.max(380, Math.min(520, width * 0.62));
        if (!width || !height) return;
        canvas.style.height = height + 'px';
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        labelRenderer.setSize(width, height);
        if (composer) {
            composer.setSize(width, height);
            bloomPass?.resolution.set(width, height);
        }
    }

    Object.values(controls).forEach((el) => {
        el?.addEventListener('input', () => {
            updateLabels(readControls());
            if (reducedMotion) renderStill();
        });
    });

    document.getElementById('moniac-reset')?.addEventListener('click', () => {
        controls.gov.value = 35;
        controls.rate.value = 4.5;
        controls.tax.value = 28;
        controls.mpc.value = 72;
        Object.assign(state, { Y: 0.42, C: 0.3, T: 0.18, S: 0.15, G: 0.2, I: 0.22 });
        flowParticles.forEach((p) => scene.remove(p.mesh));
        flowParticles = [];
        updateLabels(readControls());
    });

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => {
        reducedMotion = e.matches;
        orbit.autoRotate = !reducedMotion;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, reducedMotion ? 1 : 2));
    });

    const observer = new IntersectionObserver(
        (entries) => {
            const visible = entries[0]?.isIntersecting;
            if (visible && !running) {
                running = true;
                if (reducedMotion) {
                    renderStill();
                } else {
                    last = performance.now();
                    animate(last);
                }
            } else if (!visible) {
                running = false;
                cancelAnimationFrame(animId);
            }
        },
        { threshold: 0.1 }
    );
    observer.observe(panel);

    resize();
    updateLabels(readControls());
    if (reducedMotion) {
        renderStill();
    } else {
        running = true;
        animate(performance.now());
    }

    let resizeTO;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTO);
        resizeTO = setTimeout(resize, 120);
    });
}

initMoniac();
