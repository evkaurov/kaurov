/*
 * Прототип: блоки сайта проявляются через «глюк» из прямоугольников по сетке.
 * Блок входит в экран -> прямоугольники закрывают его -> уходят кусками, под ними контент.
 * Сетка глюка привязана к краям самого блока.
 * Поверх: мелкие вкрапления второго цвета, белые точки и крестики, абстрактные линии под 30°.
 * При прокрутке по свободным местам пробегают плашки и линии. При наведении курсора блок коротко глючит.
 */
(() => {
    'use strict';

    // ---- Настройки (можно крутить) ----
    const COLORS = { blue: '#3353c4', orange: '#ea4a15' }; // цвета из Work-n-Break
    const WHITE = '#f5f2f0';
    const GRAY = '#262626';
    const DARK = '#0d0d0d';
    const CELL = window.innerWidth < 600 ? 20 : 28; // примерный размер клетки, px
    const HOVER_DUR = 380;      // длительность глюка при наведении, мс
    const DUR = 720;            // длительность проявления блока, мс
    const STEP = 45;            // шаг «кадра» — движение рывками, мс
    const STAGGER = 70;         // задержка между блоками, которые вошли одновременно, мс
    const SPARK_EVERY = 140;    // один элемент на столько px прокрутки
    const C30 = Math.cos(Math.PI / 6); // изометрия: оси под 30°
    const SELECTOR = [
        '.avatar', '.header-info h1', '.header-info .subtitle', '.about-text',
        '.section-title-wrapper', '.showreel-text', '.video-embed', '.watch-on',
        '.content-text', '.design-tools-intro', '.tool-card',
        '.contact-info', '.social-section'
    ].join(',');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const store = {
        get(k, d) { try { return localStorage.getItem('gx-' + k) || d; } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem('gx-' + k, v); } catch (e) { /* не страшно */ } }
    };
    const state = {
        base: store.get('base', 'blue'),  // основной цвет; второй цвет идёт во вкрапления
        mode: store.get('mode', 'cover')  // cover — закрывает блок целиком; light — только часть плашек
    };
    if (!COLORS[state.base]) state.base = 'blue';
    const accent = () => COLORS[state.base];
    const accent2 = () => COLORS[state.base === 'blue' ? 'orange' : 'blue'];

    const root = document.documentElement;
    root.style.setProperty('--gx-cell', CELL + 'px');
    root.style.setProperty('--gx-accent', accent());

    // ---- Холст поверх страницы ----
    const canvas = document.createElement('canvas');
    canvas.className = 'gx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let vw = 0, vh = 0;

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        vw = window.innerWidth;
        vh = window.innerHeight;
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
        canvas.style.width = vw + 'px';   // размер в px: на телефоне 100vh больше видимой области
        canvas.style.height = vh + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', () => { resize(); kick(); });

    // ---- Блоки ----
    const items = [];
    const byEl = new Map();
    document.querySelectorAll(SELECTOR).forEach((el, i) => {
        const it = { el, id: i, dur: DUR, lastHover: 0, active: false, shown: false, t0: 0, rects: [], fx: [], cols: 1, rows: 1 };
        items.push(it);
        byEl.set(el, it);
        if (state.mode === 'cover') el.classList.add('gx-hidden');
    });

    const rnd = Math.random;
    const irnd = (n) => Math.floor(rnd() * n);
    const pick = (a) => a[irnd(a.length)];

    // Режем прямоугольник блока на куски по клеткам
    function split(x, y, w, h, out, depth) {
        const stop = w * h <= 2 || depth > 5 || (depth > 1 && rnd() < 0.2);
        if (stop) { out.push({ x, y, w, h }); return; }
        const alongWidth = w >= h ? rnd() < 0.7 : rnd() < 0.3;
        if (alongWidth && w > 1) {
            const k = 1 + irnd(w - 1);
            split(x, y, k, h, out, depth + 1);
            split(x + k, y, w - k, h, out, depth + 1);
        } else if (h > 1) {
            const k = 1 + irnd(h - 1);
            split(x, y, w, k, out, depth + 1);
            split(x, y + k, w, h - k, out, depth + 1);
        } else {
            out.push({ x, y, w, h });
        }
    }

    // Абстрактная линия: под 30° вверх/вниз или вертикальная; иногда очень длинная
    function makeLine(longChance) {
        const long = rnd() < (longChance === undefined ? 0.25 : longChance);
        return {
            ang: pick(['up', 'up', 'down', 'down', 'vert']),
            len: CELL * (long ? 12 + irnd(34) : 2 + irnd(6)),
            style: pick(['single', 'single', 'pair', 'dash']),
            col: rnd() < 0.72 ? 'w' : (rnd() < 0.7 ? 'a' : 'b'),
            dot: rnd() < 0.4,
            dir: rnd() < 0.5 ? 1 : -1
        };
    }

    // Линия в случайном месте экрана, к блокам не привязана
    function spawnFreeLine(t0, longChance) {
        if (sparks.length > 22) return;
        sparks.push({
            kind: 'line', free: true,
            c: irnd(Math.ceil(vw / CELL)),
            r: Math.floor((window.scrollY + rnd() * vh) / CELL),
            t0, life: 160 + rnd() * 260, L: makeLine(longChance)
        });
    }

    // Мелкие детали поверх блока: вкрапления, точки, крестики, изометрия
    function makeFx(cols, rows) {
        const fx = [];
        const big = cols * rows > 12;
        const add = (type, n, lenMin, lenVar, extra) => {
            for (let i = 0; i < n; i++) {
                fx.push(Object.assign({
                    type,
                    x: irnd(cols + 1), y: irnd(rows + 1),   // узел сетки блока
                    tIn: 0.05 + rnd() * 0.75,
                    len: lenMin + rnd() * lenVar
                }, extra ? extra() : null));
            }
        };
        add('speck', (big ? 3 : 1) + irnd(3), 0.1, 0.14, () => ({ s: Math.round(CELL / pick([4, 4, 2])) }));
        add('dot', (big ? 4 : 2) + irnd(4), 0.15, 0.2);
        add('cross', big ? 1 + irnd(3) : irnd(2), 0.15, 0.2);
        add('line', big ? 1 + irnd(3) : (rnd() < 0.45 ? 1 : 0), 0.14, 0.18, () => {
            // линия стартует с края блока или чуть снаружи
            const onSide = rnd() < 0.5;
            return {
                x: onSide ? pick([-1, 0, cols, cols + 1]) : irnd(cols + 1),
                y: onSide ? irnd(rows + 1) : pick([-1, 0, rows, rows + 1]),
                L: makeLine()
            };
        });
        return fx;
    }

    function start(it, delay, hover) {
        const r = it.el.getBoundingClientRect();
        if (!r.width || !r.height) { reveal(it); return; }
        // сетка блока: целое число клеток точно от края до края
        it.cols = Math.max(1, Math.round(r.width / CELL));
        it.rows = Math.max(1, Math.round(r.height / CELL));

        let rects = [];
        split(0, 0, it.cols, it.rows, rects, 0);
        if (hover) rects = rects.filter((q) => rnd() < 0.3 && (it.cols * it.rows <= 12 || q.w * q.h <= it.cols * it.rows * 0.15));      // при наведении — только часть плашек
        else if (state.mode === 'light') rects = rects.filter(() => rnd() < 0.4);
        rects.forEach((q) => {
            q.tIn = rnd() * (hover ? 0.5 : 0.28);
            q.tGray = hover ? q.tIn + 0.15 + rnd() * 0.25 : 0.45 + rnd() * 0.4;
            q.tOut = rnd() < 0.3 ? Math.min(1, q.tGray + 0.1 + rnd() * 0.15) : q.tGray;
            q.mark = q.w >= 3 && rnd() < 0.3;
        });
        it.rects = rects;
        it.fx = makeFx(it.cols, it.rows);
        it.dur = hover ? HOVER_DUR : DUR;
        it.t0 = performance.now() + delay;
        it.active = true;
        // пара линий где-то ещё на экране
        const nFree = hover ? (rnd() < 0.5 ? 1 : 0) : irnd(3);
        for (let i = 0; i < nFree; i++) spawnFreeLine(it.t0 + rnd() * it.dur * 0.7);
        kick();
    }

    function reveal(it) {
        it.shown = true;
        it.el.classList.remove('gx-hidden');
    }

    function reset(it) {
        it.active = false;
        it.shown = false;
        if (state.mode === 'cover') it.el.classList.add('gx-hidden');
    }

    // Блок вошёл в экран — запускаем; полностью ушёл — готовим к повтору
    const io = new IntersectionObserver((entries) => {
        let n = 0;
        entries.forEach((e) => {
            const it = byEl.get(e.target);
            if (!it) return;
            if (e.isIntersecting && e.intersectionRatio >= 0.15) {
                if (!it.active && !it.shown) start(it, n++ * STAGGER);
            } else if (!e.isIntersecting) {
                reset(it);
            }
        });
    }, { threshold: [0, 0.15] });
    items.forEach((it) => io.observe(it.el));

    // ---- Элементы, которые пробегают при прокрутке ----
    const sparks = [];
    let lastY = window.scrollY, acc = 0;

    function spawnSpark(now) {
        if (sparks.length > 16) return;
        const boxes = items.map((it) => it.el.getBoundingClientRect());
        const roll = rnd();
        const kind = roll < 0.4 ? 'bar' : roll < 0.72 ? 'line' : roll < 0.87 ? 'speck' : 'cross';
        if (kind === 'line') { spawnFreeLine(now); return; }
        for (let tries = 0; tries < 8; tries++) {
            const w = kind === 'bar' ? 1 + irnd(3) : 2;
            const c = irnd(Math.ceil(vw / CELL) - w);
            const r = Math.floor((window.scrollY + rnd() * vh) / CELL);
            const x = c * CELL, y = r * CELL - window.scrollY;
            const hit = boxes.some((b) => x < b.right && x + w * CELL > b.left && y < b.bottom && y + CELL > b.top);
            if (hit) continue;
            sparks.push({
                kind, c, r, w, t0: now, life: 180 + rnd() * 240, gray: rnd() < 0.35,
                sz: Math.round(CELL / pick([4, 2]))
            });
            return;
        }
    }

    window.addEventListener('scroll', () => {
        const y = window.scrollY;
        acc += Math.abs(y - lastY);
        lastY = y;
        const now = performance.now();
        while (acc > SPARK_EVERY) { acc -= SPARK_EVERY; spawnSpark(now); }
        kick();
    }, { passive: true });

    // ---- Отрисовка ----
    function line(x1, y1, x2, y2) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    function drawLine(x, y, L) {
        const dx = L.ang === 'vert' ? 0 : C30 * L.len * L.dir;
        const dy = L.ang === 'vert' ? -L.len * L.dir : (L.ang === 'up' ? -0.5 : 0.5) * L.len;
        const col = L.col === 'w' ? WHITE : L.col === 'a' ? accent() : accent2();
        ctx.lineWidth = 1;
        ctx.strokeStyle = col;
        if (L.style === 'dash') ctx.setLineDash([6, 6]);
        line(x, y, x + dx, y + dy);
        ctx.setLineDash([]);
        if (L.style === 'pair') {
            const ox = L.ang === 'vert' ? 6 : 0, oy = L.ang === 'vert' ? 0 : 6;
            line(x + ox, y + oy, x + ox + dx * 0.6, y + oy + dy * 0.6);
        }
        if (L.dot) {
            ctx.fillStyle = col;
            ctx.fillRect(Math.round(x + dx) - 1, Math.round(y + dy) - 1, 3, 3);
        }
    }

    function drawCross(x, y) {
        ctx.fillStyle = WHITE;
        ctx.fillRect(x - 4, y, 9, 1);
        ctx.fillRect(x, y - 4, 1, 9);
    }

    let running = false;
    function kick() {
        if (!running) { running = true; requestAnimationFrame(frame); }
    }

    function frame(now) {
        const q = Math.floor(now / STEP) * STEP; // время рывками
        const tick = Math.floor(now / STEP);
        const a1 = accent(), a2 = accent2();
        let busy = false;
        ctx.clearRect(0, 0, vw, vh);

        for (const it of items) {
            if (!it.active) continue;
            const t = (q - it.t0) / it.dur;
            if (t < 0) { busy = true; continue; }
            if (t >= 0.38 && !it.shown) reveal(it);
            if (t >= 1) { it.active = false; continue; }
            busy = true;
            const b = it.el.getBoundingClientRect();
            if (b.bottom < -CELL * 2 || b.top > vh + CELL * 2) continue;
            const cw = b.width / it.cols, ch = b.height / it.rows;
            const gx = (c) => Math.round(b.left + c * cw);
            const gy = (r) => Math.round(b.top + r * ch);

            for (const k of it.rects) {
                if (t < k.tIn || t >= k.tOut) continue;
                const x = gx(k.x), y = gy(k.y);
                const isAccent = t < k.tGray;
                ctx.fillStyle = isAccent ? a1 : GRAY;
                ctx.fillRect(x, y, gx(k.x + k.w) - x, gy(k.y + k.h) - y);
                if (isAccent && k.mark) {
                    ctx.fillStyle = DARK;
                    ctx.fillRect(x + 6, y + 6, 4, 4);
                    ctx.font = '7px Consolas, monospace';
                    ctx.fillText('KV-' + String(it.id * 37 + k.x * 7 + k.y).padStart(4, '0'), x + 14, y + 11);
                }
            }

            for (const f of it.fx) {
                if (t < f.tIn || t >= f.tIn + f.len) continue;
                const x = gx(f.x), y = gy(f.y);
                if (f.type === 'speck') {
                    ctx.fillStyle = a2;
                    ctx.fillRect(x, y, f.s, f.s);
                } else if (f.type === 'dot') {
                    ctx.fillStyle = WHITE;
                    ctx.fillRect(x - 1, y - 1, 3, 3);
                } else if (f.type === 'cross') {
                    drawCross(x, y);
                } else if ((tick + f.x) % 4 !== 3) { // линия чуть мигает
                    drawLine(x + 0.5, y + 0.5, f.L);
                }
            }
        }

        for (let i = sparks.length - 1; i >= 0; i--) {
            const s = sparks[i];
            const t = (q - s.t0) / s.life;
            if (t >= 1) { sparks.splice(i, 1); continue; }
            busy = true;
            if (t < 0) continue;
            const x = s.c * CELL, y = s.r * CELL - window.scrollY;
            if (s.kind === 'bar') {
                ctx.fillStyle = s.gray || t > 0.6 ? GRAY : a1;
                ctx.fillRect(x, y, s.w * CELL, CELL);
            } else if (s.kind === 'speck') {
                ctx.fillStyle = a2;
                ctx.fillRect(x, y, s.sz, s.sz);
            } else if (s.kind === 'cross') {
                drawCross(x, y);
            } else if ((tick + s.c) % 4 !== 3) {
                drawLine(x + 0.5, y + 0.5, s.L);
            }
        }

        if (busy) requestAnimationFrame(frame);
        else running = false;
    }

    // ---- Глюк при наведении курсора на блок ----
    let hoverItem = null;
    document.addEventListener('mouseover', (e) => {
        const el = e.target.closest ? e.target.closest(SELECTOR) : null;
        const it = el ? byEl.get(el) : null;
        if (it === hoverItem) return;
        hoverItem = it;
        if (!it || it.active || !it.shown) return;
        const now = performance.now();
        if (now - it.lastHover < 700) return;
        it.lastHover = now;
        start(it, 0, true);
    });

    // ---- Пульт прототипа ----
    function replay() {
        let n = 0;
        items.forEach((it) => {
            const b = it.el.getBoundingClientRect();
            if (b.bottom <= 0 || b.top >= vh) return;
            reset(it);
            start(it, n++ * STAGGER);
        });
    }

    const panel = document.createElement('div');
    panel.className = 'gx-panel';
    panel.innerHTML =
        '<div class="gx-panel__group"><button data-base="blue">Blue</button><button data-base="orange">Orange</button></div>' +
        '<div class="gx-panel__group"><button data-mode="cover">Cover</button><button data-mode="light">Light</button></div>' +
        '<div class="gx-panel__group"><button data-replay>Replay</button></div>';
    document.body.appendChild(panel);

    function syncPanel() {
        panel.querySelectorAll('[data-base]').forEach((b) => b.classList.toggle('is-on', b.dataset.base === state.base));
        panel.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === state.mode));
    }
    syncPanel();

    panel.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.base) {
            state.base = b.dataset.base;
            store.set('base', state.base);
            root.style.setProperty('--gx-accent', accent());
        }
        if (b.dataset.mode) {
            state.mode = b.dataset.mode;
            store.set('mode', state.mode);
            if (state.mode === 'light') items.forEach((it) => it.el.classList.remove('gx-hidden'));
        }
        syncPanel();
        replay();
    });
})();
