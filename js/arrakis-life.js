/**
 * Levende Arrakis-enheter — harvester-sprites fra Dune II / Dune Dynasty-spes.
 */
import * as THREE from 'three';
import {
    createHarvesterSprite,
    headingToDir8,
    loadHarvesterAtlas,
    setHarvesterFrame,
    speedFromPump,
} from './dune-harvester.js';

const SPICE = 0xe8923a;
const SPICE_GLOW = 0xffc04d;

function makeOrniTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = '#6a5a48';
    ctx.beginPath();
    ctx.moveTo(32, 8);
    ctx.lineTo(52, 48);
    ctx.lineTo(32, 40);
    ctx.lineTo(12, 48);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = SPICE_GLOW;
    ctx.fillRect(28, 28, 8, 6);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function ellipsePath(cx, cz, rx, rz, y = -0.9) {
    return {
        getPoint(t) {
            const a = t * Math.PI * 2;
            return new THREE.Vector3(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz);
        },
        getHeading(t) {
            const a = t * Math.PI * 2;
            return Math.atan2(Math.cos(a) * rz, -Math.sin(a) * rx);
        },
    };
}

function linePath(from, to, y = -0.85) {
    const a = from.clone();
    const b = to.clone();
    a.y = y;
    b.y = y;
    return {
        pingPong(t) {
            return t < 0.5 ? t * 2 : 2 - t * 2;
        },
        getPoint(t) {
            return a.clone().lerp(b, this.pingPong(t));
        },
        getHeading(t) {
            const forward = t < 0.5;
            return Math.atan2(
                (b.z - a.z) * (forward ? 1 : -1),
                (b.x - a.x) * (forward ? 1 : -1)
            );
        },
    };
}

function createBillboard(texture, scale = 1.4) {
    const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.15,
        depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale), mat);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
}

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {object} opts.nodes - MONIAC node refs
 * @param {boolean} opts.reducedMotion
 */
