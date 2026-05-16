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
    { id: 'P', label: 'P', sub: 'HARVESTER', pos: [-5.2, 0, 0], color: COLORS.pump, type: 'pump' },
    { id: 'G', label: 'G', sub: 'OFFENTLIG FORBRUK', pos: [-3.4, 0, -2.6], color: COLORS.gov, type: 'imperial' },
    { id: 'C', label: 'C', sub: 'MPC', pos: [-3.4, 0, 2.6], color: COLORS.consume, type: 'guild' },
    { id: 'Y', label: 'Y', sub: 'TOTAL SPICE-HØST', pos: [0, 0, 0], color: COLORS.income, type: 'silo', hub: true },
    { id: 'T', label: 'T', sub: 'SKATTESATS', pos: [3.4, 0, -2.6], color: COLORS.tax, type: 'choam' },
    { id: 'I', label: 'I', sub: 'INVEST RATE · BANK', pos: [3.4, 0, 0.2], color: COLORS.invest, type: 'factory' },
    { id: 'S', label: 'S', sub: 'SPARERATE · SILO', pos: [3.4, 0, 2.6], color: COLORS.save, type: 'sietch' },
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
    Y_POT: 0.88,
    NAIRU: 0.042,
    /** m — importtilbøyelighet (øvre høyre ventil) */
    M: 0.22,
    /** Autonom eksport X (harvester / utland) — skaleres med P */
    X_BASE: 0.06,
    X_RATE_SCALE: 0.22,
    /** I_rate — utstrømning fra sparetank (BankTank) */
    I_BASE: 0.35,
    R_NEUTRAL: 0.045,
    R_SENS: 1.4,
    I_FLOOR: 0.2,
    PI_TARGET: 2.0,
    OKUN_COEF: 7.5,
    PHILLIPS_COEF: 9,
    FISCAL_INFL_COEF: 4,
    /** Dynamikk: hvor raskt strømmer vann per sekund */
    FLOW_GAIN: 2.8,
};

/** Autonom injeksjon X fra harvester (P) */
function exportFromRate(rate) {
    return MACRO.X_BASE + rate * MACRO.X_RATE_SCALE;
}

/**
 * Parametre fra glidere → ventiler i MONIAC.
 * Normaliseres hvis t+c+s+m > 1 (summerer til mer enn 100 % lekkasje).
 */
function tankParams(controls) {
    let t = controls.tax;
    let c = controls.mpc;
    let s = controls.save;
    let m = controls.import;
    const sum = t + c + s + m;
    const normalized = sum > 1.001;
    if (normalized) {
        const k = 1 / sum;
        t *= k;
        c *= k;
        s *= k;
        m *= k;
    }
    const rateGap = Math.max(0, controls.rate - MACRO.R_NEUTRAL);
    const I_rate = MACRO.I_BASE * Math.max(MACRO.I_FLOOR, 1 - MACRO.R_SENS * rateGap);
    return {
        t,
        c,
        s,
        m,
        G_rate: controls.gov,
        I_rate,
        X: exportFromRate(controls.rate),
        rate: controls.rate,
        normalized,
        rawSum: sum,
    };
}

function createInitialTanks(p) {
    const Y = 0.52;
    return {
        Y,
        GovtTank: p.t * Y * 0.55,
        BankTank: p.s * Y * 0.5,
        ForeignTank: 0.04,
    };
}

/**
 * Ett tidssteg — Phillips sub-tanker.
 * Lekkasjer: T + S + M (+ c direkte tilbake som C).
 * Injeksjoner: G (fra GovtTank) + I (fra BankTank) + X (autonom).
 */
function stepTanks(tanks, p, dt) {
    const g = MACRO.FLOW_GAIN;
    const Y = tanks.Y;

    const taxFlow = p.t * Y * g;
    const consumeFlow = p.c * Y * g;
    const saveFlow = p.s * Y * g;
    const importFlow = p.m * Y * g;

    const gFlow = p.G_rate * tanks.GovtTank * g;
    const iFlow = p.I_rate * tanks.BankTank * g;
    const xFlow = p.X * g;

    const leak = taxFlow + consumeFlow + saveFlow + importFlow;
    const inject = consumeFlow + gFlow + iFlow + xFlow;

    tanks.GovtTank = Math.max(0, tanks.GovtTank + (taxFlow - gFlow) * dt);
    tanks.BankTank = Math.max(0, tanks.BankTank + (saveFlow - iFlow) * dt);
    tanks.ForeignTank += (importFlow - xFlow) * dt;
    tanks.Y = Math.max(0.08, Math.min(0.98, Y + (inject - leak) * dt));

    const S = saveFlow;
    const T_flow = taxFlow;
    const M_flow = importFlow;
    const leakSide = S + T_flow + M_flow;
    const injectSide = iFlow + gFlow + xFlow;
    const equilGap = leakSide - injectSide;
    const mult = 1 / Math.max(0.1, p.c + p.s + p.t + p.m);

    return {
        flows: {
            C: consumeFlow,
            T_flow,
            S_flow: saveFlow,
            M_flow,
            gFlow,
            iFlow,
            xFlow,
            taxFlow,
            saveFlow,
            importFlow,
        },
        equilGap,
        mult,
        inject,
        leak,
    };
}

