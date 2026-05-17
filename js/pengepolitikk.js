/**
 * Pengepolitikk spesial — redusert NK-modell (Taylor, Phillips, frontfag)
 */
const PP_COLORS = {
    accent: '#ffc857',
    accentDim: 'rgba(255, 154, 60, 0.55)',
    bank: '#e85d5d',
    grid: 'rgba(255, 154, 60, 0.1)',
    text: '#fbe4cf',
    muted: 'rgba(200, 168, 144, 0.65)',
    phillips: '#ff9a3c',
    taylor: '#e85d5d',
};

const PP_PARAMS = {
    beta: 0.98,
    kappa: 0.28,
    psiPi: 1.6,
    psiY: 0.12,
    sigmaIS: 0.88,
    nairu: 0.038,
    historyLen: 140,
};

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function taylorInflationGap(pi, ctrl) {
    if (ctrl.piBand) {
        if (pi > 0.03) return pi - 0.03;
        if (pi < 0.01) return pi - 0.01;
        return 0;
    }
    return pi - ctrl.piTarget / 100;
}

function stepPp(state, ctrl, dt) {
    const rStar = ctrl.rate / 100;
    const piStar = ctrl.piTarget / 100;
    const { y, pi } = state;

    const piGapTaylor = taylorInflationGap(pi, ctrl);
    const i = rStar + PP_PARAMS.psiPi * piGapTaylor + PP_PARAMS.psiY * y;

    const demand = ctrl.demandShock / 100;
    const wagePush = ctrl.frontfag ? (ctrl.wageShock / 100) * 0.45 : 0;

    const dy =
        -PP_PARAMS.sigmaIS * (i - rStar) +
        demand * 0.55 -
        (ctrl.frontfag ? 0.06 * wagePush : 0);

    const dpi =
        PP_PARAMS.beta * (pi - piStar) +
        PP_PARAMS.kappa * y +
        wagePush * 0.35 +
        demand * 0.08;

    const u = clamp(PP_PARAMS.nairu - 0.38 * y, 0.01, 0.14);

    return {
        y: y + dy * dt,
        pi: pi + dpi * dt,
        i,
        u,
        piGapTaylor,
    };
}

function ppStatus(y, pi, u, ctrl, derived) {
    if (ctrl.demandShock > 70) return 'ETTERSPØRSELSSJOKK — BNP OVER POTENSIAL';
    if (ctrl.wageShock > 60 && ctrl.frontfag) return 'FRONTFAG-SPENNING — LØNN PRESSER π OG U';
    if (derived.piGapTaylor === 0 && ctrl.piBand && pi >= 0.01 && pi <= 0.03) {
        return 'π INNEN 1–3 % — TAYLOR REAGERER IKKE PÅ INFLASJON';
    }
    if (pi > 0.045) return 'INFLASJON OVER MÅL — NORGES BANK STRAMMER';
    if (pi < 0.005) return 'SVAK PRISVEKST — BANKEN LØSNER';
    if (u > PP_PARAMS.nairu + 0.02) return 'LEDIGHET OVER NAIRU — LØNNSKURVE';
    if (y > 0.06) return 'POSITIVT OUTPUT GAP — OVEROPPHETET';
    if (y < -0.05) return 'RESSESJON — OUTPUT UNDER POTENSIAL';
    if (Math.abs(y) < 0.02 && Math.abs(pi - ctrl.piTarget / 100) < 0.008) {
        return 'LIKEVEKT — STYRING OG PRISSTABILITET';
    }
    return 'TRANSISJON — MODELLEN TILPASSER SEG';
}

function bindSlider(id, valId, fmt) {
    const input = document.getElementById(id);
    const valEl = document.getElementById(valId);
    if (!input || !valEl) return null;
    const update = () => {
        valEl.textContent = fmt(Number(input.value));
    };
    input.addEventListener('input', update);
    update();
    return input;
}