export function attachLivingWorld({ scene, nodes, reducedMotion }) {
    const orniTex = makeOrniTexture();
    const entities = [];
    const trails = [];
    const worm = { segments: [], phase: 0 };
    let harvesterAtlas = null;
    let cameraYaw = 0;

    const yPos = nodes.Y?.group?.position;
    const pPos = nodes.P?.group?.position;
    const cx = yPos?.x ?? 0;
    const cz = yPos?.z ?? 0;

    function addHarvester(path, baseSpeed) {
        const root = new THREE.Group();
        const placeholder = new THREE.Mesh(
            new THREE.BoxGeometry(0.01, 0.01, 0.01),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        root.add(placeholder);
        scene.add(root);
        const entity = {
            kind: 'harvester',
            root,
            mesh: null,
            path,
            phase: Math.random(),
            baseSpeed,
            anim: 0,
            dir8: 0,
        };
        entities.push(entity);
        return entity;
    }

    addHarvester(ellipsePath(cx, cz, 5.2, 3.8), 0.045);
    addHarvester(ellipsePath(cx, cz, 6.8, 5.2), 0.032);
    addHarvester(ellipsePath(cx, cz, 4.2, 6.5), 0.038);

    if (pPos && yPos) {
        const depot = new THREE.Vector3(pPos.x + 1.2, -0.85, pPos.z);
        const siloIn = new THREE.Vector3(cx - 1.1, -0.85, cz);
        addHarvester(linePath(depot, siloIn), 0.12);
    }

    loadHarvesterAtlas().then((atlas) => {
        harvesterAtlas = atlas;
        entities.forEach((e) => {
            if (e.kind !== 'harvester' || e.mesh) return;
            e.root.clear();
            const { mesh } = createHarvesterSprite(atlas);
            e.mesh = mesh;
            e.root.add(mesh);
            setHarvesterFrame(mesh, e.dir8, 0);
        });
    }).catch(() => {
        console.warn('Harvester-sprites kunne ikke lastes.');
    });

    const orni = new THREE.Group();
    orni.add(createBillboard(orniTex, 1.2));
    orni.position.y = 4.5;
    scene.add(orni);
    entities.push({ kind: 'ornithopter', root: orni, phase: 0, speed: 0.08 });

    for (let i = 0; i < 8; i++) {
        const seg = new THREE.Mesh(
            new THREE.SphereGeometry(0.28 + i * 0.05, 8, 8),
            new THREE.MeshStandardMaterial({
                color: 0x3d2818,
                emissive: 0x5a3820,
                emissiveIntensity: 0.3,
                roughness: 0.95,
            })
        );
        seg.visible = false;
        scene.add(seg);
        worm.segments.push(seg);
    }

    const trailGeo = new THREE.SphereGeometry(0.04, 4, 4);
    const trailMat = new THREE.MeshBasicMaterial({
        color: SPICE_GLOW,
        transparent: true,
        opacity: 0.7,
    });

    function spawnTrail(pos) {
        if (trails.length > 40) return;
        const m = new THREE.Mesh(trailGeo, trailMat.clone());
        m.position.copy(pos);
        m.position.y += 0.15;
        scene.add(m);
        trails.push({ mesh: m, life: 1 });
    }

    function update(dt, intensities = {}) {
        const pump = intensities.pump ?? 0.5;
        const invest = intensities.invest ?? 0.5;
        const spice = intensities.spice ?? 0.5;
        const camera = intensities.camera;

        if (camera) {
            cameraYaw = Math.atan2(
                camera.position.x - cx,
                camera.position.z - cz
            );
        }

        entities.forEach((e) => {
            if (e.kind === 'harvester') {
                const moveSpeed = speedFromPump(pump, e.baseSpeed);
                e.phase = (e.phase + dt * moveSpeed) % 1;
                const pos = e.path.getPoint(e.phase);
                const heading = e.path.getHeading(e.phase);
                e.root.position.copy(pos);
                e.dir8 = headingToDir8(heading, cameraYaw);
                e.anim += dt * moveSpeed * 42;
                const animRow = Math.floor(e.anim) % 2;
                if (e.mesh) {
                    setHarvesterFrame(e.mesh, e.dir8, animRow);
                    e.mesh.visible = true;
                }
                if (!reducedMotion && Math.random() < 0.08 * pump) spawnTrail(pos);
            }
            if (e.kind === 'ornithopter' && invest > 0.25) {
                e.phase = (e.phase + dt * e.speed * (0.5 + invest)) % 1;
                const a = e.phase * Math.PI * 2;
                const r = 7.5 + invest * 2;
                e.root.position.set(cx + Math.cos(a) * r, 3.8 + Math.sin(a * 3) * 0.4, cz + Math.sin(a) * r);
                e.root.rotation.y = a + Math.PI / 2;
                e.root.visible = true;
            } else if (e.kind === 'ornithopter') {
                e.root.visible = false;
            }
        });

        worm.phase = (worm.phase + dt * 0.15 * pump) % 1;
        const wormActive = pump > 0.2;
        worm.segments.forEach((seg, i) => {
            seg.visible = wormActive;
            if (!wormActive) return;
            const t = (worm.phase + i * 0.08) % 1;
            const wx = cx + (t - 0.5) * 14;
            const wz = cz - 6 + t * 12;
            seg.position.set(wx, -0.5 + Math.sin(t * Math.PI * 4) * 0.15, wz);
        });

        trails.forEach((t) => {
            t.life -= dt * 1.8;
            t.mesh.material.opacity = t.life * 0.6;
            t.mesh.scale.setScalar(t.life * 0.8);
        });
        for (let i = trails.length - 1; i >= 0; i--) {
            if (trails[i].life <= 0) {
                scene.remove(trails[i].mesh);
                trails[i].mesh.material.dispose();
                trails.splice(i, 1);
            }
        }

        if (nodes.Y?.fill) {
            nodes.Y.fill.material.emissiveIntensity = 0.5 + spice * 0.6 + Math.sin(performance.now() * 0.003) * 0.08;
        }
    }

    function faceCamera(camera) {
        entities.forEach((e) => {
            if (e.kind !== 'ornithopter' || !e.root?.children[0]) return;
            const mesh = e.root.children[0];
            mesh.lookAt(camera.position.x, mesh.getWorldPosition(new THREE.Vector3()).y, camera.position.z);
        });
    }

    return { update, faceCamera };
}