function macroUnemployment(Y) {
    const gap = Math.max(0, (MACRO.Y_POT - Y) / MACRO.Y_POT);
    return MACRO.NAIRU * 100 + gap * MACRO.OKUN_COEF;
}

function macroInflation(Y, gFlow) {
    const outputGap = (Y - MACRO.Y_POT) / MACRO.Y_POT;
    const demandPull = MACRO.PHILLIPS_COEF * outputGap;
    const fiscal = MACRO.FISCAL_INFL_COEF * Math.max(0, gFlow - 0.04);
    return Math.max(0, MACRO.PI_TARGET + demandPull + fiscal);
}

function macroStatus(Y, equilGap, uPct, tanks, p) {
    const gap = (Y - MACRO.Y_POT) / MACRO.Y_POT;
    if (Math.abs(equilGap) < 0.015 && tanks.GovtTank > 0.02) {
        return 'LIKEVEKT — S+T+M ≈ I+G+X';
    }
    if (gap > 0.06) return 'SPICE-TSUNAMI — ØKOLOGISK GRENS';
    if (Y < 0.2) return 'TØRKE — HARVESTER STANSET';
    if (tanks.GovtTank < 0.02 && equilGap > 0.02) return 'STATSAPPARAT TØMT — G BREMSER';
    if (tanks.BankTank < 0.02 && equilGap > 0.02) return 'SIETCH-TØMT — I BREMSER';
    if (tanks.ForeignTank > 0.12) return 'IMPORTLEKKASJE — UTLAND FYLLER';
    if (p?.normalized) return 'VENTILER > 100% — STRØMMER NORMALISERT';
    if (uPct > MACRO.NAIRU * 100 + 2.5) return 'SIETCH-TAPT KAPASITET';
    if (equilGap > 0.03) return 'LEKKASJE > INJEKSJON — Y SINKER';
    if (equilGap < -0.03) return 'INJEKSJON > LEKKASJE — Y STIGER';
    return 'SIRKULASJON I BEVEGELSE';
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
        save: document.getElementById('moniac-save'),
        importLeaks: document.getElementById('moniac-import'),
    };

    const labels = {
        gov: document.getElementById('moniac-gov-val'),
        rate: document.getElementById('moniac-rate-val'),
        tax: document.getElementById('moniac-tax-val'),
        mpc: document.getElementById('moniac-mpc-val'),
        save: document.getElementById('moniac-save-val'),
        importLeaks: document.getElementById('moniac-import-val'),
    };

    const _initC = { gov: 0.35, rate: 0.045, tax: 0.28, mpc: 0.48, save: 0.12, import: 0.22 };
    const _initP = tankParams(_initC);
    const tanks = createInitialTanks(_initP);
    const _initStep = stepTanks(tanks, _initP, 0);
    const state = {
        tanks,
        flows: _initStep.flows,
        P: _initC.rate / 0.09,
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
                const portraitH = 1.55;
                new THREE.TextureLoader().load(
                    'images/moniac/emperor.webp',
                    (tex) => {
                        tex.colorSpace = THREE.SRGBColorSpace;
                        const aspect = tex.image.width / Math.max(1, tex.image.height);
                        const frame = new THREE.Mesh(
                            new THREE.PlaneGeometry(aspect * portraitH, portraitH),
                            new THREE.MeshBasicMaterial({
                                map: tex,
                                transparent: true,
                                depthWrite: false,
                            })
                        );
                        frame.position.set(0.85, portraitH / 2 + 0.2, 0.35);
                        group.add(frame);
                    }
                );
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
                const mound = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.45, 12), sandMat);
                mound.position.y = -0.32;
                group.add(mound);
                const siloH = 1.65;
                new THREE.TextureLoader().load(
                    'images/moniac/silo.jpg',
                    (tex) => {
                        tex.colorSpace = THREE.SRGBColorSpace;
                        const aspect = tex.image.width / Math.max(1, tex.image.height);
                        const silo = new THREE.Mesh(
                            new THREE.PlaneGeometry(aspect * siloH, siloH),
                            new THREE.MeshBasicMaterial({
                                map: tex,
                                transparent: true,
                                depthWrite: false,
                            })
                        );
                        silo.position.set(0, siloH / 2 + 0.1, 0.45);
                        group.add(silo);
                    }
                );
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
                const mound = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.4, 12), sandMat);
                mound.position.y = -0.3;
                group.add(mound);
                const harvH = 1.1;
                new THREE.TextureLoader().load(
                    'images/moniac/harvester-long.webp',
                    (tex) => {
                        tex.colorSpace = THREE.SRGBColorSpace;
                        const aspect = tex.image.width / Math.max(1, tex.image.height);
                        const harv = new THREE.Mesh(
                            new THREE.PlaneGeometry(aspect * harvH, harvH),
                            new THREE.MeshBasicMaterial({
                                map: tex,
                                transparent: true,
                                depthWrite: false,
                            })
                        );
                        harv.position.set(0, harvH / 2 + 0.15, 0.55);
                        group.add(harv);
                    }
                );
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
            save: Number(controls.save.value) / 100,
            import: Number(controls.importLeaks.value) / 100,
        };
    }

    function updateLabels(c) {
        labels.gov.textContent = Math.round(c.gov * 100) + '%';
        labels.rate.textContent = Math.round((c.rate / 0.09) * 100) + '%';
        labels.tax.textContent = Math.round(c.tax * 100) + '%';
        labels.mpc.textContent = Math.round(c.mpc * 100) + '%';
        labels.save.textContent = Math.round(c.save * 100) + '%';
        labels.importLeaks.textContent = Math.round(c.import * 100) + '%';
    }

    function flowIntensity(flow, cap = 0.55) {
        return Math.min(cap, flow * 0.55);
    }

    function computeFlows(f) {
        const inj = f.gFlow + f.iFlow + f.xFlow + f.C * 0.01;
        const injSum = Math.max(0.02, inj);
        return {
            'P-Y': flowIntensity(f.xFlow / injSum),
            gToY: flowIntensity(f.gFlow / injSum),
            iToY: flowIntensity(f.iFlow / injSum),
            yToC: flowIntensity(f.C),
            yToT: flowIntensity(f.taxFlow),
            yToS: flowIntensity(f.saveFlow),
            yToM: flowIntensity(f.importFlow),
            cToY: flowIntensity(f.C * 0.35),
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

    function stepPhysics(controls, dt) {
        const p = tankParams(controls);
        const step = stepTanks(state.tanks, p, dt);
        const f = step.flows;
        state.flows = f;

        const k = 1 - Math.pow(0.001, dt);
        state.P += (controls.rate / 0.09 - state.P) * k;

        const Y = state.tanks.Y;
        const uPct = macroUnemployment(Y);
        const infl = macroInflation(Y, f.gFlow);

        if (hud.bnp) hud.bnp.textContent = String(Math.round(Y * 100)).padStart(3, '0');
        if (hud.mult) hud.mult.textContent = '×' + step.mult.toFixed(2);
        if (hud.ledighet) hud.ledighet.textContent = uPct.toFixed(1) + '%';
        if (hud.inflasjon) hud.inflasjon.textContent = infl.toFixed(1) + '%';
        if (hud.status) {
            hud.status.textContent = macroStatus(Y, step.equilGap, uPct, state.tanks, p);
        }

        setNodeLevel(nodes.Y, Y);
        setNodeLevel(nodes.C, f.C / Math.max(0.08, Y * MACRO.FLOW_GAIN));
        setNodeLevel(nodes.T, state.tanks.GovtTank / Math.max(0.12, Y));
        setNodeLevel(nodes.S, state.tanks.BankTank / Math.max(0.1, Y * 0.5));
        setNodeLevel(nodes.G, Math.min(1, state.tanks.GovtTank / 0.2));
        setNodeLevel(nodes.I, Math.min(1, f.iFlow / 0.15));
        setNodeLevel(nodes.P, state.P);

        spiceLight.intensity = 1.2 + Y * 2;
        scene.fog.density = 0.024 + Math.max(0, (Y - MACRO.Y_POT) * 0.025);

        if (!reducedMotion && pumpGroup) {
            pumpGroup.rotation.y = Math.sin(performance.now() * 0.0004) * 0.06;
        }

        livingWorld?.update(dt, {
            pump: state.P,
            invest: p.I_rate,
            spice: Y,
            camera,
        });

        return computeFlows(f);
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
        controls.mpc.value = 48;
        controls.save.value = 12;
        controls.importLeaks.value = 22;
        const c0 = readControls();
        const p0 = tankParams(c0);
        state.tanks = createInitialTanks(p0);
        state.flows = stepTanks(state.tanks, p0, 0).flows;
        state.P = c0.rate / 0.09;
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
