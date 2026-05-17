/**
 * NORA — pedagogisk forkortelse av SSBs modell (NOT 2024/4).
 * Fig. 2.1: husholdninger (ω likviditetsbegrensede, 1−ω Ricardianske), bank,
 * slutt-/mellomvarer, utland, olje-I, GPFG, sentralbank (Taylor, likn. 2.51).
 */
const NORA_COLORS = {
    mainland: '#5eb8e8',
    mainlandBright: '#8fd4ff',
    fiscal: '#e85d5d',
    fiscalBright: '#ff8a8a',
    bank: '#6bc9a8',
    oil: '#d4a84b',
    foreign: '#9b8ec4',
    grid: 'rgba(143, 212, 255, 0.12)',
    text: '#e8f4fc',
    muted: 'rgba(180, 210, 230, 0.65)',
    box: 'rgba(12, 28, 42, 0.92)',
    boxBorder: 'rgba(94, 184, 232, 0.45)',
};

/** Estimerte Taylor-koeffisienter (tab. 3.2, NOT 2024/4) */
const NORA_PARAMS = {
    beta: 0.99,
    kappa: 0.28,
    psiPi: 1.59,
    psiY: 0.12,
    rhoR: 0.8,
    sigmaIS: 0.75,
    nairu: 0.038,
    /** Tidsserie: vindu 0…40 kvartaler (som fig. 4.1). */
    historyQuarters: 41,
    quarterDt: 0.25,
    /** Simuleringshastighet — kvartaler per sekund (uavhengig av FPS). */
    quartersPerSecond: 3,
    yPot: 1,
};

/** Backe-sjokket — eksogent pengepolitisk sjokk Z^R (NOT § 4.1.1; θ_R ≈ 0,41) */
const NORA_BACKE_SHOCK = {
    thetaR: 0.41,
    sizePp: 0.01,
    irfQuarters: 41,
};

/** Fig. 4.1 — impulsresponser (NOT 2024/4 s. 62–63) */
const IRF_MP_SERIES = [
    { key: 'y', label: 'Fastlands-BNP', unit: 'pct', color: NORA_COLORS.mainlandBright },
    { key: 'c', label: 'Forbruk', unit: 'pct', color: NORA_COLORS.fiscalBright },
    { key: 'i', label: 'Investering', unit: 'pct', color: NORA_COLORS.bank },
    { key: 'x', label: 'Eksport', unit: 'pct', color: NORA_COLORS.foreign },
    { key: 'm', label: 'Import', unit: 'pct', color: '#b8a8e8' },
    { key: 'emp', label: 'Sysselsettingsgrad', unit: 'pp', color: NORA_COLORS.mainland },
    { key: 'u', label: 'Ledighet', unit: 'pp', color: NORA_COLORS.fiscal },
    { key: 'w', label: 'Reallønn', unit: 'pct', color: NORA_COLORS.oil },
    { key: 'pi', label: 'Årlig inflasjon', unit: 'pp', color: '#ff9a9a' },
    { key: 'r', label: 'Styringsrente', unit: 'pp', color: '#6bc9a8' },
    { key: 'rer', label: 'Real valutakurs', unit: 'pct', color: '#9b8ec4' },
    { key: 'piMfg', label: 'Profitt · industri', unit: 'pct', color: '#d4a84b' },
];

/** Inflasjonsmål som intervall (Norges Bank / KPI-bånd, forenklet) */
const PI_BAND = { lo: 0.01, hi: 0.03, mid: 0.02 };

/**
 * Backe-sjokket — glidebrytere ved eksogent pengepolitisk stramming (+1 pp rente, NOT § 4.1.1).
 * policyRate: 45 → 55 tilsvarer 4,5 % → 5,5 % (verdi / 10).
 */
const BACKE_SHOCK = {
    omegaShare: 38,
    policyRate: 55,
    piTarget: 20,
    govG: 22,
    govI: 12,
    oilShock: 50,
    gpfgRule: 35,
    fiscalShock: 0,
    foreignRp: 22,
    wageStick: 75,
    wageShock: 0,
};

/** Pedagogisk sokkelsjokk — Godzilla ved Troll-feltet (glidebryterverdier 0–100). */
const GODZILLA_TROLL_SHOCK = {
    oilShock: 8,
    gpfgRule: 18,
    fiscalShock: 62,
    foreignRp: 60,
    policyRate: 32,
    govG: 28,
    govI: 14,
    omegaShare: 38,
    wageStick: 75,
    wageShock: 0,
};

/** Standardverdier for glidebrytere (matcher nora.html). */
const NORA_SLIDER_DEFAULTS = {
    omegaShare: 38,
    policyRate: 45,
    piTarget: 20,
    govG: 22,
    govI: 12,
    oilShock: 50,
    gpfgRule: 35,
    fiscalShock: 0,
    foreignRp: 25,
    wageStick: 75,
    wageShock: 0,
};

/** π-avvik i Taylor-regelen: punktmål eller kun utenfor 1–3 %. */
function taylorInflationGap(pi, ctrl) {
    if (ctrl.piBand) {
        if (pi > PI_BAND.hi) return pi - PI_BAND.hi;
        if (pi < PI_BAND.lo) return pi - PI_BAND.lo;
        return 0;
    }
    return pi - Math.max(0.005, ctrl.piTarget / 100);
}

/** π-avvik i Phillips (senter 2 % ved bånd, ellers punktmål). */
function phillipsInflationGap(pi, ctrl) {
    const piStar = ctrl.piBand ? PI_BAND.mid : Math.max(0.005, ctrl.piTarget / 100);
    return pi - piStar;
}

/** Arbeidsmarked — forenklet kap. 2.3–2.4 (lønnskurve + frontfag) */
const LABOR = {
    Lf_ss: 0.71,
    E_ss: 0.683,
    W_ss: 1,
    nuU: 0.11,
    phiPiM: 0.09,
    rhoE: 0.82,
    rhoLf: 0.9,
    psiW: 0.07,
    psiU: 0.14,
    etaN: 0.38,
    alphaN: 0.42,
};

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

/**
 * Arbeidsmarked med frontfag: Nash-lønn i industri → treg W, lønnskurve, etterspørsel N^d.
 * Uten frontfag: fleksibel lønn og Okun-lignende ledighet (klassisk reduksjon).
 */
