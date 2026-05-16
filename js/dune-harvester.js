/**
 * Spice harvester — Dune II-sprites, parametre fra Dune Dynasty unitinfo.
 * @see https://github.com/gameflorist/dunedynasty — UNIT_HARVESTER (groundSpriteID 248)
 */
import * as THREE from 'three';

/** Matcher g_table_unitInfo[UNIT_HARVESTER] */
export const HARVESTER_UNIT = {
    indexStart: 22,
    indexEnd: 101,
    dimension: 24,
    movingSpeedFactor: 20,
    groundSpriteID: 248,
    directions: 8,
};

/** D2TM / Dune II Unit_HarvesterSand — 8 retninger × 2 animasjonsrammer */
const SAND_SHEET = {
    url: 'images/moniac/harvester-sand.png',
    cols: 8,
    rows: 2,
    frameW: 40,
    frameH: 39,
    dirOffset: 2,
};

let activeSheet = SAND_SHEET;
let atlasPromise = null;

function makeFallbackAtlas() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#5a4a38';
    ctx.fillRect(8, 20, 48, 28);
    ctx.fillStyle = '#e8923a';
    ctx.fillRect(24, 14, 16, 10);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.userData.sheet = {
        url: 'fallback',
        cols: 1,
        rows: 1,
        frameW: 64,
        frameH: 64,
        dirOffset: 0,
    };
    return tex;
}

/** Samme som Orientation_256To8 i dunedynasty/src/tools/orientation.c */
export function orientation256To8(orient256) {
    return ((orient256 + 16) & 0xe0) >> 5;
}

export function headingToDir8(headingRad, cameraYaw) {
    const rel = headingRad - cameraYaw;
    const norm = ((rel / (Math.PI * 2)) % 1 + 1) % 1;
    const orient256 = Math.round(norm * 256) & 0xff;
    return (orientation256To8(orient256) + activeSheet.dirOffset) % 8;
}

export function speedFromPump(pump01, base = 0.04) {
    const f = HARVESTER_UNIT.movingSpeedFactor / 20;
    return base * f * (0.18 + pump01 * 1.72);
}

function chromaKeyTexture(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        const magenta = r > 200 && b > 200 && g < 100;
        const pureBlack = r === 0 && g === 0 && b === 0;
        if (magenta || pureBlack) px[i + 3] = 0;
    }
    ctx.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

function loadSheet(sheet) {
    return new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(
            sheet.url,
            (tex) => {
                const keyed = chromaKeyTexture(tex.image);
                tex.dispose();
                keyed.userData.sheet = {
                    ...sheet,
                    frameW: keyed.image.width / sheet.cols,
                    frameH: keyed.image.height / sheet.rows,
                };
                resolve(keyed);
            },
            undefined,
            reject
        );
    });
}

export function loadHarvesterAtlas() {
    if (!atlasPromise) {
        atlasPromise = loadSheet(SAND_SHEET)
            .then((tex) => {
                activeSheet = tex.userData.sheet;
                return tex;
            })
            .catch(() => {
                const tex = makeFallbackAtlas();
                activeSheet = tex.userData.sheet;
                return tex;
            });
    }
    return atlasPromise;
}

export function createHarvesterSprite(atlas, worldScale = 2.35) {
    const sheet = atlas.userData.sheet ?? activeSheet;
    const map = atlas.clone();
    map.userData.sheet = { ...sheet };
    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.magFilter = THREE.NearestFilter;
    map.minFilter = THREE.NearestFilter;
    map.flipY = true;
    const aspect = sheet.frameW / sheet.frameH;
    const mat = new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        alphaTest: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(aspect * worldScale, worldScale),
        mat
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 6;
    return { mesh, anim: 0 };
}

export function setHarvesterFrame(mesh, dir8, animRow) {
    const map = mesh.material.map;
    if (!map) return;
    const { cols, rows } = map.userData?.sheet ?? activeSheet;
    let col;
    let row;
    if (cols === 1) {
        col = 0;
        row = dir8 % rows;
    } else {
        col = dir8 % cols;
        row = animRow % rows;
    }
    map.repeat.set(1 / cols, 1 / rows);
    map.offset.set(col / cols, 1 - (row + 1) / rows);
    map.needsUpdate = true;
}