function initPengepolitikk() {
    const main = document.getElementById('pp');
    const canvas = document.getElementById('pp-canvas');
    const phCanvas = document.getElementById('pp-phillips-canvas');
    if (!main || !canvas || !phCanvas) return;

    const hud = {
        y: document.getElementById('pp-y'),
        pi: document.getElementById('pp-pi'),
        i: document.getElementById('pp-i'),
        u: document.getElementById('pp-u'),
        status: document.getElementById('pp-status'),
    };

    const sliders = {
        rate: bindSlider('pp-rate', 'pp-rate-val', (v) => `${(v / 10).toFixed(1)}%`),
        piTarget: bindSlider('pp-pi-target', 'pp-pi-target-val', (v) => `${(v / 10).toFixed(1)}%`),
        demandShock: bindSlider('pp-demand', 'pp-demand-val', (v) => `${v}%`),
        wageShock: bindSlider('pp-wage-shock', 'pp-wage-shock-val', (v) => `${v}%`),
    };

    const frontfagToggle = document.getElementById('pp-frontfag');
    const piBandToggle = document.getElementById('pp-pi-band');
    const frontfagFieldset = document.getElementById('pp-frontfag-fields');

    function readControls() {
        return {
            rate: Number(sliders.rate?.value ?? 45),
            piTarget: Number(sliders.piTarget?.value ?? 20),
            demandShock: Number(sliders.demandShock?.value ?? 0),
            wageShock: Number(sliders.wageShock?.value ?? 0),
            frontfag: Boolean(frontfagToggle?.checked),
            piBand: Boolean(piBandToggle?.checked),
        };
    }

    function syncFrontfagUi(ctrl) {
        if (frontfagFieldset) {
            frontfagFieldset.classList.toggle('pp-fieldset--off', !ctrl.frontfag);
        }
    }

    let state = { y: 0, pi: 0.02 };
    const history = { y: [], pi: [], i: [] };
    let derived = stepPp(state, readControls(), 0);
    let paused = false;
    let backeImpulse = 0;

    const ctx = canvas.getContext('2d');
    const phCtx = phCanvas.getContext('2d');

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        for (const [el, c] of [[canvas, ctx], [phCanvas, phCtx]]) {
            const rect = el.getBoundingClientRect();
            el.width = Math.floor(rect.width * dpr);
            el.height = Math.floor(rect.height * dpr);
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    }

    function drawPhillips(ctrl) {
        const w = phCanvas.clientWidth;
        const h = phCanvas.clientHeight;
        phCtx.clearRect(0, 0, w, h);

        const pad = { l: 48, r: 16, t: 20, b: 36 };
        const plotW = w - pad.l - pad.r;
        const plotH = h - pad.t - pad.b;

        phCtx.strokeStyle = PP_COLORS.grid;
        phCtx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const x = pad.l + (plotW * i) / 4;
            const y = pad.t + (plotH * i) / 4;
            phCtx.beginPath();
            phCtx.moveTo(x, pad.t);
            phCtx.lineTo(x, pad.t + plotH);
            phCtx.moveTo(pad.l, y);
            phCtx.lineTo(pad.l + plotW, y);
            phCtx.stroke();
        }

        const uMin = 0.02;
        const uMax = 0.1;
        const piMin = -0.01;
        const piMax = 0.07;

        const toX = (u) => pad.l + ((u - uMin) / (uMax - uMin)) * plotW;
        const toY = (pi) => pad.t + plotH - ((pi - piMin) / (piMax - piMin)) * plotH;

        phCtx.strokeStyle = PP_COLORS.phillips;
        phCtx.lineWidth = 2;
        phCtx.beginPath();
        for (let u = uMin; u <= uMax; u += 0.002) {
            const yGap = (PP_PARAMS.nairu - u) / 0.38;
            let piCurve = 0.02 + PP_PARAMS.kappa * yGap;
            if (ctrl.frontfag) piCurve += (ctrl.wageShock / 100) * 0.012;
            const px = toX(u);
            const py = toY(piCurve);
            if (u === uMin) phCtx.moveTo(px, py);
            else phCtx.lineTo(px, py);
        }
        phCtx.stroke();

        phCtx.setLineDash([4, 4]);
        phCtx.strokeStyle = PP_COLORS.muted;
        phCtx.beginPath();
        phCtx.moveTo(toX(PP_PARAMS.nairu), pad.t);
        phCtx.lineTo(toX(PP_PARAMS.nairu), pad.t + plotH);
        phCtx.stroke();
        phCtx.setLineDash([]);

        phCtx.fillStyle = PP_COLORS.accent;
        phCtx.beginPath();
        phCtx.arc(toX(derived.u), toY(state.pi), 6, 0, Math.PI * 2);
        phCtx.fill();

        phCtx.fillStyle = PP_COLORS.muted;
        phCtx.font = '10px Share Tech Mono, monospace';
        phCtx.fillText('U', pad.l - 28, pad.t + plotH + 4);
        phCtx.fillText('π', pad.l + plotW + 4, pad.t + 12);
        phCtx.fillText(`NAIRU ${(PP_PARAMS.nairu * 100).toFixed(1)}%`, toX(PP_PARAMS.nairu) + 4, pad.t + 14);

        const title = ctrl.frontfag ? 'Lønnskurve / Phillips (frontfag)' : 'Phillips (Okun)';
        phCtx.fillStyle = PP_COLORS.text;
        phCtx.font = '11px Share Tech Mono, monospace';
        phCtx.fillText(title, pad.l, pad.t - 4);
    }

    function drawSeries(ctrl) {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        ctx.clearRect(0, 0, w, h);

        const pad = { l: 44, r: 12, t: 24, b: 32 };
        const plotW = w - pad.l - pad.r;
        const plotH = h - pad.t - pad.b;

        ctx.strokeStyle = PP_COLORS.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.l, pad.t + plotH / 2);
        ctx.lineTo(pad.l + plotW, pad.t + plotH / 2);
        ctx.stroke();

        const n = history.y.length;
        if (n < 2) return;

        const yMin = -0.08;
        const yMax = 0.08;
        const piMin = -0.01;
        const piMax = 0.07;

        const toX = (i) => pad.l + (i / (PP_PARAMS.historyLen - 1)) * plotW;
        const toYy = (v) => pad.t + plotH / 2 - (v / (yMax - yMin)) * plotH;
        const toYpi = (v) => pad.t + plotH - ((v - piMin) / (piMax - piMin)) * plotH;

        function strokeSeries(data, color, toY) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            data.forEach((v, i) => {
                const px = toX(i);
                const py = toY(v);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.stroke();
        }

        strokeSeries(history.y, PP_COLORS.accent, toYy);
        strokeSeries(history.pi, PP_COLORS.phillips, toYpi);
        strokeSeries(
            history.i.map((v) => v - ctrl.rate / 100),
            PP_COLORS.taylor,
            toYy,
        );

        ctx.fillStyle = PP_COLORS.muted;
        ctx.font = '10px Share Tech Mono, monospace';
        ctx.fillText('y (gap)', pad.l, pad.t - 6);
        ctx.fillText('π', pad.l + plotW - 16, pad.t - 6);
        ctx.fillText('i−r*', pad.l + plotW - 36, pad.t + 10);

        const eqX = pad.l + 8;
        const eqY = pad.t + plotH - 52;
        ctx.fillStyle = PP_COLORS.text;
        ctx.font = '10px Share Tech Mono, monospace';
        ctx.fillText(`i = r* + ${PP_PARAMS.psiPi}·(π−π*) + ${PP_PARAMS.psiY}·y`, eqX, eqY);
        if (ctrl.piBand) {
            ctx.fillStyle = PP_COLORS.muted;
            ctx.fillText('π*: intervall 1–3 % (ingen respons innenfor)', eqX, eqY + 14);
        }
    }

    function pushHistory() {
        history.y.push(state.y);
        history.pi.push(state.pi);
        history.i.push(derived.i);
        if (history.y.length > PP_PARAMS.historyLen) {
            history.y.shift();
            history.pi.shift();
            history.i.shift();
        }
    }

    function updateHud(ctrl) {
        if (hud.y) hud.y.textContent = `${(state.y * 100).toFixed(1)}%`;
        if (hud.pi) hud.pi.textContent = `${(state.pi * 100).toFixed(2)}%`;
        if (hud.i) hud.i.textContent = `${(derived.i * 100).toFixed(2)}%`;
        if (hud.u) hud.u.textContent = `${(derived.u * 100).toFixed(1)}%`;
        if (hud.status) hud.status.textContent = ppStatus(state.y, state.pi, derived.u, ctrl, derived);
    }

    let last = performance.now();
    function tick(now) {
        const ctrl = readControls();
        syncFrontfagUi(ctrl);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        if (!paused) {
            if (backeImpulse > 0) {
                sliders.rate.value = String(Number(sliders.rate.value) + 10);
                sliders.rate.dispatchEvent(new Event('input'));
                backeImpulse = 0;
            }
            const subSteps = 4;
            const subDt = dt / subSteps;
            for (let s = 0; s < subSteps; s++) {
                derived = stepPp(state, ctrl, subDt);
                state = { y: derived.y, pi: derived.pi };
            }
            pushHistory();
        }

        updateHud(ctrl);
        drawPhillips(ctrl);
        drawSeries(ctrl);
        requestAnimationFrame(tick);
    }

    document.getElementById('pp-backe')?.addEventListener('click', () => {
        backeImpulse = 1;
    });

    document.getElementById('pp-reset')?.addEventListener('click', () => {
        state = { y: 0, pi: 0.02 };
        history.y.length = 0;
        history.pi.length = 0;
        history.i.length = 0;
        derived = stepPp(state, readControls(), 0);
        if (sliders.rate) sliders.rate.value = '45';
        if (sliders.piTarget) sliders.piTarget.value = '20';
        if (sliders.demandShock) sliders.demandShock.value = '0';
        if (sliders.wageShock) sliders.wageShock.value = '0';
        if (frontfagToggle) frontfagToggle.checked = true;
        if (piBandToggle) piBandToggle.checked = false;
        Object.values(sliders).forEach((el) => el?.dispatchEvent(new Event('input')));
    });

    document.getElementById('pp-pause')?.addEventListener('click', () => {
        paused = !paused;
    });

    [frontfagToggle, piBandToggle, ...Object.values(sliders)].forEach((el) => {
        el?.addEventListener('input', () => syncFrontfagUi(readControls()));
        el?.addEventListener('change', () => syncFrontfagUi(readControls()));
    });

    window.addEventListener('resize', resize);
    resize();
    syncFrontfagUi(readControls());
    pushHistory();
    requestAnimationFrame(tick);
}

initPengepolitikk();