function stepLaborMarket(labor, ctrl, macro, dt) {
    const { y, mfg, Y } = macro;
    const uSS = NORA_PARAMS.nairu;
    let { W, E, Lf } = labor;

    if (!ctrl.frontfag) {
        const u = clamp(uSS - 0.28 * y, 0.015, 0.12);
        W = LABOR.W_ss * (1 + 0.35 * y);
        E = LABOR.E_ss * (1 + 0.32 * y);
        Lf = LABOR.Lf_ss;
        return {
            W,
            E: clamp(E, 0.55, 0.78),
            Lf,
            u,
            Wnb: W,
            Nd: E,
            wageBill: 0.58 * W,
            mode: 'flex',
        };
    }

    const uPrev = clamp((Lf - E) / Math.max(0.05, Lf), 0.012, 0.18);
    const yM = mfg / Math.max(0.2, 0.36 * Y);
    const piM = yM - 1 + 0.1 * y;
    const rhoW = ctrl.wageStick / 100;
    const zV = ctrl.wageShock / 100;

    const logWnb = -LABOR.nuU * Math.log(uPrev / uSS) + LABOR.phiPiM * piM + zV * 0.045;
    const Wnb = Math.exp(clamp(logWnb, -0.14, 0.14));
    const Wnew = clamp(rhoW * W + (1 - rhoW) * Wnb, 0.86, 1.14);

    const Nd =
        LABOR.E_ss *
        Math.pow(Math.max(0.55, yM), LABOR.alphaN) *
        Math.pow(Wnew / LABOR.W_ss, -LABOR.etaN);
    const Enew = clamp(LABOR.rhoE * E + (1 - LABOR.rhoE) * Nd, 0.55, 0.78);
    const Lfnew = clamp(
        LABOR.rhoLf * Lf + (1 - LABOR.rhoLf) * (LABOR.Lf_ss + LABOR.psiW * (Wnew - 1) - LABOR.psiU * uPrev),
        0.62,
        0.78,
    );
    const u = clamp((Lfnew - Enew) / Math.max(0.05, Lfnew), 0.012, 0.18);

    return {
        W: Wnew,
        E: Enew,
        Lf: Lfnew,
        u,
        Wnb,
        Nd,
        wageBill: 0.58 * Wnew,
        mode: 'frontfag',
    };
}

/**
 * Ett tidssteg — forenklet NORA-lignende system.
 * y: output gap fastland, pi: KPI-inflasjon, L: firmalån, D: innskudd,
 * F: netto utenlandsgjeld bank, Gb: offentlig saldo (relativ).
 * W, E, Lf: reallønn, sysselsetting, arbeidsstyrke (frontfag-blokk).
 */
function stepNora(state, ctrl, dt) {
    const omega = ctrl.omegaShare / 100;
    const ricardian = 1 - omega;

    const rTarget = ctrl.policyRate / 100;
    const gShare = ctrl.govG / 100;
    const giShare = ctrl.govI / 100;
    const oilInv = ctrl.oilShock / 100;
    const gpfg = ctrl.gpfgRule / 100;
    const fiscalShock = ctrl.fiscalShock / 100;
    const rpShock = ctrl.foreignRp / 100;

    const { y, pi, L, D, F, Gb, Rprev, W, E, Lf, zR = 0, rer = 0 } = state;

    const piGapTaylor = taylorInflationGap(pi, ctrl);
    const piGapPhillips = phillipsInflationGap(pi, ctrl);
    const yGap = clamp(y, -0.25, 0.25);

    const Rtarget = rTarget + NORA_PARAMS.psiPi * piGapTaylor + NORA_PARAMS.psiY * yGap + zR;
    const Rnew = clamp(
        Rprev * NORA_PARAMS.rhoR + (1 - NORA_PARAMS.rhoR) * Rtarget,
        0.001,
        0.2,
    );
    const zRnew = zR * NORA_BACKE_SHOCK.thetaR;
    const rerNew = clamp(rer + (0.95 * (Rnew - rTarget) + 0.28 * zR - 0.14 * rer) * dt, -0.06, 0.06);

    const gpfgSpend = gpfg * 0.16;
    const fiscal = gShare * 0.32 + giShare * 0.22 + gpfgSpend + fiscalShock * 0.25;
    const rp = 0.02 + rpShock * 0.04 - oilInv * 0.004;

    const Y = NORA_PARAMS.yPot * (1 + y);
    const mfg = 0.36 * Y;
    const serv = 0.64 * Y;

    const labor = stepLaborMarket({ W, E, Lf }, ctrl, { y, mfg, Y }, dt);
    const empGap = labor.E / LABOR.E_ss - 1;
    const laborDy = ctrl.frontfag ? 0.22 * empGap - 0.08 * (labor.W - 1) : 0;
    const laborDpi = ctrl.frontfag ? 0.1 * (labor.W - 1) + 0.06 * empGap : 0;

    const dy =
        -NORA_PARAMS.sigmaIS * (Rnew - rTarget) -
        0.42 * zR -
        0.18 * rer +
        fiscal * 0.38 +
        oilInv * 0.08 -
        rp * 1.8 * F -
        0.12 * yGap +
        laborDy;

    const dpi =
        NORA_PARAMS.kappa * yGap +
        fiscal * 0.018 +
        fiscalShock * 0.025 -
        (1 - NORA_PARAMS.beta) * piGapPhillips +
        laborDpi -
        0.08 * rer -
        0.035 * zR;

    const wageBill = labor.wageBill;
    const transfers = gShare * 0.1 + gpfgSpend * 0.4;
    const benefits = Math.max(0, labor.u - NORA_PARAMS.nairu) * 0.35;
    const dividends = ricardian * (0.11 + 0.14 * y);
    const taxRate = 0.32;

    const incomeL = wageBill + transfers + benefits;
    const incomeR = wageBill * ricardian + dividends + transfers * ricardian;
    const cL = incomeL * (1 - taxRate);
    const cR =
        incomeR * (1 - taxRate) * (0.72 - 0.28 * Math.max(0, Rnew - rTarget) - 0.18 * zR);
    const cAgg = omega * cL + ricardian * cR;

    const iOil = oilInv * 0.1;
    const iPriv =
        (0.22 - 0.4 * Math.max(0, Rnew - rTarget) - 0.85 * zR) * (1 + 0.25 * y);
    const iGov = giShare * 0.16;
    const iTotal = Math.max(0, iPriv + iGov + iOil);

    const gCons = gShare * 0.2;
    const xGoods = 0.31 * Y * (1 + 0.12 * y - 0.72 * rer);
    const mGoods = 0.3 * Y * (1 + 0.08 * y - 0.48 * rer);

    const saving = ricardian * Math.max(0, incomeR * (1 - taxRate) - cR);
    const dL = (iPriv * 0.85 - 0.12 * L) * dt * 2.2;
    const dD = (saving - 0.08 * D) * dt * 1.8;
    const dF = (mGoods - xGoods) * 0.12 * dt + rpShock * 0.06 * dt;
    const dGb = (wageBill * taxRate + gpfgSpend - gCons - iGov - transfers - benefits) * dt * 1.6;

    const spread = omega > 0.05 ? (cR / ricardian - cL / omega) / Math.max(0.05, cAgg) : 0;
    const u = labor.u;
    const yMrel = mfg / Math.max(0.2, 0.36 * Y);
    const piMfgProf = yMrel - 1 + 0.08 * y - 0.42 * rer - 0.22 * (labor.W - 1) - 0.18 * (u - NORA_PARAMS.nairu);

    const flows = {
        cAgg,
        cL,
        cR,
        iTotal,
        gCons,
        xGoods,
        mGoods,
        mfg,
        serv,
        gpfgSpend,
        iOil,
        firmBorrow: iPriv * 2.2,
        deposits: D,
        foreignBorrow: rpShock * 0.5,
        W: labor.W,
        Wnb: labor.Wnb,
    };

    const yNext = clamp(y + dy * dt, -0.2, 0.2);
    const piNext = clamp(pi + dpi * dt, -0.01, 0.1);

    if (!Number.isFinite(yNext) || !Number.isFinite(piNext)) {
        return stepNora(
            {
                y: 0,
                pi: ctrl.piBand ? PI_BAND.mid : Math.max(0.005, ctrl.piTarget / 100),
                L: 0.55,
                D: 0.45,
                F: 0.35,
                Gb: 0.1,
                Rprev: rTarget,
                W: 1,
                E: LABOR.E_ss,
                Lf: LABOR.Lf_ss,
                zR: 0,
                rer: 0,
            },
            ctrl,
            0,
        );
    }

    return {
        y: yNext,
        pi: piNext,
        L: clamp(L + dL, 0.1, 1.4),
        D: clamp(D + dD, 0.1, 1.2),
        F: clamp(F + dF, 0, 1.2),
        Gb: clamp(Gb + dGb, -0.5, 0.8),
        Rprev: Rnew,
        R: Rnew,
        zR: zRnew,
        rer: rerNew,
        spread,
        u,
        mainlandY: Y,
        flows,
        omega,
        ricardian,
        W: labor.W,
        E: labor.E,
        Lf: labor.Lf,
        Wnb: labor.Wnb,
        Nd: labor.Nd,
        laborMode: labor.mode,
        piMfgProf,
        xGoods,
        mGoods,
        iTotal,
        cAgg,
    };
}

