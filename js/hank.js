/**
 * HANK — Heterogen Arrakis New Keynesian
 * To agenttyper på Arrakis: Fremen (HtM) og CHOAM (sparere).
 */
const COLORS = {
    spice: '#e8923a',
    spiceBright: '#ffc04d',
    guild: '#5eb8e8',
    sietch: '#6b8f7a',
    choam: '#d4af37',
    imperial: '#9c3b28',
    sand: '#c9a86c',
    grid: 'rgba(201, 168, 108, 0.12)',
    text: '#f5e6c8',
    muted: 'rgba(200, 168, 144, 0.65)',
};

const PARAMS = {
    beta: 0.99,
    kappa: 0.32,
    phiPi: 1.5,
    phiY: 0.25,
    sigmaIS: 0.85,
    omega: 0.68,
    bondPhi: 0.04,
    historyLen: 120,
};

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

/**
 * Redusert 2-type HANK for Arrakis.
 * y: output gap, pi: spice-inflasjon, b: CHOAM-obligasjoner (relativt).
 */
function stepHank(state, ctrl, dt) {
    const lambda = ctrl.fremenShare;
    const richShare = 1 - lambda;

    const rStar = ctrl.guildRate / 100;
    const piStar = ctrl.piTarget / 100;
    const g = ctrl.imperialG / 100;
    const worm = ctrl.wormShock / 100;
    const theta = ctrl.priceStick / 100;
    const mpcR = ctrl.choamMpc / 100;

    const { y, pi, b } = state;

    const piGap = pi - piStar;
    const i = rStar + PARAMS.phiPi * piGap + PARAMS.phiY * y;

    const dy =
        -PARAMS.sigmaIS * (i - rStar) +
        g * 0.55 +
        worm * 0.9 -
        theta * 0.15 * piGap -
        0.08 * b;

    const dpi =
        PARAMS.beta * pi +
        PARAMS.kappa * y +
        worm * 0.35 +
        g * 0.12;

    const laborF = lambda * (1 + 0.4 * y);
    const profitR = richShare * (1 + 0.25 * y);
    const bondInc = PARAMS.bondPhi * b;

    const yF = laborF * (1 + y);
    const yR = profitR * (1 + y) + bondInc;
    const cF = yF;
    const cR = mpcR * (yR + Math.max(0, b) * 0.5);
    const cAgg = lambda * cF + richShare * cR;

    const db = richShare * (yR - cR) * dt * 2.2;

    const spread = richShare > 0.01 ? (cR / richShare - cF / lambda) / Math.max(0.05, cAgg) : 0;
    const u = clamp(0.042 - 0.35 * y + worm * 0.08, 0.01, 0.22);

    return {
        y: y + dy * dt,
        pi: pi + dpi * dt,
        b: clamp(b + db, -0.4, 1.2),
        i,
        cF,
        cR,
        cAgg,
        spread,
        u,
        lambda,
        richShare,
    };
}

function macroStatus(y, pi, spread, u, ctrl) {
    if (ctrl.wormShock > 60) return 'SANDWORM-SJOKK — PRODUKSJON KOLLAPSER';
    if (pi > ctrl.piTarget / 100 + 0.04) return 'SPICE-HYPERINFLASJON — GUILD STRAMMER';
    if (pi < -0.01) return 'DEFLASJON I SIETCH-PRISER';
    if (spread > 0.35) return 'CHOAM-RIKDOM — FREMEN SULTER';
    if (spread < -0.1) return 'FREMEN-BØLGE — KORTSIKTIG ETTERSPØRSEL';
    if (u > 0.1) return 'SIETCH-ARBEIDSLØSHET — Y UNDER POTENSIAL';
    if (Math.abs(y) < 0.02 && Math.abs(pi - ctrl.piTarget / 100) < 0.008) {
        return 'HANK-LIKEVEKT — NOMINAL RIGIDITET BIND';
    }
    if (y > 0.06) return 'SPICE-BOOM — OUTPUT GAP POSITIV';
    if (y < -0.05) return 'ØRKEN-RESSESJON';
    return 'TRANSISJON — AGENTER OPPDATERER';
}

