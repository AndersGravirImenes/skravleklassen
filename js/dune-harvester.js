/**
 * Spice harvester — Dune II-sprites i 8 retninger, parametre fra Dune Dynasty unitinfo.
 * @see https://github.com/gameflorist/dunedynasty — UNIT_HARVESTER (index 16)
 * Sprite: SHAPE_HARVESTER, indexStart 22, indexEnd 101, dimension 24,
 * movingSpeedFactor 20, MOVEMENT_HARVESTER, harvest.wsa
 *
 * Grafikk: D2TM Unit_HarvesterSand.bmp (8×40 px retninger, 2 animasjonsrader × 39 px)
 */
import * as THREE from 'three';

/** Matcher g_table_unitInfo[UNIT_HARVESTER] i dunedynasty */
export const HARVESTER_UNIT = {
    indexStart: 22,
    indexEnd: 101,
    dimension: 24,
    movingSpeedFactor: 20,
    directions: 8,
    animRows: 2,
};

/** D2TM-ark layout (320×78) */
export const SHEET = {
    cols: 8,
    rows: 2,
    frameW: 40,
    frameH: 39,
    /** Visuell justering mot isometrisk Dune II (prøv ±1 ved behov) */
    dirOffset: 2,
};

const SHEET_URL = 'images/moniac/harvester-sand.png';

/** Samme som Orientation_256To8 i dunedynasty/src/tools/orientation.c */
export function orientation256To8(orient256) {
    return ((orient256 + 16) & 0xe0) >> 5;
}

/** Bevegelsesretning (XZ) + kameravinkel → 8 sprite-retninger */
export function headingToDir8(headingRad, cameraYaw) {
    const rel = headingRad - cameraYaw;
    const norm = ((rel / (Math.PI * 2)) % 1 + 1) % 1;
    const orient256 = Math.round(norm * 256) & 0xff;
    return (orientation256To8(orient256) + SHEET.dirOffset) % 8;
}

/** Hastighet skalert med P-slider; movingSpeedFactor 20 som referanse */
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
        const nearBlack = r < 24 && g < 24 && b < 24;
        if (magenta || nearBlack) px[i + 3] = 0;
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

let atlasPromise = null;

export function loadHarvesterAtlas(url = SHEET_URL) {
    if (!atlasPromise) {
        atlasPromise = new Promise((resolve, reject) => {
            new THREE.TextureLoader().load(
                url,
                (tex) => {
                    const keyed = chromaKeyTexture(tex.image);
                    tex.dispose();
                    resolve(keyed);
                },
                undefined,
                reject
            );
        });
    }
    return atlasPromise;
}

/**
 * @param {THREE.Texture} atlas
 * @param {number} worldScale
 */
export function createHarvesterSprite(atlas, worldScale = 2.15) {
    const aspect = SHEET.frameW / SHEET.frameH;
    const mat = new THREE.MeshBasicMaterial({
        map: atlas,
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
    const col = dir8 % SHEET.cols;
    const row = animRow % SHEET.rows;
    map.repeat.set(1 / SHEET.cols, 1 / SHEET.rows);
    map.offset.set(col / SHEET.cols, 1 - (row + 1) / SHEET.rows);
    map.needsUpdate = true;
}
