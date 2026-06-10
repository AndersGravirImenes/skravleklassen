/**
 * Stad skipstunnel — samfunnsøkonomisk analyse
 * KS1 (Econ/Pöyry 2012) + 2026-kostnadsramme (Kystverket ~8,6 mrd)
 */
(function () {
    'use strict';

    const BENEFIT_KEYS = ['hurtigbat', 'ventetid', 'drivstoff', 'reisetid', 'ulykker', 'miljo'];
    const TRAFFIC_KEYS = ['ventetid', 'drivstoff', 'reisetid', 'miljo'];

    const BENEFIT_LABELS = {
        hurtigbat: 'Nyskapt hurtigbåttrafikk',
        ventetid: 'Spart ventetid',
        drivstoff: 'Spart drivstoff',
        reisetid: 'Spart reisetid',
        ulykker: 'Færre ulykker',
        miljo: 'Reduserte miljøutslipp'
    };

    const COST_LABELS = {
        invest: 'Investeringskostnader (nåverdi)',
        drift: 'Drift og vedlikehold (nåverdi)',
        skatt: 'Skattefinansiering'
    };

    const UNPRICED = [
        { label: 'Fiskeri og marine næringer', qual: '++', hint: 'Middels positiv — pålitelig leveranse, lavere transportkost' },
        { label: 'Økt trygghet', qual: '+', hint: 'Liten — ikke tallfestet i rapporten' },
        { label: 'Utenlandsk turisme', qual: '− / +', hint: 'Usikker (liten) / liten positiv (stor tunnel)' },
        { label: 'Overføring vei → sjø', qual: '+', hint: 'Liten — gods flyttes i begrenset omfang' },
        { label: 'Øvrige næringseffekter', qual: '+', hint: 'Liten — utover hurtigbåt og pendling' }
    ];

    const PRESETS = {
        ks1_lite: {
            label: 'KS1 2012 · liten',
            year: 2011,
            invest: 1085,
            drift: 165,
            skattPct: 20,
            benefits: { hurtigbat: 478, ventetid: 74, drivstoff: 142, reisetid: 117, ulykker: 207, miljo: 108 },
            traffic: 100,
            benefitScale: 100,
            benefitGrowth: 1.5,
            rate: 4.5,
            period: 75
        },
        ks1_stor: {
            label: 'KS1 2012 · stor',
            year: 2011,
            invest: 1565,
            drift: 165,
            skattPct: 20,
            benefits: { hurtigbat: 478, ventetid: 86, drivstoff: 149, reisetid: 118, ulykker: 242, miljo: 114 },
            traffic: 100,
            benefitScale: 100,
            benefitGrowth: 1.5,
            rate: 4.5,
            period: 75
        },
        storting_2026: {
            label: 'Stortinget · vedtatt',
            year: 2026,
            invest: 5385,
            drift: 400,
            skattPct: 20,
            benefits: { hurtigbat: 478, ventetid: 86, drivstoff: 149, reisetid: 118, ulykker: 242, miljo: 114 },
            traffic: 100,
            benefitScale: 100,
            benefitGrowth: 1.5,
            rate: 4.5,
            period: 75
        },
        kystverk_2026: {
            label: 'Kystverket · 2026',
            year: 2026,
            invest: 8500,
            drift: 450,
            skattPct: 20,
            benefits: { hurtigbat: 478, ventetid: 86, drivstoff: 149, reisetid: 118, ulykker: 242, miljo: 114 },
            traffic: 100,
            benefitScale: 100,
            benefitGrowth: 1.5,
            rate: 4.5,
            period: 75
        }
    };

    /** Sjømonster-sjokket: multiplikatorer ved full intensitet (pedagogisk, ikke KS1) */
    const MONSTER_MULT = {
        ulykker: 12,
        ventetid: 6,
        hurtigbat: 3.5,
        reisetid: 3,
        drivstoff: 1.8,
        miljo: 1.2
    };

    const MONSTER_META = [
        {
            id: 'traffic',
            label: 'Flyktende skipstrafikk',
            desc: 'Færre fartøy tør å passere Stad på åpent hav. Trafikken konsentreres i tunnelen — og skalerer ventetid, drivstoff, reisetid og miljø.',
            maxLabel: '+85 % trafikk ved full intensitet'
        },
        {
            id: 'ulykker',
            key: 'ulykker',
            label: 'Færre ulykker',
            desc: 'Forlis- og kollisjonsrisiko utenfor Stad antas å eksplodere når sjømonster er til stede. Tunnelen unngår åpent monsterfarvann.',
            maxMult: MONSTER_MULT.ulykker
        },
        {
            id: 'ventetid',
            key: 'ventetid',
            label: 'Spart ventetid',
            desc: 'Skip venter ikke bare på vær — de venter på at monsteret går videre. Tunnel gir forutsigbar passasje.',
            maxMult: MONSTER_MULT.ventetid
        },
        {
            id: 'hurtigbat',
            key: 'hurtigbat',
            label: 'Nyskapt hurtigbåttrafikk',
            desc: 'Pendling og persontransport over Stad øker når sjøveien utenfor er monsterutsatt og tunnel er trygg rute.',
            maxMult: MONSTER_MULT.hurtigbat
        },
        {
            id: 'reisetid',
            key: 'reisetid',
            label: 'Spart reisetid',
            desc: 'Fartøy unngår omveier og evakuering fra åpent hav; gjennomsnittsfarten i tunnel øker i nytteberegningen.',
            maxMult: MONSTER_MULT.reisetid
        },
        {
            id: 'drivstoff',
            key: 'drivstoff',
            label: 'Spart drivstoff',
            desc: 'Mindre behov for å krysse eksponert sjø i dårlig vær og fluktmanøvrer — lavere drivstofforbruk per passering.',
            maxMult: MONSTER_MULT.drivstoff
        },
        {
            id: 'miljo',
            key: 'miljo',
            label: 'Reduserte miljøutslipp',
            desc: 'Drivstoffbesparelser gir lavere CO₂-utslipp; sekundæreffekt av at færre skip står og venter utenfor Stad.',
            maxMult: MONSTER_MULT.miljo
        },
        {
            id: 'trygghet',
            special: true,
            label: 'Prissatt monster-trygghet',
            desc: 'SIØA-tilleggskomponent — ikke i KS1. Samfunnets betalingsvillighet for å unngå sjømonster, skalert med tunnelinvestering.',
            maxLabel: 'ca. 2 200–4 000 mill. nåverdi'
        }
    ];

    const state = {
        preset: 'kystverk_2026',
        year: 2026,
        invest: 8500,
        drift: 450,
        skattPct: 20,
        benefitPct: { hurtigbat: 100, ventetid: 100, drivstoff: 100, reisetid: 100, ulykker: 100, miljo: 100 },
        benefitScale: 100,
        traffic: 100,
        benefitGrowth: 1.5,
        rate: 4.5,
        period: 75,
        waves: false,
        unpriced: 0,
        monster: false,
        monsterIntensity: 100
    };

    let baseBenefits = { ...PRESETS.kystverk_2026.benefits };

    function sum(obj) {
        return Object.values(obj).reduce((a, b) => a + b, 0);
    }

    function monsterFactor() {
        if (!state.monster) return 0;
        return state.monsterIntensity / 100;
    }

    function lerpMult(key, f) {
        return 1 + (MONSTER_MULT[key] - 1) * f;
    }

    function computeBenefits() {
        const scale = state.benefitScale / 100;
        const f = monsterFactor();
        const trafficBoost = f * 0.85;
        const traffic = (state.traffic / 100) * (1 + trafficBoost);
        const base = {};
        const boosted = {};
        const monsterDelta = {};

        BENEFIT_KEYS.forEach((key) => {
            const mult = (state.benefitPct[key] / 100) * scale;
            const trafficMult = TRAFFIC_KEYS.includes(key) ? traffic : 1;
            base[key] = baseBenefits[key] * mult * trafficMult;
            const mMult = lerpMult(key, f);
            boosted[key] = base[key] * mMult;
            monsterDelta[key] = boosted[key] - base[key];
        });

        const monsterTrygghet = f > 0
            ? Math.round((2200 + 1800 * (state.invest / 8500)) * f)
            : 0;

        const components = boosted;
        const total = sum(components) + monsterTrygghet;

        return {
            components,
            base,
            monsterDelta,
            monsterTrygghet,
            total,
            monsterActive: f > 0
        };
    }

    function computeCosts() {
        const invest = state.invest;
        const drift = state.drift;
        const skatt = (invest + drift) * (state.skattPct / 100);
        return {
            invest,
            drift,
            skatt,
            total: invest + drift + skatt
        };
    }

    function compute() {
        const benefit = computeBenefits();
        const { components, total: totalBenefit, monsterDelta, monsterTrygghet, monsterActive } = benefit;
        const costs = computeCosts();
        const totalCost = costs.total;

        let net = totalBenefit - totalCost;

        const benefitRef = 1126;
        const rateSens = 272 * (totalBenefit / benefitRef);
        net += rateSens * (4.5 - state.rate);

        const periodSens = 3.52 * (totalBenefit / benefitRef);
        net += periodSens * (state.period - 75);

        const growthSens = 8 * (totalBenefit / 100);
        net += growthSens * (state.benefitGrowth - 1.5);

        if (state.waves) {
            net += 75 * (state.traffic / 100);
        }

        const adjustedNet = net + state.unpriced;
        const remaining = Math.max(0, -net - state.unpriced);
        const profitable = adjustedNet >= 0;

        return {
            costs,
            components,
            monsterDelta,
            monsterTrygghet,
            monsterActive,
            totalBenefit,
            totalCost,
            net,
            adjustedNet,
            remaining,
            profitable
        };
    }

    function fmtMill(n, signed) {
        const rounded = Math.round(n);
        const abs = Math.abs(rounded);
        const str = abs >= 1000
            ? (abs / 1000).toFixed(2).replace('.', ',') + ' mrd'
            : abs.toLocaleString('nb-NO') + ' mill';
        if (!signed) return str;
        if (rounded > 0) return '+' + str;
        if (rounded < 0) return '−' + str;
        return '0';
    }

    function fmtPct(n, digits) {
        return n.toFixed(digits ?? 1).replace('.', ',') + ' %';
    }

    function fmtMult(n) {
        return '×' + n.toFixed(1).replace('.', ',');
    }

    function bind(id) {
        return document.getElementById(id);
    }

    function applyPreset(key) {
        const p = PRESETS[key];
        if (!p) return;

        state.preset = key;
        state.year = p.year;
        state.invest = p.invest;
        state.drift = p.drift;
        state.skattPct = p.skattPct;
        state.traffic = p.traffic;
        state.benefitScale = p.benefitScale;
        state.benefitGrowth = p.benefitGrowth;
        state.rate = p.rate;
        state.period = p.period;
        baseBenefits = { ...p.benefits };
        BENEFIT_KEYS.forEach((k) => { state.benefitPct[k] = 100; });
        state.monster = false;
        state.monsterIntensity = 100;

        syncInputs();
        syncLabels();
        updatePresetButtons();
        update();
    }

    function syncInputs() {
        const map = {
            'stad-invest': state.invest,
            'stad-drift': state.drift,
            'stad-skatt': state.skattPct,
            'stad-traffic': state.traffic,
            'stad-benefit-scale': state.benefitScale,
            'stad-growth': state.benefitGrowth,
            'stad-rate': state.rate,
            'stad-period': state.period,
            'stad-unpriced': state.unpriced,
            'stad-waves': state.waves,
            'stad-monster-intensity': state.monsterIntensity
        };

        Object.entries(map).forEach(([id, val]) => {
            const el = bind(id);
            if (!el) return;
            if (el.type === 'checkbox') el.checked = !!val;
            else el.value = val;
        });

        BENEFIT_KEYS.forEach((key) => {
            const el = bind('stad-benefit-' + key);
            if (el) el.value = state.benefitPct[key];
        });
    }

    function syncLabels() {
        const set = (id, text) => {
            const el = bind(id);
            if (el) el.textContent = text;
        };

        set('stad-invest-val', fmtMill(state.invest));
        set('stad-drift-val', fmtMill(state.drift));
        set('stad-skatt-val', fmtPct(state.skattPct, 0));
        set('stad-traffic-val', state.traffic + ' %');
        set('stad-benefit-scale-val', state.benefitScale + ' %');
        set('stad-growth-val', fmtPct(state.benefitGrowth));
        set('stad-rate-val', fmtPct(state.rate));
        set('stad-period-val', state.period + ' år');
        set('stad-unpriced-val', fmtMill(state.unpriced));

        BENEFIT_KEYS.forEach((key) => {
            set('stad-benefit-' + key + '-val', state.benefitPct[key] + ' %');
        });

        set('stad-monster-intensity-val', state.monsterIntensity + ' %');

        const wm = bind('stad-watermark');
        if (wm) {
            const tag = state.monster ? ' · SJØMONSTER-SJOKK' : '';
            wm.textContent = `NÅVERDI · ${state.year}-KRONER · ${PRESETS[state.preset]?.label?.toUpperCase() || 'EGEN'}${tag}`;
        }

        const panel = document.querySelector('.stad-panel--chart');
        panel?.classList.toggle('stad-panel--monster', state.monster);

        const monsterBtn = bind('stad-monster-btn');
        if (monsterBtn) {
            monsterBtn.classList.toggle('stad-shock-btn--active', state.monster);
            monsterBtn.setAttribute('aria-pressed', state.monster ? 'true' : 'false');
        }

        const monsterBox = document.querySelector('.stad-monster-box');
        monsterBox?.classList.toggle('stad-monster-box--active', state.monster);

        const intensityWrap = bind('stad-monster-intensity-wrap');
        if (intensityWrap) {
            intensityWrap.classList.toggle('stad-monster-intensity--live', state.monster);
        }

        const th = bind('stad-table-unit');
        if (th) th.textContent = `Nåverdi (mill. ${state.year}-kr)`;
    }

    function updatePresetButtons() {
        document.querySelectorAll('[data-preset]').forEach((btn) => {
            btn.classList.toggle('stad-toggle--active', btn.dataset.preset === state.preset);
        });
    }

    function renderTable(result) {
        const tbody = bind('stad-table-body');
        if (!tbody) return;

        const {
            costs, components, monsterDelta, monsterTrygghet, monsterActive,
            totalBenefit, totalCost, net, adjustedNet
        } = result;

        const rows = [
            ...Object.entries(costs).filter(([k]) => k !== 'total').map(([k, v]) => ({
                kind: 'cost',
                label: COST_LABELS[k] + (k === 'skatt' ? ` (${state.skattPct} %)` : ''),
                active: v
            })),
            { kind: 'sum', label: 'Sum kostnader', active: totalCost },
            ...BENEFIT_KEYS.map((k) => ({
                kind: monsterActive && monsterDelta[k] > 0.5 ? 'monster' : 'benefit',
                label: BENEFIT_LABELS[k] + (monsterActive && monsterDelta[k] > 0.5 ? ' (etter monster)' : ''),
                active: components[k]
            })),
            ...(monsterTrygghet > 0 ? [{
                kind: 'monster',
                label: 'Prissatt monster-trygghet (SIØA-tillegg)',
                active: monsterTrygghet
            }] : []),
            { kind: 'sum', label: 'Sum prissatt nytte', active: totalBenefit },
            { kind: 'net', label: 'Netto nytte (prissatt)', active: net },
            ...(state.unpriced > 0 ? [{ kind: 'unpriced', label: 'Uprissert nytte (din vurdering)', active: state.unpriced }] : []),
            { kind: 'final', label: 'Netto etter uprissert nytte', active: adjustedNet }
        ];

        tbody.innerHTML = rows.map((row) => {
            const cls = {
                sum: 'stad-row-sum',
                net: 'stad-row-net',
                final: 'stad-row-final',
                cost: 'stad-row-cost',
                unpriced: 'stad-row-unpriced',
                benefit: 'stad-row-benefit',
                monster: 'stad-row-monster'
            }[row.kind];
            const signed = row.kind === 'net' || row.kind === 'final' || row.kind === 'unpriced';
            return `<tr class="${cls}"><td>${row.label}</td><td>${fmtMill(row.active, signed)}</td></tr>`;
        }).join('');

        const verdict = bind('stad-verdict');
        if (verdict) {
            if (result.profitable && monsterActive) {
                verdict.textContent = 'STADMONSTER-SJOKK — TUNNELEN LØNNER SEG MED PRISSATT NYTTE';
                verdict.className = 'stad-verdict stad-verdict--monster';
            } else if (result.profitable) {
                verdict.textContent = 'SAMFUNNSØKONOMISK LØNNSOM — MED DIN UPRISSATTE NYTTE';
                verdict.className = 'stad-verdict stad-verdict--pos';
            } else if (monsterActive) {
                verdict.textContent = `MONSTER-SJOKK AKTIV — FORTSATT UNDERSKUDD PÅ ${fmtMill(-result.net)} — SKRU OPP INTENSITET`;
                verdict.className = 'stad-verdict stad-verdict--monster-warn';
            } else if (state.unpriced > 0) {
                verdict.textContent = `FORTSATT UNDERSKUDD — TRENGER ${fmtMill(result.remaining)} TIL I UPRISSATTE EFFEKTER`;
                verdict.className = 'stad-verdict stad-verdict--warn';
            } else {
                verdict.textContent = `NETTO UNDERSKUDD — UPRISSATTE EFFEKTER MÅ TILSVARE MINST ${fmtMill(-result.net)}`;
                verdict.className = 'stad-verdict stad-verdict--neg';
            }
        }

        const hurdleEl = bind('stad-hurdle');
        if (hurdleEl) {
            const gap = Math.max(0, -result.net);
            const annual = Math.round(gap / state.period);
            if (result.monsterActive && result.net > 0) {
                hurdleEl.innerHTML = `Sjømonster-sjokket har løftet prissatt nytte over kostnadene med <strong>${fmtMill(result.net)}</strong> i overskudd. KS1 modellerte ikke sjømonstre — dette er et pedagogisk SIØA-scenario på linje med <strong>Godzilla-sjokket</strong> i NORA.`;
            } else if (gap > 0) {
                hurdleEl.innerHTML = result.monsterActive
                    ? `Selv med sjømonster utenfor Stad er gapet <strong>${fmtMill(gap)}</strong>. Øk intensiteten — eller aksepter at 8,5 mrd. er vanskelig å forsvare uten forhistorisk fauna.`
                    : `Med valgte parametre er gapet mellom prissatt nytte og kostnad <strong>${fmtMill(gap)}</strong> — tilsvarende ca. <strong>${annual.toLocaleString('nb-NO')} mill. kr/år</strong> over ${state.period} år hvis uprisserte effekter skal lukke det.`;
            } else {
                hurdleEl.innerHTML = `Med valgte parametre er prissatt nytte <strong>høyere enn kostnadene</strong> — men KS1 og Kystverket har ikke tallfestet alle gevinster; vurder uprisserte effekter separat.`;
            }
        }

        const readouts = {
            'stad-readout-cost': totalCost,
            'stad-readout-benefit': totalBenefit,
            'stad-readout-net': result.adjustedNet,
            'stad-readout-gap': result.remaining > 0 ? result.remaining : Math.max(0, -result.net)
        };
        Object.entries(readouts).forEach(([id, val]) => {
            const el = bind(id);
            if (el) el.textContent = fmtMill(val, id !== 'stad-readout-cost' && id !== 'stad-readout-benefit');
        });
    }

    function drawChart(result) {
        const canvas = bind('stad-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        const { totalCost, totalBenefit, adjustedNet } = result;
        const maxVal = Math.max(totalCost, totalBenefit, Math.abs(adjustedNet), 1000) * 1.1;
        const pad = { l: 64, r: 24, t: 36, b: 48 };
        const chartW = w - pad.l - pad.r;
        const chartH = h - pad.t - pad.b;
        const barW = Math.min(120, chartW / 3 - 20);
        const zeroY = pad.t + chartH;

        ctx.clearRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(94, 184, 232, 0.2)';
        for (let i = 0; i <= 4; i++) {
            const y = pad.t + (chartH * i) / 4;
            ctx.beginPath();
            ctx.moveTo(pad.l, y);
            ctx.lineTo(w - pad.r, y);
            ctx.stroke();
            const val = maxVal * (1 - i / 4);
            ctx.fillStyle = '#6a8578';
            ctx.font = '11px Share Tech Mono, monospace';
            ctx.textAlign = 'right';
            ctx.fillText(val >= 1000 ? (val / 1000).toFixed(1) + ' mrd' : Math.round(val) + ' mill', pad.l - 8, y + 4);
        }

        const benefitColor = state.monster ? '#6ee8c4' : '#4db88a';
        const bars = [
            { label: 'Kostnader', value: totalCost, color: '#e85d5d', x: 0 },
            { label: 'Prissatt nytte', value: totalBenefit, color: benefitColor, x: 1 },
            { label: 'Netto', value: Math.abs(adjustedNet), color: adjustedNet >= 0 ? '#7ee8b4' : '#c9a84b', x: 2, signed: adjustedNet }
        ];

        bars.forEach((bar) => {
            const x = pad.l + bar.x * (chartW / 3) + (chartW / 3 - barW) / 2;
            const bh = (bar.value / maxVal) * chartH;
            const y = zeroY - bh;
            const isNet = bar.signed !== undefined;
            ctx.fillStyle = isNet && bar.signed < 0 ? '#c9a84b' : bar.color;
            ctx.globalAlpha = 0.85;
            ctx.fillRect(x, y, barW, bh);
            ctx.globalAlpha = 1;

            ctx.fillStyle = '#e8f2ec';
            ctx.font = '600 12px Rajdhani, sans-serif';
            ctx.textAlign = 'center';
            const sign = isNet && bar.signed < 0 ? '−' : '';
            const label = bar.value >= 1000
                ? sign + (bar.value / 1000).toFixed(2).replace('.', ',') + ' mrd'
                : sign + Math.round(bar.value) + ' mill';
            ctx.fillText(label, x + barW / 2, y - 8);

            ctx.fillStyle = '#9eb8a8';
            ctx.font = '10px Share Tech Mono, monospace';
            ctx.fillText(bar.label.toUpperCase(), x + barW / 2, zeroY + 20);
        });

        ctx.fillStyle = '#5eb8e8';
        ctx.font = '10px Share Tech Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`NÅVERDI · ${state.year}-KRONER`, pad.l, 18);
    }

    function renderMonsterBox(result) {
        const list = bind('stad-monster-components');
        const status = bind('stad-monster-status');
        if (!list) return;

        const f = monsterFactor();

        list.innerHTML = MONSTER_META.map((item) => {
            let effectLabel = '';
            let boostLabel = '';

            if (item.id === 'traffic') {
                const boost = Math.round(f * 85);
                effectLabel = f > 0
                    ? `+${boost} % trafikk nå`
                    : item.maxLabel;
                if (f > 0) {
                    const effective = Math.round((state.traffic / 100) * (1 + f * 0.85) * 100);
                    boostLabel = `Effektiv trafikk: ${effective} % av KS1-basis`;
                }
            } else if (item.special) {
                effectLabel = item.maxLabel;
                if (f > 0 && result.monsterTrygghet > 0) {
                    boostLabel = `+${fmtMill(result.monsterTrygghet)} nåverdi`;
                }
            } else if (item.key) {
                const currentMult = lerpMult(item.key, f);
                effectLabel = f > 0
                    ? `${fmtMult(currentMult)} nå (maks ${fmtMult(item.maxMult)})`
                    : `maks ${fmtMult(item.maxMult)}`;
                const delta = result.monsterDelta[item.key] || 0;
                if (f > 0 && delta > 0.5) {
                    boostLabel = `+${fmtMill(delta)} nåverdi`;
                }
            }

            const activeCls = f > 0 ? ' stad-monster-item--live' : '';
            return `
                <li class="stad-monster-item${activeCls}">
                    <div class="stad-monster-item-head">
                        <strong>${item.label}</strong>
                        <span class="stad-monster-effect">${effectLabel}</span>
                    </div>
                    <p>${item.desc}</p>
                    ${boostLabel ? `<span class="stad-monster-boost">${boostLabel}</span>` : ''}
                </li>
            `;
        }).join('');

        if (status) {
            if (!state.monster) {
                status.textContent = 'Sjokket er av — komponentene viser maks effekt ved full intensitet.';
            } else {
                const totalBoost = (result.monsterTrygghet || 0) + sum(result.monsterDelta || {});
                status.textContent = result.net > 0
                    ? `Sjokket er aktivt (${state.monsterIntensity} %) — prissatt overskudd ${fmtMill(result.net)}.`
                    : `Sjokket er aktivt (${state.monsterIntensity} %) — total nytteøkning ${fmtMill(totalBoost)}; gap igjen ${fmtMill(-result.net)}.`;
            }
        }
    }

    function renderUnpricedList() {
        const list = bind('stad-unpriced-list');
        if (!list) return;
        list.innerHTML = UNPRICED.map((item) => `
            <li>
                <span class="stad-qual">${item.qual}</span>
                <div>
                    <strong>${item.label}</strong>
                    <span>${item.hint}</span>
                </div>
            </li>
        `).join('');
    }

    function markCustom() {
        state.preset = 'custom';
        updatePresetButtons();
    }

    function update() {
        const result = compute();
        renderTable(result);
        drawChart(result);
        renderMonsterBox(result);
    }

    function bindSlider(id, key, parser, onChange) {
        const el = bind(id);
        if (!el) return;
        el.addEventListener('input', () => {
            const val = parser(el);
            if (key.includes('.')) {
                const [obj, prop] = key.split('.');
                state[obj][prop] = val;
            } else {
                state[key] = val;
            }
            markCustom();
            if (onChange) onChange();
            syncLabels();
            update();
        });
    }

    function init() {
        document.querySelectorAll('[data-preset]').forEach((btn) => {
            btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
        });

        bindSlider('stad-invest', 'invest', (el) => parseInt(el.value, 10));
        bindSlider('stad-drift', 'drift', (el) => parseInt(el.value, 10));
        bindSlider('stad-skatt', 'skattPct', (el) => parseInt(el.value, 10));
        bindSlider('stad-traffic', 'traffic', (el) => parseInt(el.value, 10));
        bindSlider('stad-benefit-scale', 'benefitScale', (el) => parseInt(el.value, 10));
        bindSlider('stad-growth', 'benefitGrowth', (el) => parseFloat(el.value));
        bindSlider('stad-rate', 'rate', (el) => parseFloat(el.value));
        bindSlider('stad-period', 'period', (el) => parseInt(el.value, 10));
        bindSlider('stad-unpriced', 'unpriced', (el) => parseInt(el.value, 10));

        BENEFIT_KEYS.forEach((key) => {
            bindSlider('stad-benefit-' + key, 'benefitPct.' + key, (el) => parseInt(el.value, 10));
        });

        const waves = bind('stad-waves');
        waves?.addEventListener('change', () => {
            state.waves = waves.checked;
            markCustom();
            update();
        });

        bind('stad-monster-btn')?.addEventListener('click', () => {
            state.monster = !state.monster;
            markCustom();
            syncLabels();
            update();
        });

        bindSlider('stad-monster-intensity', 'monsterIntensity', (el) => parseInt(el.value, 10));

        window.addEventListener('resize', () => update());

        renderUnpricedList();
        applyPreset('kystverk_2026');
        renderMonsterBox(compute());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