function initHank() {
    const section = document.getElementById('hank');
    const canvas = document.getElementById('hank-canvas');
    if (!section || !canvas) return;

    const hud = {
        y: document.getElementById('hank-y'),
        pi: document.getElementById('hank-pi'),
        spread: document.getElementById('hank-spread'),
        u: document.getElementById('hank-u'),
        status: document.getElementById('hank-status'),
    };

    const sliders = {
        fremenShare: bindSlider('hank-fremen', 'hank-fremen-val', (v) => `${v}%`),
        guildRate: bindSlider('hank-rate', 'hank-rate-val', (v) => `${(v / 10).toFixed(1)}%`),
        imperialG: bindSlider('hank-g', 'hank-g-val', (v) => `${v}%`),
        piTarget: bindSlider('hank-pi-target', 'hank-pi-target-val', (v) => `${(v / 10).toFixed(1)}%`),
        wormShock: bindSlider('hank-worm', 'hank-worm-val', (v) => `${v}%`),
        priceStick: bindSlider('hank-stick', 'hank-stick-val', (v) => `${v}%`),
        choamMpc: bindSlider('hank-mpc', 'hank-mpc-val', (v) => `${v}%`),
    };

    function readControls() {
        return {
            fremenShare: sliders.fremenShare.value / 100,
            guildRate: sliders.guildRate.value / 10,
            imperialG: sliders.imperialG.value,
            piTarget: sliders.piTarget.value / 10,
            wormShock: sliders.wormShock.value,
            priceStick: sliders.priceStick.value,
            choamMpc: sliders.choamMpc.value,
        };
    }

    const defaults = {
        y: 0,
        pi: 0.02,
        b: 0.15,
    };

    let state = { ...defaults };
    let derived = stepHank(state, readControls(), 0);
    const history = {
        y: [],
        pi: [],
        cF: [],
        cR: [],
    };

    let running = true;
    let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let dpr = 1;

    function resize() {
        const rect = canvas.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, reducedMotion ? 1 : 2);
        w = Math.max(320, rect.width);
        h = Math.max(280, rect.height);
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function pushHistory() {
        history.y.push(derived.y);
        history.pi.push(derived.pi);
        history.cF.push(derived.cF);
        history.cR.push(derived.cR);
        const max = PARAMS.historyLen;
        for (const key of Object.keys(history)) {
            if (history[key].length > max) history[key].shift();
        }
    }

    function updateHud() {
        const ctrl = readControls();
        hud.y.textContent = `${(derived.y * 100).toFixed(1)}%`;
        hud.pi.textContent = `${(derived.pi * 100).toFixed(2)}%`;
        hud.spread.textContent = `${(derived.spread * 100).toFixed(0)}%`;
        hud.u.textContent = `${(derived.u * 100).toFixed(1)}%`;
        hud.status.textContent = macroStatus(derived.y, derived.pi, derived.spread, derived.u, ctrl);
    }

    function drawChart(x0, y0, cw, ch, series, colors, yLabel) {
        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const gy = y0 + (ch * i) / 4;
            ctx.beginPath();
            ctx.moveTo(x0, gy);
            ctx.lineTo(x0 + cw, gy);
            ctx.stroke();
        }

        const all = series.flat();
        let minV = Math.min(...all, -0.05);
        let maxV = Math.max(...all, 0.05);
        const pad = (maxV - minV) * 0.12 || 0.05;
        minV -= pad;
        maxV += pad;
        const range = maxV - minV || 1;

        const mapY = (v) => y0 + ch - ((v - minV) / range) * ch;

        series.forEach((arr, idx) => {
            if (arr.length < 2) return;
            ctx.strokeStyle = colors[idx];
            ctx.lineWidth = 2;
            ctx.beginPath();
            arr.forEach((v, i) => {
                const x = x0 + (i / (PARAMS.historyLen - 1)) * cw;
                const y = mapY(v);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        });

        ctx.fillStyle = COLORS.muted;
        ctx.font = '10px "Share Tech Mono", monospace';
        ctx.fillText(yLabel, x0, y0 - 6);
        ctx.fillText(maxV.toFixed(2), x0 + 4, y0 + 10);
        ctx.fillText(minV.toFixed(2), x0 + 4, y0 + ch - 4);
    }

    function drawAgents(x0, y0, aw, ah) {
        const ctrl = readControls();
        const lambda = ctrl.fremenShare;
        const maxC = Math.max(derived.cF / lambda, derived.cR / (1 - lambda), 0.01);

        const barW = (aw - 24) / 2;
        const fH = (derived.cF / lambda / maxC) * (ah - 50);
        const rH = (derived.cR / (1 - lambda) / maxC) * (ah - 50);

        ctx.fillStyle = COLORS.muted;
        ctx.font = '11px "Share Tech Mono", monospace';
        ctx.fillText('AGENTFORDELING — SPICE-FORBRUK', x0, y0 + 14);

        const baseY = y0 + ah - 28;

        ctx.fillStyle = COLORS.sietch;
        ctx.fillRect(x0 + 8, baseY - fH, barW, fH);
        ctx.fillStyle = COLORS.choam;
        ctx.fillRect(x0 + 16 + barW, baseY - rH, barW, rH);

        ctx.fillStyle = COLORS.text;
        ctx.font = '10px Rajdhani, sans-serif';
        ctx.fillText(`FREMEN λ=${(lambda * 100).toFixed(0)}%`, x0 + 8, baseY + 14);
        ctx.fillText(`CHOAM ${((1 - lambda) * 100).toFixed(0)}%`, x0 + 16 + barW, baseY + 14);

        ctx.fillStyle = COLORS.spiceBright;
        ctx.font = 'bold 12px Orbitron, sans-serif';
        ctx.fillText(`Cᴴᴹ ${(derived.cF * 100).toFixed(0)}`, x0 + 8, baseY - fH - 8);
        ctx.fillText(`Cᴿ ${(derived.cR * 100).toFixed(0)}`, x0 + 16 + barW, baseY - rH - 8);

        const taylorY = y0 + 36;
        ctx.fillStyle = COLORS.guild;
        ctx.font = '10px "Share Tech Mono", monospace';
        const iPct = (derived.i * 100).toFixed(2);
        ctx.fillText(`GUILD-RATE i = ${iPct}%  (π* = ${ctrl.piTarget.toFixed(1)}%)`, x0, taylorY);
    }

    function draw() {
        ctx.clearRect(0, 0, w, h);

        const pad = 16;
        const topH = h * 0.42;
        const botY = pad + topH + 12;
        const botH = h - botY - pad;

        drawChart(pad, pad, w - pad * 2, topH, [history.y, history.pi], [COLORS.spiceBright, COLORS.guild], 'OUTPUT GAP y · SPICE-π');

        const agentW = w * 0.38;
        drawAgents(w - agentW - pad, botY, agentW, botH);

        const eqX = pad;
        const eqW = w - agentW - pad * 3;
        ctx.fillStyle = 'rgba(36, 18, 12, 0.5)';
        ctx.fillRect(eqX, botY, eqW, botH);

        const lines = [
            ['Fremen (HtM)', `c = w·n  →  cᴴᴹ = ${(derived.cF * 100).toFixed(1)}`],
            ['CHOAM (NK)', `c = mpc·(yᴿ+φB)  →  Cᴿ = ${(derived.cR * 100).toFixed(1)}`],
            ['Aggregat', `C = λ·cᴴᴹ + (1−λ)·cᴿ = ${(derived.cAgg * 100).toFixed(1)}`],
            ['IS (Arrakis)', `ẏ = −σ(i−r*) + ψG + ω·worm − θπ`],
            ['Phillips', `π = βπ + κy + ν·worm`],
            ['Taylor (Guild)', `i = r* + φπ(π−π*) + φy·y`],
            ['Obligasjoner', `Ḃ = (1−λ)(yᴿ−cᴿ)`],
        ];

        ctx.fillStyle = COLORS.spice;
        ctx.font = '11px "Share Tech Mono", monospace';
        ctx.fillText('ARRAKIS HANK — REDUSERT 2-TYPE', eqX + 10, botY + 18);

        let ly = botY + 36;
        lines.forEach(([title, eq]) => {
            ctx.fillStyle = COLORS.sand;
            ctx.font = 'bold 11px Rajdhani, sans-serif';
            ctx.fillText(title, eqX + 10, ly);
            ctx.fillStyle = COLORS.muted;
            ctx.font = '11px "Share Tech Mono", monospace';
            ctx.fillText(eq, eqX + 10, ly + 14);
            ly += 32;
        });
    }

    function tick(dt) {
        const ctrl = readControls();
        const steps = reducedMotion ? 1 : 3;
        const subDt = dt / steps;
        for (let i = 0; i < steps; i++) {
            derived = stepHank(state, ctrl, subDt);
            state = { y: derived.y, pi: derived.pi, b: derived.b };
        }
        pushHistory();
        updateHud();
        draw();
    }

    let last = performance.now();
    function loop(now) {
        if (!running) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        tick(reducedMotion ? 0.012 : 0.035);
        requestAnimationFrame(loop);
    }

    const resetBtn = document.getElementById('hank-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            state = { ...defaults };
            derived = stepHank(state, readControls(), 0);
            for (const key of Object.keys(history)) history[key].length = 0;
            pushHistory();
            updateHud();
            draw();
        });
    }

    document.getElementById('hank-pause')?.addEventListener('click', () => {
        running = !running;
        if (running) {
            last = performance.now();
            requestAnimationFrame(loop);
        }
    });

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting && running) {
                    last = performance.now();
                    requestAnimationFrame(loop);
                }
            });
        },
        { threshold: 0.15 }
    );
    observer.observe(section);

    resize();
    pushHistory();
    updateHud();
    draw();
    requestAnimationFrame(loop);

    let resizeTO;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTO);
        resizeTO = setTimeout(() => {
            resize();
            draw();
        }, 120);
    });
}

function bindSlider(id, labelId, fmt) {
    const el = document.getElementById(id);
    const label = document.getElementById(labelId);
    const obj = {
        get value() {
            return Number(el?.value ?? 0);
        },
    };
    const update = () => {
        if (label) label.textContent = fmt(obj.value);
    };
    el?.addEventListener('input', update);
    update();
    return obj;
}

initHank();
