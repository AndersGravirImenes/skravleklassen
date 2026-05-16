/**
 * MONIAC 3D — Spice-økonomi på Arrakis (Dune-estetikk)
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { attachLivingWorld } from './arrakis-life.js';

const SPICE = 0xe8923a;
const SPICE_BRIGHT = 0xffc04d;
const SAND = 0xc9a86c;
const SAND_SHADOW = 0x7a5c2e;
const CHOAM = 0xd4af37;
const GUILD = 0x5eb8e8;
const IMPERIAL = 0x9c3b28;
const SIETCH = 0x6b8f7a;

const COLORS = {
    income: SPICE,
    consume: GUILD,
    tax: CHOAM,
    save: SIETCH,
    gov: IMPERIAL,
    invest: 0xb8860b,
    pump: SPICE_BRIGHT,
};

const NODE_DEFS = [
    { id: 'P', label: 'P', sub: 'HARVESTER · SANDORM', pos: [-5.2, 0, 0], color: COLORS.pump, type: 'pump' },
    { id: 'G', label: 'G', sub: 'SARDAUKAR · HOFF', pos: [-3.4, 0, -2.6], color: COLORS.gov, type: 'imperial' },
    { id: 'C', label: 'C', sub: 'GILDE · MENTAT · STILL', pos: [-3.4, 0, 2.6], color: COLORS.consume, type: 'guild' },
    { id: 'Y', label: 'Y', sub: 'TOTAL SPICE-HØST', pos: [0, 0, 0], color: COLORS.income, type: 'silo', hub: true },
    { id: 'T', label: 'T', sub: 'CHOAM → KEISER', pos: [3.4, 0, -2.6], color: COLORS.tax, type: 'choam' },
    { id: 'I', label: 'I', sub: 'HARVESTER · ORNITHOPTER', pos: [3.4, 0, 0.2], color: COLORS.invest, type: 'factory' },
    { id: 'S', label: 'S', sub: 'SIETCH · HUS-SKATT', pos: [3.4, 0, 2.6], color: COLORS.save, type: 'sietch' },
];

const PIPES = [
    { from: 'P', to: 'Y', color: COLORS.pump },
    { from: 'G', to: 'Y', color: COLORS.gov },
    { from: 'I', to: 'Y', color: COLORS.invest },
    { from: 'Y', to: 'C', color: COLORS.consume },
    { from: 'Y', to: 'T', color: COLORS.tax },
    { from: 'Y', to: 'S', color: COLORS.save },
    { from: 'C', to: 'Y', color: COLORS.consume },
];

const NODE_PORTS = {
    P: { out: [0.9, 0.2, 0] },
    G: { out: [0.7, 0.3, 0], in: [-0.7, 0.2, 0] },
    C: { out: [0.6, 0.1, 0], in: [-0.6, 0.4, 0] },
    Y: { inL: [-1.1, 0.3, 0], inR: [1.1, 0.3, 0], inB: [0, -0.5, 0], outL: [-1.1, 0.8, 0], outT: [0, 1.4, 0], outR: [1.1, 0.8, 0] },
    T: { in: [0, -0.8, 0] },
    I: { out: [-0.7, 0.2, 0], in: [0.7, 0.2, 0] },
    S: { in: [0, 0.6, 0] },
};

const MACRO = {
    Y_POT: 0.92,
    NAIRU: 0.042,
    MPI: 0.22,
    X_AUTO: 0.1,
    G_SCALE: 0.22,
    I_BASE: 0.14,
    R_NEUTRAL: 0.025,
    R_SENS: 1.6,
    I_FLOOR: 0.25,
    PI_TARGET: 2.0,
    OKUN_COEF: 7.5,
    PHILLIPS_COEF: 9,
    FISCAL_INFL_COEF: 5,
};

function harvestFromRate(rate) {
    return MACRO.X_AUTO * (0.45 + rate * 9.5);
}

function macroEquilibrium(c) {
    const t = c.tax;
    const mpc = c.mpc;
    const G = c.gov * MACRO.G_SCALE;
    const rateGap = Math.max(0, c.rate - MACRO.R_NEUTRAL);
    const I = MACRO.I_BASE * Math.max(MACRO.I_FLOOR, 1 - MACRO.R_SENS * rateGap);
    const X = harvestFromRate(c.rate);
    const A = G + I + X;
    const denom = 1 - mpc * (1 - t) + MACRO.MPI;
    const mult = denom > 0.08 ? 1 / denom : 12;
    const Y = Math.min(0.98, A * mult);
    return { G, I, X, A, mult, denom, Y, t, mpc };
}

function macroFlows(Y, eq) {
    const { mpc, t } = eq;
    const C = mpc * (1 - t) * Y;
    const T_flow = t * Y;
    const S_flow = (1 - mpc) * Y;
    const M_flow = MACRO.MPI * Y;
    return { C, T_flow, S_flow, M_flow, G: eq.G, I: eq.I };
}

function macroUnemployment(Y) {
    const gap = Math.max(0, (MACRO.Y_POT - Y) / MACRO.Y_POT);
    return MACRO.NAIRU * 100 + gap * MACRO.OKUN_COEF;
}

function macroInflation(Y, G) {
    const outputGap = (Y - MACRO.Y_POT) / MACRO.Y_POT;
    const demandPull = MACRO.PHILLIPS_COEF * outputGap;
    const fiscal = MACRO.FISCAL_INFL_COEF * Math.max(0, G - 0.07);
    return Math.max(0, MACRO.PI_TARGET + demandPull + fiscal);
}

function macroStatus(Y, eq, uPct) {
    const gap = (Y - MACRO.Y_POT) / MACRO.Y_POT;
    const rateGap = Math.max(0, eq.rate - MACRO.R_NEUTRAL);
    if (gap > 0.06) return 'SPICE-TSUNAMI — ØKOLOGISK GRENS';
    if (Y < 0.32) return 'TØRKE — HARVESTER STANSET';
    if (rateGap > 0.03 && eq.I < MACRO.I_BASE * 0.55) return 'SANDORM UROLIG — INVESTERING BREMSES';
    if (uPct > MACRO.NAIRU * 100 + 2.5) return 'SIETCH-TAPT KAPASITET';
    return 'BALANSERT SPICE-SIRKULASJON';
}

function initMoniac() {
    const canvas = document.getElementById('moniac-canvas');
    const panel = document.getElementById('moniac');
    if (!canvas || !panel) return;

    const hud = {
        bnp: document.getElementById('moniac-bnp'),
        mult: document.getElementById('moniac-mult'),
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

    const _initC = { gov: 0.35, rate: 0.045, tax: 0.28, mpc: 0.72 };
    const _initEq = macroEquilibrium(_initC);
    const _initF = macroFlows(_initEq.Y * 0.95, _initEq);
    const state = {
        Y: _initEq.Y * 0.95,
        C: _initF.C,
        T: _initF.T_flow,
        S: _initF.S_flow,
        G: 0.35,
        I: _initEq.I / MACRO.I_BASE,
        P: 0.5,
    };

    const nodes = {};
    const pipeMeshes = [];
    let flowParticles = [];
    let dustParticles;
    let pumpGroup;
    let livingWorld = null;
    let running = true;
    let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3d2814);
    scene.fog = new THREE.FogExp2(0xc9a070, 0.028);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
    camera.position.set(8, 6, 11);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, reducedMotion ? 1 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !reducedMotion;

    let composer = null;
    let bloomPass = null;
    if (!reducedMotion) {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.5, 0.22);
        composer.addPass(bloomPass);
    }

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    canvas.parentElement.appendChild(labelRenderer.domElement);

    const orbit = new OrbitControls(camera, canvas);
    orbit.enableDamping = true;
    orbit.target.set(0, 0.6, 0);
    orbit.minDistance = 7;
    orbit.maxDistance = 22;
    orbit.maxPolarAngle = Math.PI / 2.1;
    orbit.autoRotate = !reducedMotion;
    orbit.autoRotateSpeed = 0.28;

    scene.add(new THREE.HemisphereLight(0xffe4b8, 0x4a3520, 0.55));
    const sun = new THREE.DirectionalLight(0xffd4a0, 1.35);
    sun.position.set(8, 14, 6);
    sun.castShadow = !reducedMotion;
    scene.add(sun);

    const spiceLight = new THREE.PointLight(SPICE_BRIGHT, 2, 14);
    spiceLight.position.set(0, 2.5, 0);
    scene.add(spiceLight);

    const sandMat = new THREE.MeshStandardMaterial({ color: SAND, roughness: 0.95, metalness: 0.02 });
    const sandDarkMat = new THREE.MeshStandardMaterial({ color: SAND_SHADOW, roughness: 1, metalness: 0 });

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(48, 48, 1, 1), sandDarkMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.2;
    ground.receiveShadow = true;
    scene.add(ground);

    [[-12, -8, 4], [10, -10, 5], [-8, 11, 3.5], [14, 6, 4.5], [-14, 4, 3], [6, -14, 3.8]].forEach(([x, z, s]) => {
        const dune = new THREE.Mesh(new THREE.ConeGeometry(s * 1.4, s * 0.55, 12), sandMat);
        dune.position.set(x, -1.2 + s * 0.12, z);
        dune.rotation.y = Math.random() * Math.PI;
        scene.add(dune);
    });

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5c4a32, roughness: 0.9 });
    for (let i = 0; i < 14; i++) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.35, 0), rockMat);
        r.position.set((Math.random() - 0.5) * 20, -1.05, (Math.random() - 0.5) * 20);
        scene.add(r);
    }

    const FILL_H = 2.4;

    function addLabel(group, def, yOff) {
        const el = document.createElement('div');
        el.className = 'moniac-label';
        el.innerHTML = `${def.label}<small>${def.sub}</small>`;
        const obj = new CSS2DObject(el);
        obj.position.set(0, yOff, 0);
        group.add(obj);
    }

    function createFill(color, radius, height) {
        const m = new THREE.Mesh(
            new THREE.CylinderGeometry(radius * 0.88, radius * 0.92, 0.08, 16),
            new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.65,
                transparent: true,
                opacity: 0.9,
            })
        );
        return m;
    }

    function createNode(def) {
        const group = new THREE.Group();
        group.position.set(def.pos[0], def.pos[1], def.pos[2]);
        let fill = null;
        let portY = FILL_H;

        switch (def.type) {
            case 'silo': {
                const shell = new THREE.Mesh(
                    new THREE.CylinderGeometry(1.25, 1.45, FILL_H, 20),
                    new THREE.MeshStandardMaterial({ color: 0x4a3828, metalness: 0.5, roughness: 0.45 })
                );
                shell.position.y = FILL_H / 2 - 0.2;
                group.add(shell);
                fill = createFill(def.color, 1.2, FILL_H);
                fill.position.y = 0.15;
                const rim = new THREE.Mesh(
                    new THREE.TorusGeometry(1.5, 0.06, 8, 32),
                    new THREE.MeshStandardMaterial({ color: SPICE_BRIGHT, emissive: SPICE, emissiveIntensity: 1.2 })
                );
                rim.rotation.x = Math.PI / 2;
                rim.position.y = 0.35;
                group.add(rim);
                portY = FILL_H;
                break;
            }
            case 'choam': {
                const base = new THREE.Mesh(
                    new THREE.BoxGeometry(1.1, 0.5, 1.1),
                    new THREE.MeshStandardMaterial({ color: 0x3d3020, metalness: 0.7, roughness: 0.3 })
                );
                base.position.y = 0.25;
                group.add(base);
                const spire = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.15, 0.35, 2.8, 6),
                    new THREE.MeshStandardMaterial({ color: CHOAM, emissive: CHOAM, emissiveIntensity: 0.35, metalness: 0.85, roughness: 0.2 })
                );
                spire.position.y = 1.6;
                group.add(spire);
                fill = createFill(def.color, 0.35, 1.2);
                fill.position.y = 0.5;
                portY = 0.5;
                break;
            }
            case 'guild': {
                const hull = new THREE.Mesh(
                    new THREE.ConeGeometry(1.2, 0.8, 4),
                    new THREE.MeshStandardMaterial({ color: 0x2a3540, metalness: 0.6, roughness: 0.35 })
                );
                hull.rotation.y = Math.PI / 4;
                hull.position.y = 0.5;
                group.add(hull);
                const glow = new THREE.Mesh(
                    new THREE.SphereGeometry(0.55, 12, 12),
                    new THREE.MeshStandardMaterial({ color: GUILD, emissive: GUILD, emissiveIntensity: 0.8, transparent: true, opacity: 0.7 })
                );
                glow.position.y = 0.9;
                group.add(glow);
                fill = createFill(def.color, 0.5, 0.8);
                fill.position.y = 0.35;
                portY = 0.6;
                break;
            }
            case 'sietch': {
                const dome = new THREE.Mesh(
                    new THREE.SphereGeometry(1.1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
                    new THREE.MeshStandardMaterial({ color: SIETCH, roughness: 0.85 })
                );
                dome.position.y = -0.15;
                group.add(dome);
                const mound = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.5, 12), sandMat);
                mound.position.y = -0.35;
                group.add(mound);
                fill = createFill(def.color, 0.7, 0.6);
                fill.position.y = 0.1;
                portY = 0.5;
                break;
            }
            case 'imperial': {
                [[-0.45, 0.35], [0.45, 0.35], [0, 0.75]].forEach(([x, h]) => {
                    const b = new THREE.Mesh(
                        new THREE.BoxGeometry(0.7, h, 0.6),
                        new THREE.MeshStandardMaterial({ color: IMPERIAL, roughness: 0.7 })
                    );
                    b.position.set(x, h / 2, 0);
                    group.add(b);
                });
                fill = createFill(def.color, 0.45, 0.7);
                fill.position.y = 0.25;
                portY = 0.6;
                break;
            }
            case 'factory': {
                const platform = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 1), sandDarkMat);
                platform.position.y = 0.1;
                group.add(platform);
                const harvester = new THREE.Mesh(
                    new THREE.BoxGeometry(1.2, 0.45, 0.7),
                    new THREE.MeshStandardMaterial({ color: 0x5a4a38, metalness: 0.5, roughness: 0.5 })
                );
                harvester.position.set(0, 0.45, 0);
                group.add(harvester);
                const wing = new THREE.Mesh(
                    new THREE.BoxGeometry(0.15, 0.05, 0.9),
                    new THREE.MeshStandardMaterial({ color: 0x8a7a60, metalness: 0.6 })
                );
                wing.position.set(0, 0.75, 0);
                group.add(wing);
                fill = createFill(def.color, 0.4, 0.5);
                fill.position.y = 0.3;
                portY = 0.5;
                break;
            }
            case 'pump': {
                pumpGroup = group;
                const harv = new THREE.Mesh(
                    new THREE.BoxGeometry(1.4, 0.5, 0.9),
                    new THREE.MeshStandardMaterial({ color: 0x4a4035, metalness: 0.55 })
                );
                harv.position.y = 0.35;
                group.add(harv);
                const pipe = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8),
                    new THREE.MeshStandardMaterial({ color: 0x6a5a48, metalness: 0.7 })
                );
                pipe.rotation.z = Math.PI / 2;
                pipe.position.set(0.6, 0.55, 0);
                group.add(pipe);
                fill = createFill(SPICE_BRIGHT, 0.35, 0.4);
                fill.position.set(0.3, 0.5, 0);
                portY = 0.5;
                break;
            }
            default:
                break;
        }

        addLabel(group, def, portY + 0.65);
        scene.add(group);
        return { group, fill, portY, id: def.id, color: def.color, type: def.type };
    }

    NODE_DEFS.forEach((d) => {
        nodes[d.id] = createNode(d);
    });

    livingWorld = attachLivingWorld({ scene, nodes, reducedMotion });

    function setNodeLevel(node, level) {
        if (!node?.fill) return;
        const lvl = Math.max(0.06, Math.min(0.95, level));
        const maxH = node.type === 'silo' ? FILL_H * 0.85 : 0.9;
        const h = maxH * lvl;
        node.fill.scale.y = Math.max(0.08, h / 0.08);
        node.fill.position.y = (node.type === 'silo' ? 0.15 : 0.2) + h / 2;
        node.fill.material.emissiveIntensity = 0.45 + lvl * 0.55;
    }

    function portWorld(id, key) {
        const n = nodes[id];
        const off = NODE_PORTS[id]?.[key] || [0, 0, 0];
        const p = n.group.position;
        return new THREE.Vector3(p.x + off[0], p.y + off[1], p.z + off[2]);
    }

    function mid(a, b, lift) {
        return new THREE.Vector3((a.x + b.x) / 2, Math.max(a.y, b.y) + lift, (a.z + b.z) / 2);
    }

    function pipePath(from, to) {
        const routes = {
            'P-Y': () => [portWorld('P', 'out'), mid(portWorld('P', 'out'), portWorld('Y', 'inL'), 0.2), portWorld('Y', 'inL')],
            'G-Y': () => [portWorld('G', 'out'), mid(portWorld('G', 'out'), portWorld('Y', 'inL'), 0.35), portWorld('Y', 'inL')],
            'I-Y': () => [portWorld('I', 'out'), mid(portWorld('I', 'out'), portWorld('Y', 'inR'), 0.35), portWorld('Y', 'inR')],
            'Y-C': () => [portWorld('Y', 'outL'), mid(portWorld('Y', 'outL'), portWorld('C', 'in'), 0.25), portWorld('C', 'in')],
            'Y-T': () => [portWorld('Y', 'outT'), mid(portWorld('Y', 'outT'), portWorld('T', 'in'), 0.5), portWorld('T', 'in')],
            'Y-S': () => [portWorld('Y', 'outR'), mid(portWorld('Y', 'outR'), portWorld('S', 'in'), 0.25), portWorld('S', 'in')],
            'C-Y': () => [portWorld('C', 'out'), mid(portWorld('C', 'out'), portWorld('Y', 'inB'), 0.2), portWorld('Y', 'inB')],
        };
        const fn = routes[`${from}-${to}`];
        return fn ? fn() : [portWorld(from, 'out') || portWorld(from, 'in'), portWorld(to, 'in')];
    }

    PIPES.forEach((p) => {
        const curve = new THREE.CatmullRomCurve3(pipePath(p.from, p.to), false, 'catmullrom', 0.35);
        const tube = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 28, 0.09, 6, false),
            new THREE.MeshStandardMaterial({
                color: 0x3d2810,
                emissive: p.color,
                emissiveIntensity: 0.25,
                roughness: 0.8,
                transparent: true,
                opacity: 0.88,
            })
        );
        tube.position.y = -0.15;
        scene.add(tube);
        pipeMeshes.push({ curve, color: p.color, key: `${p.from}-${p.to}` });
    });

    function buildDust(count) {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 22;
            pos[i * 3 + 1] = Math.random() * 6;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 22;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        dustParticles = new THREE.Points(
            geo,
            new THREE.PointsMaterial({ color: 0xe8c890, size: 0.06, transparent: true, opacity: 0.4, depthWrite: false })
        );
        scene.add(dustParticles);
    }
    buildDust(reducedMotion ? 60 : 180);

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
        labels.rate.textContent = Math.round((c.rate / 0.09) * 100) + '%';
        labels.tax.textContent = Math.round(c.tax * 100) + '%';
        labels.mpc.textContent = Math.round(c.mpc * 100) + '%';
    }

    function flowIntensity(flow, cap = 0.55) {
        return Math.min(cap, flow * 0.55);
    }

    function computeFlows(c) {
        const eq = macroEquilibrium(c);
        const f = macroFlows(state.Y, eq);
        const inject = eq.G + eq.I + eq.X;
        return {
            'P-Y': flowIntensity(eq.X / inject),
            gToY: flowIntensity(eq.G / inject),
            iToY: flowIntensity(eq.I / inject),
            yToC: flowIntensity(f.C),
            yToT: flowIntensity(f.T_flow),
            yToS: flowIntensity(f.S_flow + f.M_flow),
            cToY: flowIntensity(f.C * eq.mult * 0.1),
        };
    }

    const flowKeyMap = {
        'P-Y': 'P-Y',
        'G-Y': 'gToY',
        'I-Y': 'iToY',
        'Y-C': 'yToC',
        'Y-T': 'yToT',
        'Y-S': 'yToS',
        'C-Y': 'cToY',
    };

    function stepPhysics(c, dt) {
        const eq = macroEquilibrium(c);
        eq.rate = c.rate;
        const targets = macroFlows(eq.Y, eq);
        const k = 1 - Math.pow(0.001, dt);

        state.Y += (eq.Y - state.Y) * k;
        state.G += (c.gov - state.G) * k * 0.85;
        state.I += (eq.I / MACRO.I_BASE - state.I) * k * 0.85;
        state.T += (targets.T_flow - state.T) * k;
        state.S += (targets.S_flow - state.S) * k;
        state.C += (targets.C - state.C) * k;
        state.P += (c.rate / 0.09 - state.P) * k;

        const uPct = macroUnemployment(state.Y);
        const infl = macroInflation(state.Y, eq.G);

        if (hud.bnp) hud.bnp.textContent = String(Math.round(state.Y * 100)).padStart(3, '0');
        if (hud.mult) hud.mult.textContent = '×' + eq.mult.toFixed(2);
        if (hud.ledighet) hud.ledighet.textContent = uPct.toFixed(1) + '%';
        if (hud.inflasjon) hud.inflasjon.textContent = infl.toFixed(1) + '%';
        if (hud.status) hud.status.textContent = macroStatus(state.Y, eq, uPct);

        setNodeLevel(nodes.Y, state.Y);
        setNodeLevel(nodes.C, state.C / Math.max(0.2, eq.Y));
        setNodeLevel(nodes.T, state.T / Math.max(0.15, eq.Y));
        setNodeLevel(nodes.S, state.S / Math.max(0.15, eq.Y));
        setNodeLevel(nodes.G, state.G);
        setNodeLevel(nodes.I, Math.min(1, state.I));
        setNodeLevel(nodes.P, state.P);

        spiceLight.intensity = 1.2 + state.Y * 2;
        scene.fog.density = 0.024 + Math.max(0, (state.Y - MACRO.Y_POT) * 0.025);

        if (!reducedMotion && pumpGroup) {
            pumpGroup.rotation.y = Math.sin(performance.now() * 0.0004) * 0.06;
        }

        livingWorld?.update(dt, { pump: state.P, invest: state.I, spice: state.Y });

        return computeFlows(c);
    }

    const flowGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const flowMats = new Map();
    function flowMat(color) {
        if (!flowMats.has(color)) {
            flowMats.set(color, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.8, transparent: true, opacity: 0.95 }));
        }
        return flowMats.get(color);
    }

    function spawnParticles(flows) {
        const cap = window.innerWidth < 768 ? 65 : 130;
        pipeMeshes.forEach(({ curve, color, key }) => {
            const rate = flows[flowKeyMap[key]] || 0.05;
            if (Math.random() < rate * 2.8 && flowParticles.length < cap) {
                const mesh = new THREE.Mesh(flowGeo, flowMat(color));
                scene.add(mesh);
                flowParticles.push({ mesh, curve, t: 0, speed: 0.28 + rate * 0.9 });
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
            const pt = p.curve.getPointAt(p.t);
            if (!Number.isFinite(pt.x)) return false;
            p.mesh.position.copy(pt);
            p.mesh.scale.setScalar(0.6 + Math.sin(p.t * Math.PI) * 0.5);
            return true;
        });
    }

    function updateDust(dt) {
        if (!dustParticles || reducedMotion) return;
        const arr = dustParticles.geometry.attributes.position.array;
        for (let i = 0; i < arr.length; i += 3) {
            arr[i] += dt * 0.25;
            arr[i + 1] -= dt * 0.08;
            if (arr[i] > 11) arr[i] = -11;
            if (arr[i + 1] < 0) arr[i + 1] = 6;
        }
        dustParticles.geometry.attributes.position.needsUpdate = true;
    }

    let last = performance.now();
    let animId = 0;

    function renderFrame() {
        if (composer) composer.render();
        else renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
    }

    function renderStill() {
        const c = readControls();
        updateLabels(c);
        stepPhysics(c, 0.016);
        livingWorld?.faceCamera(camera);
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
        livingWorld?.faceCamera(camera);
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
        composer?.setSize(width, height);
        bloomPass?.resolution.set(width, height);
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
        const c0 = readControls();
        const eq0 = macroEquilibrium(c0);
        const f0 = macroFlows(eq0.Y, eq0);
        Object.assign(state, {
            Y: eq0.Y * 0.95,
            C: f0.C,
            T: f0.T_flow,
            S: f0.S_flow,
            G: c0.gov,
            I: eq0.I / MACRO.I_BASE,
            P: c0.rate / 0.09,
        });
        flowParticles.forEach((p) => scene.remove(p.mesh));
        flowParticles = [];
        updateLabels(c0);
        if (reducedMotion) renderStill();
    });

    const observer = new IntersectionObserver((entries) => {
        const visible = entries[0]?.isIntersecting;
        if (visible && !running) {
            running = true;
            if (reducedMotion) renderStill();
            else {
                last = performance.now();
                animate(last);
            }
        } else if (!visible) {
            running = false;
            cancelAnimationFrame(animId);
        }
    }, { threshold: 0.1 });
    observer.observe(panel);

    resize();
    updateLabels(readControls());
    if (reducedMotion) renderStill();
    else {
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