/** Likevekt og referanse for IRF (§ 4.1.1). */
function noraSteadyState(ctrl) {
    const piSs = ctrl.piBand ? PI_BAND.mid : Math.max(0.005, ctrl.piTarget / 100);
    const rSs = ctrl.policyRate / 100;
    const base = {
        y: 0,
        pi: piSs,
        L: 0.55,
        D: 0.45,
        F: 0.35,
        Gb: 0.1,
        Rprev: rSs,
        W: 1,
        E: LABOR.E_ss,
        Lf: LABOR.Lf_ss,
        zR: 0,
        rer: 0,
    };
    const eq = stepNora(base, ctrl, 0);
    return {
        state: base,
        piSs,
        rSs,
        cSs: eq.flows.cAgg,
        iSs: eq.iTotal,
        xSs: eq.xGoods,
        mSs: eq.mGoods,
    };
}

/** Ett IRF-observasjonspunkt — pct / pp som i fig. 4.1. */
function snapshotMonetaryIrF(derived, ss) {
    return {
        y: derived.y * 100,
        c: ((derived.cAgg - ss.cSs) / Math.max(0.05, ss.cSs)) * 100,
        i: ((derived.iTotal - ss.iSs) / Math.max(0.05, ss.iSs)) * 100,
        x: ((derived.xGoods - ss.xSs) / Math.max(0.05, ss.xSs)) * 100,
        m: ((derived.mGoods - ss.mSs) / Math.max(0.05, ss.mSs)) * 100,
        emp: (derived.E - LABOR.E_ss) * 100,
        u: (derived.u - NORA_PARAMS.nairu) * 100,
        w: (derived.W - 1) * 100,
        pi: (derived.pi - ss.piSs) * 100,
        r: (derived.R - ss.rSs) * 100,
        rer: derived.rer * 100,
        piMfg: derived.piMfgProf * 100,
    };
}

/**
 * Simuler impulsresponser etter +1 pp i årlig nominell rente (§ 4.1.1, fig. 4.1).
 * Lineært kvartalssystem kalibrert mot NOT 2024/4 (BNP-trough ~−0,7 % ved Q3,
 * inflasjon ~−1,1 pp ved Q4, RER ~+2 % på impact).
 */
function simulateMonetaryPolicyIrF(_ctrl) {
    const Q = NORA_BACKE_SHOCK.irfQuarters;
    const th = NORA_BACKE_SHOCK.thetaR;
    const paths = Object.fromEntries(IRF_MP_SERIES.map((s) => [s.key, []]));

    let z = NORA_BACKE_SHOCK.sizePp;
    let y = 0;
    let pi = 0;
    let rer = 0.02;
    let rPp = 1;
    let c = 0;
    let i = 0;
    let x = 0;
    let m = 0;
    let emp = 0;
    let u = 0;
    let w = 0;
    let piMfg = 0;

    for (let t = 0; t <= Q; t++) {
        paths.y.push(y * 100);
        paths.c.push(c * 100);
        paths.i.push(i * 100);
        paths.x.push(x * 100);
        paths.m.push(m * 100);
        paths.emp.push(emp * 100);
        paths.u.push(u * 100);
        paths.w.push(w * 100);
        paths.pi.push(pi * 100);
        paths.r.push(rPp);
        paths.rer.push(rer * 100);
        paths.piMfg.push(piMfg * 100);
        if (t >= Q) break;

        const zNext = z * th;
        const rNext = rPp * 0.86 + z * 100 * 0.22;
        const rerNext = rer * 0.72 + 0.38 * z + 0.12 * (rPp / 100);
        const yNext = y * 0.81 - 0.24 * z - 0.12 * rer - 0.07 * (rPp / 100);
        const piNext = pi * 0.86 + 0.11 * yNext - 0.17 * rerNext - 0.07 * z;
        const cNext = c * 0.83 - 0.14 * z - 0.08 * (rPp / 100) + 0.05 * yNext;
        const iNext = i * 0.78 - 0.42 * z - 0.2 * (rPp / 100);
        const xNext = x * 0.7 - 0.22 * rerNext + 0.04 * yNext;
        const mNext = m * 0.76 - 0.16 * rerNext + 0.03 * yNext;
        const empNext = emp * 0.8 + 0.35 * yNext;
        const uNext = u * 0.8 - 0.38 * yNext;
        const wNext = w * 0.85 + 0.28 * yNext + 0.12 * uNext;
        const piMfgNext = piMfg * 0.75 + 0.45 * yNext - 0.35 * rerNext + 0.2 * uNext;

        z = zNext;
        rPp = rNext;
        rer = rerNext;
        y = yNext;
        pi = piNext;
        c = cNext;
        i = iNext;
        x = xNext;
        m = mNext;
        emp = empNext;
        u = uNext;
        w = wNext;
        piMfg = piMfgNext;
    }
    return paths;
}

function formatIrFTick(v) {
    const a = Math.abs(v);
    if (a >= 10) return v.toFixed(0);
    if (a >= 1) return v.toFixed(1);
    return v.toFixed(2);
}

/** Y-ticks som inkluderer 0 når responsen krysser likevekt. */
function irfYTicks(minV, maxV) {
    const ticks = new Set();
    if (minV <= 0 && maxV >= 0) ticks.add(0);
    ticks.add(minV);
    ticks.add(maxV);
    const mid = (minV + maxV) / 2;
    if (mid !== minV && mid !== maxV && mid !== 0) ticks.add(mid);
    return [...ticks].sort((a, b) => a - b);
}

