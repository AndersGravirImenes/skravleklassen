/**
 * MONIAC — Phillips-maskin (hydraulisk makromodell)
 * Forenklet Keynesiansk sirkulasjonsmodell med visuell strøm.
 */
(function initMoniac() {
    const canvas = document.getElementById('moniac-canvas');
    const panel = document.getElementById('moniac');
    if (!canvas || !panel) return;

    const ctx = canvas.getContext('2d');
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

    const COLORS = {
        income: { fill: '#ff9a3c', glow: 'rgba(255, 154, 60, 0.65)', pipe: '#ff9a3c' },
        consume: { fill: '#ff4d8b', glow: 'rgba(255, 77, 139, 0.55)', pipe: '#ff4d8b' },
        tax: { fill: '#ff5c00', glow: 'rgba(255, 92, 0, 0.5)', pipe: '#ff5c00' },
        save: { fill: '#c8a890', glow: 'rgba(200, 168, 144, 0.45)', pipe: '#8a6e58' },
        gov: { fill: '#ffc857', glow: 'rgba(255, 200, 87, 0.55)', pipe: '#ffc857' },
        invest: { fill: '#ffb347', glow: 'rgba(255, 179, 71, 0.55)', pipe: '#ffb347' },
    };

    const state = { Y: 0.42, C: 0.3, T: 0.18, S: 0.15, G: 0.2, I: 0.22 };
    let particles = [];
    let w = 800;
    let h = 520;
    let dpr = 1;
    let running = true;
    let layout = null;

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

        const bnpIdx = Math.round(state.Y * 100);
        const unemp = (1 - state.Y) * 11.5 + 2.2;
        const infl = Math.max(0, (state.Y - 0.62) * 52 + (c.gov - 0.35) * 12);

        if (hud.bnp) hud.bnp.textContent = String(bnpIdx).padStart(3, '0');
        if (hud.ledighet) hud.ledighet.textContent = unemp.toFixed(1) + '%';
        if (hud.inflasjon) hud.inflasjon.textContent = infl.toFixed(1) + '%';

        if (hud.status) {
            if (state.Y > 0.88) hud.status.textContent = 'OVEROPPHETET — VENTILER ÅPNER';
            else if (state.Y < 0.28) hud.status.textContent = 'DEFLATORISK SJOK — PUMPE TOM';
            else if (c.rate > 0.055 && state.I < 0.15) hud.status.textContent = 'PENGEPOLITISK BREMS';
            else hud.status.textContent = 'NOMINAL SIRKULASJON STABIL';
        }

        return { flows: computeFlows(c), targetY };
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

    function buildLayout(width, height) {
        const cx = width * 0.5;
        const tw = Math.min(118, width * 0.14);
        const th = Math.min(150, height * 0.28);
        const tank = (id, x, y, label, sub, colorKey) => ({
            id, x, y, w: tw, h: th, label, sub, color: COLORS[colorKey],
        });

        return {
            tanks: {
                Y: tank('Y', cx - tw / 2, height * 0.36, 'Y', 'NASJONALINNTEKT', 'income'),
                C: tank('C', cx - tw * 2.1, height * 0.68, 'C', 'FORBRUK', 'consume'),
                T: tank('T', cx + tw * 1.1, height * 0.12, 'T', 'SKATT', 'tax'),
                S: tank('S', cx + tw * 1.1, height * 0.68, 'S', 'SPARING', 'save'),
                G: tank('G', cx - tw * 2.1, height * 0.12, 'G', 'OFFENTLIG', 'gov'),
                I: tank('I', cx + tw * 1.1, height * 0.36, 'I', 'INVESTERING', 'invest'),
            },
            pipes: [
                { from: 'G', to: 'Y', color: COLORS.gov },
                { from: 'I', to: 'Y', color: COLORS.invest },
                { from: 'Y', to: 'C', color: COLORS.consume },
                { from: 'Y', to: 'T', color: COLORS.tax },
                { from: 'Y', to: 'S', color: COLORS.save },
                { from: 'C', to: 'Y', color: COLORS.consume, curved: true },
            ],
        };
    }

    function tankPort(tank, side) {
        const midX = tank.x + tank.w / 2;
        const midY = tank.y + tank.h / 2;
        switch (side) {
            case 'top': return { x: midX, y: tank.y };
            case 'bottom': return { x: midX, y: tank.y + tank.h };
            case 'left': return { x: tank.x, y: midY };
            case 'right': return { x: tank.x + tank.w, y: midY };
            default: return { x: midX, y: midY };
        }
    }

    function pipeEndpoints(pipe) {
        const tanks = layout.tanks;
        const a = tanks[pipe.from];
        const b = tanks[pipe.to];
        if (!a || !b) return null;

        let start = tankPort(a, 'bottom');
        let end = tankPort(b, 'top');

        if (pipe.from === 'G') start = tankPort(a, 'right');
        if (pipe.from === 'I') start = tankPort(a, 'left');
        if (pipe.to === 'Y' && pipe.from === 'G') end = tankPort(b, 'left');
        if (pipe.to === 'Y' && pipe.from === 'I') end = tankPort(b, 'right');
        if (pipe.from === 'Y' && pipe.to === 'C') {
            start = tankPort(a, 'left');
            end = tankPort(b, 'top');
        }
        if (pipe.from === 'Y' && pipe.to === 'T') {
            start = tankPort(a, 'top');
            end = tankPort(b, 'bottom');
        }
        if (pipe.from === 'Y' && pipe.to === 'S') {
            start = tankPort(a, 'right');
            end = tankPort(b, 'top');
        }
        if (pipe.from === 'C' && pipe.to === 'Y') {
            start = tankPort(a, 'right');
            end = tankPort(b, 'bottom');
        }

        return { start, end, curved: pipe.curved };
    }

    function spawnParticles(flows) {
        const cap = window.innerWidth < 768 ? 90 : 160;
        const flowMap = {
            'G-Y': flows.gToY,
            'I-Y': flows.iToY,
            'Y-C': flows.yToC,
            'Y-T': flows.yToT,
            'Y-S': flows.yToS,
            'C-Y': flows.cToY,
        };

        layout.pipes.forEach((pipe) => {
            const key = pipe.from + '-' + pipe.to;
            const rate = flowMap[key] || 0.05;
            if (Math.random() < rate * 2.8 && particles.length < cap) {
                const ep = pipeEndpoints(pipe);
                if (!ep) return;
                particles.push({
                    pipeKey: key,
                    t: 0,
                    speed: 0.35 + rate * 0.9 + Math.random() * 0.25,
                    color: pipe.color.pipe,
                    curved: ep.curved,
                });
            }
        });
    }

    function drawTank(tank, level) {
        const { x, y, w, h, label, sub, color } = tank;
        const pad = 5;
        const innerX = x + pad;
        const innerY = y + pad;
        const innerW = w - pad * 2;
        const innerH = h - pad * 2;
        const lvl = Math.max(0.06, Math.min(0.96, level));

        ctx.save();

        // Glass frame
        ctx.strokeStyle = 'rgba(255, 154, 60, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = color.glow;
        ctx.shadowBlur = 14;
        ctx.strokeRect(x, y, w, h);

        // Inner glass
        const glass = ctx.createLinearGradient(x, y, x + w, y + h);
        glass.addColorStop(0, 'rgba(36, 18, 12, 0.75)');
        glass.addColorStop(1, 'rgba(20, 10, 8, 0.9)');
        ctx.fillStyle = glass;
        ctx.fillRect(innerX, innerY, innerW, innerH);

        // Liquid
        const liquidH = innerH * lvl;
        const ly = innerY + innerH - liquidH;
        const lg = ctx.createLinearGradient(0, ly, 0, ly + liquidH);
        lg.addColorStop(0, color.fill);
        lg.addColorStop(1, 'rgba(10, 6, 4, 0.85)');
        ctx.fillStyle = lg;
        ctx.globalAlpha = 0.88;
        ctx.fillRect(innerX + 1, ly, innerW - 2, liquidH);
        ctx.globalAlpha = 1;

        // Surface shimmer
        ctx.strokeStyle = color.fill;
        ctx.lineWidth = 1;
        ctx.shadowColor = color.glow;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(innerX + 4, ly + 2);
        ctx.lineTo(innerX + innerW - 4, ly + 2);
        ctx.stroke();

        // Scale ticks
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 154, 60, 0.15)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 5; i++) {
            const ty = innerY + (innerH / 5) * i;
            ctx.beginPath();
            ctx.moveTo(x + w - 12, ty);
            ctx.lineTo(x + w - 5, ty);
            ctx.stroke();
        }

        // Labels
        ctx.font = "600 13px 'Orbitron', sans-serif";
        ctx.fillStyle = '#fbe4cf';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 8;
        ctx.shadowColor = color.glow;
        ctx.fillText(label, x + w / 2, y - 10);

        ctx.font = "10px 'Share Tech Mono', monospace";
        ctx.fillStyle = '#8a6e58';
        ctx.shadowBlur = 0;
        ctx.fillText(sub, x + w / 2, y - 24);

        ctx.restore();
    }

    function drawPipe(pipe) {
        const ep = pipeEndpoints(pipe);
        if (!ep) return;
        const { start, end, curved } = ep;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 154, 60, 0.12)';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        if (curved) {
            const cpx = (start.x + end.x) / 2 + 40;
            const cpy = (start.y + end.y) / 2;
            ctx.quadraticCurveTo(cpx, cpy, end.x, end.y);
        } else {
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            ctx.lineTo(midX, start.y);
            ctx.lineTo(midX, end.y);
            ctx.lineTo(end.x, end.y);
        }
        ctx.stroke();

        ctx.strokeStyle = pipe.color.pipe;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2;
        ctx.shadowColor = pipe.color.glow;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        if (curved) {
            const cpx = (start.x + end.x) / 2 + 40;
            const cpy = (start.y + end.y) / 2;
            ctx.quadraticCurveTo(cpx, cpy, end.x, end.y);
        } else {
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            ctx.lineTo(midX, start.y);
            ctx.lineTo(midX, end.y);
            ctx.lineTo(end.x, end.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    function particlePos(pipeKey, t, curved) {
        const pipe = layout.pipes.find((p) => p.from + '-' + p.to === pipeKey);
        if (!pipe) return null;
        const ep = pipeEndpoints(pipe);
        if (!ep) return null;
        const { start, end } = ep;

        if (curved) {
            const cpx = (start.x + end.x) / 2 + 40;
            const cpy = (start.y + end.y) / 2;
            const u = 1 - t;
            return {
                x: u * u * start.x + 2 * u * t * cpx + t * t * end.x,
                y: u * u * start.y + 2 * u * t * cpy + t * t * end.y,
            };
        }

        const midX = (start.x + end.x) / 2;
        if (t < 0.5) {
            const local = t * 2;
            return { x: start.x + (midX - start.x) * local, y: start.y };
        }
        const local = (t - 0.5) * 2;
        return { x: midX + (end.x - midX) * local, y: start.y + (end.y - start.y) * local };
    }

    function drawParticles(dt) {
        particles = particles.filter((p) => {
            p.t += p.speed * dt;
            if (p.t >= 1) return false;
            const pos = particlePos(p.pipeKey, p.t, p.curved);
            if (!pos) return false;

            ctx.save();
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10;
            ctx.globalAlpha = 0.55 + Math.sin(p.t * Math.PI) * 0.35;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return true;
        });
    }

    function drawFrame() {
        ctx.clearRect(0, 0, w, h);

        // Panel grid
        ctx.strokeStyle = 'rgba(255, 154, 60, 0.06)';
        ctx.lineWidth = 1;
        const gs = 32;
        for (let x = 0; x < w; x += gs) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += gs) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Title watermark
        ctx.font = "11px 'Share Tech Mono', monospace";
        ctx.fillStyle = 'rgba(255, 154, 60, 0.25)';
        ctx.textAlign = 'left';
        ctx.fillText('MONIAC MK.II — HYDRAULISK SIRKULASJON', 16, 22);

        layout.pipes.forEach(drawPipe);

        const levels = { Y: state.Y, C: state.C, T: state.T, S: state.S, G: state.G, I: state.I };
        Object.values(layout.tanks).forEach((t) => drawTank(t, levels[t.id] || 0.2));

        // Central hub ring
        const hub = layout.tanks.Y;
        ctx.strokeStyle = 'rgba(255, 154, 60, 0.4)';
        ctx.lineWidth = 1;
        ctx.shadowColor = 'rgba(255, 154, 60, 0.5)';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(hub.x + hub.w / 2, hub.y + hub.h / 2, hub.w * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    let last = performance.now();

    function loop(now) {
        if (!running) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        const c = readControls();
        updateLabels(c);
        const { flows } = stepPhysics(c, dt);
        spawnParticles(flows);
        drawFrame();
        drawParticles(dt);

        requestAnimationFrame(loop);
    }

    function resize() {
        const rect = canvas.parentElement.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = Math.max(320, rect.width);
        h = Math.max(380, Math.min(560, w * 0.62));
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        layout = buildLayout(w, h);
    }

    Object.values(controls).forEach((el) => {
        el.addEventListener('input', () => {
            const c = readControls();
            updateLabels(c);
        });
    });

    document.getElementById('moniac-reset')?.addEventListener('click', () => {
        controls.gov.value = 35;
        controls.rate.value = 4.5;
        controls.tax.value = 28;
        controls.mpc.value = 72;
        state.Y = 0.42;
        state.C = 0.3;
        state.T = 0.18;
        state.S = 0.15;
        state.G = 0.2;
        state.I = 0.22;
        particles = [];
        updateLabels(readControls());
    });

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) running = false;

    reducedMotion.addEventListener?.('change', (e) => {
        running = !e.matches;
        if (running) {
            last = performance.now();
            requestAnimationFrame(loop);
        }
    });

    const observer = new IntersectionObserver(
        (entries) => {
            const visible = entries[0]?.isIntersecting;
            if (visible && !running && !reducedMotion.matches) {
                running = true;
                last = performance.now();
                requestAnimationFrame(loop);
            } else if (!visible) {
                running = false;
            }
        },
        { threshold: 0.12 }
    );
    observer.observe(panel);

    resize();
    updateLabels(readControls());
    requestAnimationFrame(loop);

    let resizeTO;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTO);
        resizeTO = setTimeout(resize, 120);
    });
})();