function drawIrFMiniChart(ctx, w, h, series, paths) {
    const pad = { l: 40, r: 6, t: 18, b: 22 };
    const cw = w - pad.l - pad.r;
    const ch = h - pad.t - pad.b;
    const data = paths[series.key];
    if (!data?.length) return;

    const qMax = NORA_BACKE_SHOCK.irfQuarters;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8, 18, 28, 0.95)';
    ctx.fillRect(0, 0, w, h);

    let minV = Math.min(...data);
    let maxV = Math.max(...data);
    if (Math.abs(maxV - minV) < 1e-6) {
        minV -= 0.5;
        maxV += 0.5;
    }
    const margin = (maxV - minV) * 0.1 || 0.2;
    minV -= margin;
    maxV += margin;
    const range = maxV - minV || 1;
    const mapY = (v) => pad.t + ch - ((v - minV) / range) * ch;
    const mapX = (q) => pad.l + (q / qMax) * cw;

    ctx.font = '7px "Share Tech Mono", monospace';
    ctx.fillStyle = NORA_COLORS.muted;
    ctx.strokeStyle = 'rgba(143, 212, 255, 0.1)';
    ctx.lineWidth = 1;

    irfYTicks(minV, maxV).forEach((tick) => {
        const gy = mapY(tick);
        if (gy < pad.t - 2 || gy > pad.t + ch + 2) return;
        ctx.beginPath();
        ctx.moveTo(pad.l, gy);
        ctx.lineTo(pad.l + cw, gy);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(formatIrFTick(tick), pad.l - 3, gy + 3);
    });
    ctx.textAlign = 'left';

    for (let q = 0; q <= qMax; q += 10) {
        const x = mapX(q);
        ctx.strokeStyle = 'rgba(143, 212, 255, 0.08)';
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + ch);
        ctx.stroke();
        ctx.fillStyle = NORA_COLORS.muted;
        ctx.textAlign = 'center';
        ctx.fillText(String(q), x, pad.t + ch + 12);
    }
    ctx.textAlign = 'left';

    const zeroY = mapY(0);
    if (zeroY >= pad.t && zeroY <= pad.t + ch) {
        ctx.strokeStyle = 'rgba(180, 210, 230, 0.3)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pad.l, zeroY);
        ctx.lineTo(pad.l + cw, zeroY);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.strokeStyle = series.color;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    data.forEach((v, i) => {
        const x = mapX(i);
        const y = mapY(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = NORA_COLORS.text;
    ctx.font = '600 10px Rajdhani, sans-serif';
    ctx.fillText(series.label, pad.l, 12);
    ctx.fillStyle = NORA_COLORS.muted;
    ctx.font = '7px "Share Tech Mono", monospace';
    const unitLbl = series.unit === 'pp' ? 'pp' : '%';
    ctx.textAlign = 'right';
    ctx.fillText(unitLbl, pad.l + cw, 12);
    ctx.textAlign = 'left';
}

function openBackeIrFPanel(paths) {
    let panel = document.getElementById('nora-irf-backe');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'nora-irf-backe';
        panel.className = 'nora-irf-mp';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'nora-irf-backe-title');
        document.body.appendChild(panel);
    }

    panel.innerHTML = `
        <div class="nora-irf-mp__backdrop" data-irf-close></div>
        <div class="nora-irf-mp__sheet">
            <header class="nora-irf-mp__head">
                <div>
                    <p class="nora-irf-mp__tag">Backe-sjokket · NOT 2024/4 § 4.1.1 · fig. 4.1</p>
                    <h2 id="nora-irf-backe-title">Backe-sjokket</h2>
                    <p class="nora-irf-mp__lead">
                        Hva skjer om sentralbanksjefene påfører Norge et eksogent sjokk — +1 prosentpoeng
                        i årlig nominell styringsrente? Impulsresponser over 40 kvartaler (pedagogisk NORA).
                    </p>
                </div>
                <button type="button" class="nora-irf-mp__close" data-irf-close aria-label="Lukk">×</button>
            </header>
            <div class="nora-irf-mp__grid" id="nora-irf-mp-grid"></div>
            <p class="nora-irf-mp__note">
                «pct» = prosent avvik fra likevekt; «pp» = prosentpoeng. Kilde:
                <a href="Nora/NOT2024-04.pdf" target="_blank" rel="noopener">SSB NOT 2024/4</a> s. 62–63.
            </p>
        </div>
    `;

    const grid = panel.querySelector('#nora-irf-mp-grid');
    grid.innerHTML = '';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    IRF_MP_SERIES.forEach((series) => {
        const cell = document.createElement('div');
        cell.className = 'nora-irf-mp__cell';
        const canvas = document.createElement('canvas');
        canvas.width = 300 * dpr;
        canvas.height = 136 * dpr;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        cell.appendChild(canvas);
        grid.appendChild(cell);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawIrFMiniChart(ctx, 300, 136, series, paths);
    });

    const close = () => {
        panel.classList.remove('is-open');
        document.body.classList.remove('nora-irf-open');
    };
    panel.querySelectorAll('[data-irf-close]').forEach((el) => {
        el.addEventListener('click', close, { once: true });
    });
    panel.addEventListener(
        'keydown',
        (ev) => {
            if (ev.key === 'Escape') close();
        },
        { once: true },
    );

    panel.classList.add('is-open');
    document.body.classList.add('nora-irf-open');
    panel.querySelector('.nora-irf-mp__close')?.focus();
}

function noraStatus(derived, ctrl) {
    if (ctrl.scenarioBacke) {
        if (derived.y < -0.005) return 'BACKE-SJOKKET — STRAMMING: FASTLANDS-BNP FALLER';
        if (derived.pi < (ctrl.piBand ? PI_BAND.mid : ctrl.piTarget / 100) - 0.004) {
            return 'BACKE-SJOKKET — INFLASJON FALLER · REAL RENTE OPP';
        }
        return 'BACKE-SJOKKET — EKSOGENT +1 PP FRA SENTRALBANKEN';
    }
    if (ctrl.scenarioGodzilla) {
        if (derived.y < -0.04) return 'GODZILLA / TROLL — FASTLAND I RESSESJON (SOKKEL-SJOKK)';
        if (derived.u > NORA_PARAMS.nairu + 0.02) return 'GODZILLA / TROLL — LEDIGHET STIGER (LEVERANDØRER)';
        return 'GODZILLA / TROLL — SOKKEL-SJOKK · KRISEPAKKE · HØY RP';
    }
    if (!ctrl.frontfag) return 'FLEKSIBEL LØNN — LEDIGHET FØLGER BNP (UTEN FRONTFAG)';
    if (derived.W > 1.04 && derived.u > NORA_PARAMS.nairu + 0.015) {
        return 'FRONTFAG-SPENNING — HØY LØNN OG LEDIGHET';
    }
    if (ctrl.oilShock > 70) return 'HØY OLJE-I — ETTERSPØRSEL ETTER FASTLANDS-VARER';
    if (ctrl.piBand) {
        if (derived.pi > PI_BAND.hi + 0.005) return 'KPI OVER 3 % — SENTRALBANK STRAMMER';
        if (derived.pi < PI_BAND.lo - 0.003) return 'KPI UNDER 1 % — RENTE SENKES';
        if (derived.pi >= PI_BAND.lo && derived.pi <= PI_BAND.hi && Math.abs(derived.y) < 0.03) {
            return 'π INNEN MÅLBÅND 1–3 % — TAYLOR REAGERER IKKE PÅ π';
        }
    } else {
        if (derived.pi > ctrl.piTarget / 100 + 0.035) return 'KPI OVER MÅL — SENTRALBANK STRAMMER';
        if (derived.pi < ctrl.piTarget / 100 - 0.015) return 'KPI UNDER MÅL — RENTE SENKES';
    }
    if (derived.pi < 0.005) return 'SVÆRT LAV INFLASJON — RENTE SENKES';
    if (derived.spread > 0.3) return 'RICARDIANSK DOMINANS — C^R OVER C^L';
    if (derived.spread < -0.15) return 'ω HØY — LIKVIDITETSBEGRENSEDE DRIVER C';
    if (derived.u > 0.07) return 'LØNNSKURVE — LEDIGHET OVER NAIRU';
    if (derived.F > 0.85) return 'BANK LÅNER MYE I UTLANDET';
    const piEq = ctrl.piBand ? PI_BAND.mid : ctrl.piTarget / 100;
    if (Math.abs(derived.y) < 0.02 && Math.abs(derived.pi - piEq) < 0.006) {
        return 'FASTLANDSLIKEVEKT — NORA-STRUKTUR STABIL';
    }
    if (derived.y > 0.05) return 'POSITIVT OUTPUT GAP — ETTERSPØRSEL PRESS';
    if (derived.y < -0.05) return 'RESSESJON I FASTLANDSØKONOMIEN';
    return 'TRANSISJON — SECTORER TILPASSER SEG';
}

const DIAGRAM_NODES = [
    { id: 'cb', label: 'Sentralbank', sub: 'Statslån', x: 72, y: 52, w: 118, h: 52 },
    { id: 'hh', label: 'Husholdninger', sub: 'ω LC · (1−ω) R', x: 268, y: 28, w: 200, h: 64 },
    { id: 'gov', label: 'Offentlig sektor', sub: 'Skatt · G · I', x: 548, y: 52, w: 130, h: 52 },
    { id: 'bank', label: 'Banksektor', sub: 'Innskudd · firmalån', x: 48, y: 168, w: 130, h: 52 },
    { id: 'xc', label: 'Eksportvare', x: 118, y: 248, w: 96, h: 40 },
    { id: 'cp', label: 'Privat C', x: 238, y: 248, w: 96, h: 40 },
    { id: 'inv', label: 'Investeringsvare', x: 358, y: 248, w: 118, h: 40 },
    { id: 'gc', label: 'Off. C', x: 498, y: 248, w: 96, h: 40 },
    { id: 'imp', label: 'Importører', sub: 'Mellomvare', x: 198, y: 318, w: 120, h: 44 },
    { id: 'dom', label: 'Innenlands mellomvare', sub: 'Industri · tjenester', x: 338, y: 308, w: 200, h: 56 },
    { id: 'for', label: 'Utenland', sub: 'Eksport · banklån', x: 88, y: 398, w: 110, h: 48 },
    { id: 'oil', label: 'Oljeproduksjon', sub: 'Sokkelen', x: 318, y: 398, w: 120, h: 48 },
    { id: 'gpfg', label: 'GPFG', sub: 'Utganger til statsbudsjett', x: 528, y: 398, w: 130, h: 48 },
];

const DIAGRAM_EDGES = [
    { from: 'cb', to: 'gov', label: 'Statslån' },
    { from: 'gov', to: 'hh', label: 'Sysselsetting · skatt' },
    { from: 'hh', to: 'gov', label: 'Arbeidskraft' },
    { from: 'hh', to: 'bank', label: 'Innskudd' },
    { from: 'bank', to: 'dom', label: 'Firmalån' },
    { from: 'bank', to: 'for', label: 'Banklån utland' },
    { from: 'dom', to: 'xc', label: '' },
    { from: 'dom', to: 'cp', label: '' },
    { from: 'dom', to: 'inv', label: '' },
    { from: 'dom', to: 'gc', label: '' },
    { from: 'imp', to: 'xc', label: 'Import' },
    { from: 'imp', to: 'cp', label: '' },
    { from: 'imp', to: 'inv', label: '' },
    { from: 'imp', to: 'gc', label: '' },
    { from: 'cp', to: 'hh', label: 'Privat forbruk' },
    { from: 'gc', to: 'gov', label: 'Off. forbruk' },
    { from: 'inv', to: 'gov', label: 'Off. I' },
    { from: 'inv', to: 'oil', label: 'Olje-I' },
    { from: 'xc', to: 'for', label: 'Eksport' },
    { from: 'oil', to: 'gov', label: 'Oljeinntekter' },
    { from: 'gpfg', to: 'gov', label: 'GPFG-uttak' },
    { from: 'for', to: 'gov', label: '' },
];

function nodeCenter(n) {
    return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

function buildDiagramSvg() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 720 470');
    svg.setAttribute('class', 'nora-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Flytdiagram over NORA fastlandsøkonomi');

    const defs = document.createElementNS(ns, 'defs');
    defs.innerHTML = `
        <marker id="nora-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="rgba(94,184,232,0.7)"/>
        </marker>
    `;
    svg.appendChild(defs);

    const gEdges = document.createElementNS(ns, 'g');
    gEdges.setAttribute('class', 'nora-edges');

    const nodeMap = Object.fromEntries(DIAGRAM_NODES.map((n) => [n.id, n]));

    DIAGRAM_EDGES.forEach((e, idx) => {
        const a = nodeMap[e.from];
        const b = nodeMap[e.to];
        if (!a || !b) return;
        const ca = nodeCenter(a);
        const cb = nodeCenter(b);
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', ca.x);
        line.setAttribute('y1', ca.y);
        line.setAttribute('x2', cb.x);
        line.setAttribute('y2', cb.y);
        line.setAttribute('class', 'nora-edge');
        line.dataset.edgeId = `${e.from}-${e.to}`;
        gEdges.appendChild(line);

        if (e.label) {
            const mx = (ca.x + cb.x) / 2;
            const my = (ca.y + cb.y) / 2;
            const t = document.createElementNS(ns, 'text');
            t.setAttribute('x', mx);
            t.setAttribute('y', my - 4);
            t.setAttribute('class', 'nora-edge-label');
            t.textContent = e.label;
            gEdges.appendChild(t);
        }
    });
    svg.appendChild(gEdges);

    const gNodes = document.createElementNS(ns, 'g');
    DIAGRAM_NODES.forEach((n) => {
        const g = document.createElementNS(ns, 'g');
        g.setAttribute('class', 'nora-node');
        g.dataset.nodeId = n.id;

        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', n.x);
        rect.setAttribute('y', n.y);
        rect.setAttribute('width', n.w);
        rect.setAttribute('height', n.h);
        rect.setAttribute('rx', 4);
        g.appendChild(rect);

        const t1 = document.createElementNS(ns, 'text');
        t1.setAttribute('x', n.x + n.w / 2);
        t1.setAttribute('y', n.y + (n.sub ? 22 : 26));
        t1.setAttribute('text-anchor', 'middle');
        t1.setAttribute('class', 'nora-node-title');
        t1.textContent = n.label;
        g.appendChild(t1);

        if (n.sub) {
            const t2 = document.createElementNS(ns, 'text');
            t2.setAttribute('x', n.x + n.w / 2);
            t2.setAttribute('y', n.y + 38);
            t2.setAttribute('text-anchor', 'middle');
            t2.setAttribute('class', 'nora-node-sub');
            t2.textContent = n.sub;
            g.appendChild(t2);
        }

        gNodes.appendChild(g);
    });
    svg.appendChild(gNodes);

    return svg;
}

/** Fig. 2.2 — lønnskurve vs arbeids etterspørsel (W på vertikal akse, E horisontalt). */
function drawLaborMarket(ctx, w, h, labor, ctrl) {
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 44, r: 12, t: 22, b: 28 };
    const cw = w - pad.l - pad.r;
    const ch = h - pad.t - pad.b;

    const Emin = 0.52;
    const Emax = 0.78;
    const Wmin = 0.88;
    const Wmax = 1.12;
    const mapX = (e) => pad.l + ((e - Emin) / (Emax - Emin)) * cw;
    const mapY = (wv) => pad.t + ch - ((wv - Wmin) / (Wmax - Wmin)) * ch;

    ctx.strokeStyle = NORA_COLORS.grid;
    for (let i = 0; i <= 4; i++) {
        const gy = pad.t + (ch * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.l, gy);
        ctx.lineTo(pad.l + cw, gy);
        ctx.stroke();
    }

    const uSS = NORA_PARAMS.nairu;
    const pts = 24;
    ctx.strokeStyle = NORA_COLORS.fiscalBright;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
        const e = Emin + ((Emax - Emin) * i) / pts;
        const lf = LABOR.Lf_ss;
        const u = Math.max(0.012, (lf - e) / lf);
        const logW = -LABOR.nuU * Math.log(u / uSS);
        const wv = clamp(Math.exp(logW), Wmin, Wmax);
        const x = mapX(e);
        const y = mapY(wv);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const yM = 1 + 0.05 * (labor.E / LABOR.E_ss - 1);
    ctx.strokeStyle = NORA_COLORS.mainlandBright;
    ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
        const wv = Wmin + ((Wmax - Wmin) * i) / pts;
        const nd =
            LABOR.E_ss * Math.pow(Math.max(0.55, yM), LABOR.alphaN) * Math.pow(wv, -LABOR.etaN);
        const e = clamp(nd, Emin, Emax);
        const x = mapX(e);
        const y = mapY(wv);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const ex = mapX(labor.E);
    const ey = mapY(labor.W);
    ctx.fillStyle = NORA_COLORS.oil;
    ctx.beginPath();
    ctx.arc(ex, ey, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = NORA_COLORS.muted;
    ctx.font = '9px "Share Tech Mono", monospace';
    ctx.fillText('Lønnskurve', pad.l, pad.t - 6);
    ctx.fillText('N^d (industri)', pad.l + cw - 52, pad.t - 6);
    ctx.fillText('E →', pad.l + cw - 20, h - 8);
    ctx.fillText('W ↑', 6, pad.t + 10);
    ctx.fillStyle = NORA_COLORS.text;
    ctx.font = '10px Rajdhani, sans-serif';
    const modeLbl = ctrl.frontfag ? 'Frontfag PÅ' : 'Fleksibel lønn';
    ctx.fillText(modeLbl, pad.l, h - 6);
}

function updateDiagramFlows(svg, flows) {
    if (!svg || !flows) return;
    const scale = (v, cap = 1) => clamp(v / cap, 0.08, 1);

    const intensities = {
        'hh-bank': scale(flows.deposits, 1),
        'bank-dom': scale(flows.firmBorrow, 0.8),
        'bank-for': scale(flows.foreignBorrow + flows.mGoods - flows.xGoods, 0.5),
        'cp-hh': scale(flows.cAgg, 0.7),
        'dom-cp': scale(flows.mfg + flows.serv, 1.2),
        'inv-oil': scale(flows.iOil, 0.15),
        'gpfg-gov': scale(flows.gpfgSpend, 0.2),
        'xc-for': scale(flows.xGoods, 0.5),
    };

    svg.querySelectorAll('.nora-edge').forEach((line) => {
        const id = line.dataset.edgeId;
        const key = id?.replace('-', '-') || '';
        const alt = id;
        let w = 0.35;
        for (const [k, v] of Object.entries(intensities)) {
            if (alt === k || alt?.includes(k.split('-')[0])) w = Math.max(w, v);
        }
        line.style.strokeWidth = `${1 + w * 3}px`;
        line.style.opacity = String(0.25 + w * 0.75);
    });
}

function clampRangeInput(el, raw) {
    const min = Number(el.min ?? 0);
    const max = Number(el.max ?? 100);
    const step = Number(el.step) || 1;
    let n = Number(raw);
    if (!Number.isFinite(n)) n = min;
    n = Math.min(max, Math.max(min, n));
    if (step > 0) {
        n = min + Math.round((n - min) / step) * step;
    }
    return n;
}

/** Tving nettleseren til å tegne glidebryter-tommel på nytt (WebKit/Edge). */
function forceRangeRepaint(el) {
    if (!el || el.type !== 'range') return;
    const v = el.value;
    el.type = 'text';
    el.type = 'range';
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

function initNora() {
    const section = document.getElementById('nora');
    const canvas = document.getElementById('nora-canvas');
    const laborCanvas = document.getElementById('nora-labor-canvas');
    const diagramHost = document.getElementById('nora-diagram');
    const q = (id) => section?.querySelector(`#${id}`) ?? null;
    const frontfagToggle = q('nora-frontfag');
    const frontfagFieldset = q('nora-frontfag-fields');
    const piBandToggle = q('nora-pi-band');
    const piTargetControl = q('nora-pi-target-control');
    const piTargetInput = q('nora-pi-target');
    const piTargetValEl = q('nora-pi-target-val');
    const controlsForm = q('nora-controls-form');
    if (!section || !canvas) return;

    let diagramSvg = null;
    if (diagramHost) {
        diagramSvg = buildDiagramSvg();
        diagramHost.appendChild(diagramSvg);
    }

    const hud = {
        y: document.getElementById('nora-y'),
        pi: document.getElementById('nora-pi'),
        w: document.getElementById('nora-w'),
        u: document.getElementById('nora-u'),
        status: document.getElementById('nora-status'),
        mode: document.getElementById('nora-mode'),
    };

    let scenarioGodzilla = false;
    let scenarioBacke = false;

    const sliders = {
        omegaShare: bindSlider(q('nora-omega'), q('nora-omega-val'), (v) => `${v}%`),
        policyRate: bindSlider(q('nora-rate'), q('nora-rate-val'), (v) => `${(v / 10).toFixed(1)}%`),
        piTarget: bindSlider(q('nora-pi-target'), q('nora-pi-target-val'), (v) => `${(v / 10).toFixed(1)}%`),
        govG: bindSlider(q('nora-g'), q('nora-g-val'), (v) => `${v}%`),
        govI: bindSlider(q('nora-i'), q('nora-i-val'), (v) => `${v}%`),
        oilShock: bindSlider(q('nora-oil'), q('nora-oil-val'), (v) => `${v}%`),
        gpfgRule: bindSlider(q('nora-gpfg'), q('nora-gpfg-val'), (v) => `${v}%`),
        fiscalShock: bindSlider(q('nora-fiscal'), q('nora-fiscal-val'), (v) => `${v}%`),
        foreignRp: bindSlider(q('nora-foreign'), q('nora-foreign-val'), (v) => `${v}%`),
        wageStick: bindSlider(q('nora-wage-stick'), q('nora-wage-stick-val'), (v) => `${v}%`),
        wageShock: bindSlider(q('nora-wage-shock'), q('nora-wage-shock-val'), (v) => `${v}%`),
    };

    frontfagToggle?.addEventListener('change', () => {
        syncFrontfagUi(readControls());
    });

    piBandToggle?.addEventListener('change', () => {
        syncPiTargetUi(readControls());
    });

    function setSliderValue(slider, value) {
        if (!slider) return;
        if (slider.set) {
            slider.set(value);
            return;
        }
        if (slider.el) {
            const n = clampRangeInput(slider.el, value);
            slider.el.value = String(n);
        }
    }

    function readControls() {
        return {
            frontfag: Boolean(frontfagToggle?.checked),
            piBand: Boolean(piBandToggle?.checked),
            scenarioGodzilla,
            scenarioBacke,
            omegaShare: sliders.omegaShare.value,
            policyRate: sliders.policyRate.value / 10,
            piTarget: sliders.piTarget.value / 10,
            govG: sliders.govG.value,
            govI: sliders.govI.value,
            oilShock: sliders.oilShock.value,
            gpfgRule: sliders.gpfgRule.value,
            fiscalShock: sliders.fiscalShock.value,
            foreignRp: sliders.foreignRp.value,
            wageStick: sliders.wageStick?.value ?? 75,
            wageShock: sliders.wageShock?.value ?? 0,
        };
    }

    function syncFrontfagUi(ctrl) {
        const on = ctrl.frontfag;
        if (frontfagFieldset) {
            frontfagFieldset.classList.toggle('nora-fieldset--off', !on);
            frontfagFieldset.removeAttribute('disabled');
        }
        if (laborCanvas) laborCanvas.classList.toggle('is-dimmed', !on);
    }

    function syncPiTargetUi(ctrl) {
        const band = ctrl.piBand;
        if (piTargetControl) piTargetControl.classList.toggle('nora-control--muted', band);
        if (piTargetInput) piTargetInput.disabled = band;
        if (piTargetValEl) {
            piTargetValEl.textContent = band
                ? '1–3 %'
                : `${(sliders.piTarget.value / 10).toFixed(1)}%`;
        }
    }

    const defaults = {
        y: 0,
        pi: 0.02,
        L: 0.55,
        D: 0.45,
        F: 0.35,
        Gb: 0.1,
        Rprev: 0.045,
        W: 1,
        E: LABOR.E_ss,
        Lf: LABOR.Lf_ss,
        zR: 0,
        rer: 0,
    };
    let state = { ...defaults };
    let derived = stepNora(state, readControls(), 0);
    let modelQuarter = 0;
    let quarterAccum = 0;
    const history = { y: [], pi: [], c: [], q: [] };

    function captureControlDefaults() {
        if (frontfagToggle) frontfagToggle.defaultChecked = true;
        if (piBandToggle) piBandToggle.defaultChecked = false;
        for (const [key, val] of Object.entries(NORA_SLIDER_DEFAULTS)) {
            const s = sliders[key];
            if (s?.el) s.el.defaultValue = String(clampRangeInput(s.el, val));
        }
    }

    function refreshAllSliderLabels() {
        for (const s of Object.values(sliders)) s.refresh?.();
    }

    function resetSimulationState() {
        state = { ...defaults };
        derived = stepNora(state, readControls(), 0);
        modelQuarter = 0;
        quarterAccum = 0;
        for (const key of Object.keys(history)) history[key].length = 0;
        pushHistory();
        syncFrontfagUi(readControls());
        syncPiTargetUi(readControls());
        updateHud();
        draw();
        if (!running) {
            running = true;
            startLoop();
        }
    }

    function afterControlsReset() {
        scenarioGodzilla = false;
        scenarioBacke = false;
        refreshAllSliderLabels();
        for (const s of Object.values(sliders)) {
            if (s.el) forceRangeRepaint(s.el);
        }
        resetSimulationState();
    }

    function applySliderDefaults(values) {
        for (const key of Object.keys(values)) {
            if (sliders[key]) setSliderValue(sliders[key], values[key]);
        }
    }

    captureControlDefaults();

    controlsForm?.addEventListener('reset', () => {
        requestAnimationFrame(afterControlsReset);
    });

    function applyBackeShock() {
        scenarioGodzilla = false;
        scenarioBacke = true;
        applySliderDefaults(BACKE_SHOCK);
        refreshAllSliderLabels();
        for (const s of Object.values(sliders)) {
            if (s.el) forceRangeRepaint(s.el);
        }
        const ctrl = readControls();
        const paths = simulateMonetaryPolicyIrF(ctrl);
        openBackeIrFPanel(paths);
        const ss = noraSteadyState(ctrl);
        state = {
            ...defaults,
            pi: ss.piSs,
            Rprev: ss.rSs + NORA_BACKE_SHOCK.sizePp,
            zR: NORA_BACKE_SHOCK.sizePp,
            rer: 0.018,
        };
        derived = stepNora(state, ctrl, 0);
        modelQuarter = 0;
        quarterAccum = 0;
        for (const key of Object.keys(history)) history[key].length = 0;
        pushHistory();
        syncFrontfagUi(ctrl);
        syncPiTargetUi(ctrl);
        updateHud();
        draw();
        if (!running) {
            running = true;
            startLoop();
        }
    }

    function applyGodzillaTrollShock() {
        scenarioBacke = false;
        applySliderDefaults(GODZILLA_TROLL_SHOCK);
        scenarioGodzilla = true;
        state = {
            ...defaults,
            y: -0.035,
            pi: 0.024,
            Rprev: GODZILLA_TROLL_SHOCK.policyRate / 1000,
        };
        derived = stepNora(state, readControls(), 0);
        modelQuarter = 0;
        quarterAccum = 0;
        for (const key of Object.keys(history)) history[key].length = 0;
        pushHistory();
        syncFrontfagUi(readControls());
        syncPiTargetUi(readControls());
        updateHud();
        draw();
        if (!running) {
            running = true;
            startLoop();
        }
    }

    let running = true;
    let rafId = 0;
    let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    const lctx = laborCanvas?.getContext('2d');
    let w = 0;
    let h = 0;
    let lw = 0;
    let lh = 0;
    let dpr = 1;
    const isStandalone = document.body?.classList.contains('nora-page') || section.tagName === 'MAIN';

    function resize() {
        const rect = canvas.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, reducedMotion ? 1 : 2);
        w = Math.max(280, rect.width);
        h = Math.max(220, rect.height);
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (laborCanvas && lctx) {
            const lr = laborCanvas.getBoundingClientRect();
            lw = Math.max(200, lr.width);
            lh = Math.max(140, lr.height);
            laborCanvas.width = lw * dpr;
            laborCanvas.height = lh * dpr;
            lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    }

    function pushHistory() {
        history.y.push(derived.y);
        history.pi.push(derived.pi);
        history.c.push(derived.flows.cAgg);
        history.q.push(modelQuarter);
        const max = NORA_PARAMS.historyQuarters;
        for (const key of Object.keys(history)) {
            if (history[key].length > max) history[key].shift();
        }
    }

    function advanceOneQuarter(ctrl) {
        derived = stepNora(state, ctrl, NORA_PARAMS.quarterDt);
        state = {
            y: derived.y,
            pi: derived.pi,
            L: derived.L,
            D: derived.D,
            F: derived.F,
            Gb: derived.Gb,
            Rprev: derived.Rprev,
            W: derived.W,
            E: derived.E,
            Lf: derived.Lf,
            zR: derived.zR,
            rer: derived.rer,
        };
        modelQuarter += 1;
        pushHistory();
    }

    function updateHud() {
        const ctrl = readControls();
        syncFrontfagUi(ctrl);
        syncPiTargetUi(ctrl);
        if (hud.y) hud.y.textContent = `${(derived.y * 100).toFixed(1)}%`;
        if (hud.pi) hud.pi.textContent = `${(derived.pi * 100).toFixed(2)}%`;
        if (hud.w) hud.w.textContent = `${(derived.W * 100).toFixed(1)}`;
        if (hud.u) hud.u.textContent = `${(derived.u * 100).toFixed(1)}%`;
        if (hud.mode) hud.mode.textContent = ctrl.frontfag ? 'Frontfag' : 'Fleksibel';
        if (hud.status) hud.status.textContent = noraStatus(derived, ctrl);
        updateDiagramFlows(diagramSvg, derived.flows);
    }

    function drawChart(x0, y0, cw, ch) {
        const axis = { l: 38, r: 6, t: 16, b: 24 };
        const plotW = cw - axis.l - axis.r;
        const plotH = ch - axis.t - axis.b;
        const plotX0 = x0 + axis.l;
        const plotY0 = y0 + axis.t;

        const n = history.y.length;
        if (n < 2 || plotW < 20 || plotH < 20) return;

        const qMin = history.q[0];
        const qMax = history.q[n - 1];
        const qSpan = Math.max(1, qMax - qMin);
        const mapX = (q) => plotX0 + ((q - qMin) / qSpan) * plotW;

        ctx.strokeStyle = NORA_COLORS.grid;
        for (let i = 0; i <= 4; i++) {
            const gy = plotY0 + (plotH * i) / 4;
            ctx.beginPath();
            ctx.moveTo(plotX0, gy);
            ctx.lineTo(plotX0 + plotW, gy);
            ctx.stroke();
        }

        const tickStep = qSpan > 25 ? 10 : qSpan > 12 ? 5 : 2;
        const qTickStart = Math.ceil(qMin / tickStep) * tickStep;
        ctx.fillStyle = NORA_COLORS.muted;
        ctx.font = '9px "Share Tech Mono", monospace';
        for (let t = qTickStart; t <= qMax; t += tickStep) {
            const tx = mapX(t);
            ctx.strokeStyle = 'rgba(143, 212, 255, 0.08)';
            ctx.beginPath();
            ctx.moveTo(tx, plotY0);
            ctx.lineTo(tx, plotY0 + plotH);
            ctx.stroke();
            ctx.fillStyle = NORA_COLORS.muted;
            ctx.textAlign = 'center';
            ctx.fillText(String(t), tx, plotY0 + plotH + 14);
        }
        ctx.textAlign = 'left';

        const all = [...history.y, ...history.pi].filter(Number.isFinite);
        let minV = Math.min(...all, -0.06);
        let maxV = Math.max(...all, 0.06);
        const vPad = (maxV - minV) * 0.15 || 0.04;
        minV -= vPad;
        maxV += vPad;
        const range = maxV - minV || 1;
        const mapY = (v) => plotY0 + plotH - ((v - minV) / range) * plotH;

        const series = [
            [history.y, NORA_COLORS.mainlandBright],
            [history.pi, NORA_COLORS.fiscalBright],
        ];
        series.forEach(([arr, color]) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            arr.forEach((v, i) => {
                const x = mapX(history.q[i]);
                const y = mapY(v);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        });

        ctx.fillStyle = NORA_COLORS.muted;
        ctx.font = '10px "Share Tech Mono", monospace';
        ctx.fillText('y (gap) · π', x0, y0 + 4);
        ctx.textAlign = 'center';
        ctx.fillText('kvartaler →', plotX0 + plotW / 2, y0 + ch - 2);
        ctx.textAlign = 'left';
    }

    function drawSectors(x0, y0, sw, sh) {
        const f = derived.flows;
        const items = [
            ['Industri', f.mfg, NORA_COLORS.mainland],
            ['Tjenester', f.serv, NORA_COLORS.mainlandBright],
            ['Agg. C', f.cAgg, NORA_COLORS.fiscal],
            ['C^L', f.cL, NORA_COLORS.fiscalBright],
            ['Investering', f.iTotal, NORA_COLORS.bank],
            ['Eksport', f.xGoods, NORA_COLORS.foreign],
        ];
        const maxV = Math.max(...items.map(([, v]) => v), 0.01);
        const barW = (sw - 40) / items.length;

        ctx.fillStyle = NORA_COLORS.muted;
        ctx.font = '10px "Share Tech Mono", monospace';
        ctx.fillText('SEKTORSTRØMMER (normalisert)', x0, y0 + 12);

        items.forEach(([label, val, col], i) => {
            const bh = ((val / maxV) * (sh - 50));
            const bx = x0 + 12 + i * barW;
            ctx.fillStyle = col;
            ctx.fillRect(bx, y0 + sh - 24 - bh, barW - 8, bh);
            ctx.fillStyle = NORA_COLORS.text;
            ctx.font = '9px Rajdhani, sans-serif';
            ctx.fillText(label, bx, y0 + sh - 8);
        });
    }

    function draw() {
        const ctrl = readControls();
        ctx.clearRect(0, 0, w, h);
        const pad = 12;
        const chartH = h * 0.48;
        drawChart(pad, pad, w - pad * 2, chartH);
        drawSectors(pad, pad + chartH + 8, w - pad * 2, h - chartH - pad - 16);
        if (lctx && laborCanvas) {
            drawLaborMarket(lctx, lw, lh, derived, ctrl);
        }
    }

    function tick(wallDt) {
        const ctrl = readControls();
        const qps =
            NORA_PARAMS.quartersPerSecond * (reducedMotion ? 0.45 : 1);
        quarterAccum += wallDt * qps;
        let steps = 0;
        while (quarterAccum >= 1 && steps < 8) {
            quarterAccum -= 1;
            advanceOneQuarter(ctrl);
            steps += 1;
        }
        updateHud();
        draw();
    }

    let last = performance.now();
    function loop(now) {
        if (!running) {
            rafId = 0;
            return;
        }
        if (!document.hidden) {
            const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
            last = now;
            try {
                tick(reducedMotion ? dt * 0.35 : dt);
            } catch (err) {
                console.error('NORA tick:', err);
            }
        }
        rafId = requestAnimationFrame(loop);
    }

    function startLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        last = performance.now();
        rafId = requestAnimationFrame(loop);
    }

    function stopLoop() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }

    q('nora-godzilla')?.addEventListener('click', applyGodzillaTrollShock);
    q('nora-backe')?.addEventListener('click', applyBackeShock);
    q('nora-pause')?.addEventListener('click', () => {
        running = !running;
        if (running) startLoop();
        else stopLoop();
    });

    if (!isStandalone) {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.some((e) => e.isIntersecting);
                if (visible && running) startLoop();
                else if (!visible) stopLoop();
            },
            { threshold: 0.08, rootMargin: '80px' },
        );
        observer.observe(section);
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && running) startLoop();
    });

    syncFrontfagUi(readControls());
    syncPiTargetUi(readControls());
    resize();
    pushHistory();
    updateHud();
    draw();
    startLoop();

    let resizeTO;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTO);
        resizeTO = setTimeout(() => {
            resize();
            draw();
        }, 120);
    });
}

function bindSlider(el, label, fmt) {
    if (!el) {
        return {
            el: null,
            get value() {
                return 0;
            },
            set() {},
        };
    }
    const obj = {
        el,
        get value() {
            const n = Number(el.value);
            return Number.isFinite(n) ? n : 0;
        },
    };
    const update = () => {
        if (label) label.textContent = fmt(obj.value);
    };
    el.addEventListener('input', update);
    el.addEventListener('change', update);
    update();
    obj.set = (v) => {
        const n = clampRangeInput(el, v);
        el.value = String(n);
        update();
        forceRangeRepaint(el);
    };
    obj.refresh = update;
    return obj;
}

initNora();
