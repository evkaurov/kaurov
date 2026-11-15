/*
 * Глюк-эффект сайта kaurov.net. Исходник и прототип с пультом —
 * D:\Dropbox\Coding\25-11-13 Website kaurov.net\glitch-prototype-anim\
 *
 * Блоки сайта проявляются через «глюк» из прямоугольников по сетке.
 * Блок входит в экран -> прямоугольники закрывают его -> уходят кусками, под ними контент.
 * Сетка глюка привязана к краям самого блока.
 * Поверх: мелкие вкрапления второго цвета, белые точки и крестики, абстрактные линии под 30°.
 * При прокрутке по свободным местам пробегают плашки и линии. При наведении курсора блок коротко глючит.
 *
 * Вариант «anim»: доля ANIM_SHARE плашек и линий не мигает, а движется плавно
 * по кривым из After Effects (композиции e-1 и e-2): голова вырастает с резким стартом
 * и торможением, потом хвост уходит за ней с разгоном. Остальные — рывками, как раньше.
 */
(() => {
    'use strict';

    // ---- Настройки (можно крутить) ----
    const COLORS = { blue: '#3353c4', orange: '#ea4a15' }; // цвета из Work-n-Break
    const WHITE = '#f5f2f0';
    // «погасший» прямоугольник — цветом фона страницы
    const GRAY = getComputedStyle(document.body).backgroundColor || '#151515';
    const DARK = '#0d0d0d';
    const CELL = window.innerWidth < 600 ? 20 : 28; // примерный размер клетки, px
    const HOVER_DUR = 380;      // длительность глюка при наведении, мс
    const DUR = 720;            // длительность проявления блока, мс
    const STEP = 45;            // шаг «кадра» — движение рывками, мс
    const STAGGER = 70;         // задержка между блоками, которые вошли одновременно, мс
    const SPARK_EVERY = 140;    // один элемент на столько px прокрутки
    const MARGIN = 160;         // запас холста за краями экрана, px
    const C30 = Math.cos(Math.PI / 6); // изометрия: оси под 30°
    // Анимированные элементы (вариант с движением, по композициям e-1 и e-2 из AE)
    const ANIM_SHARE = 0.18;    // доля анимированных плашек и линий: 0.10–0.25
    const ANIM_PHASE = 320;     // длительность одной фазы (вырастает / уходит), мс; в AE — 400 мс
    // Плашки едут только по вертикали, в сторону прокрутки: листаешь вниз — сверху вниз,
    // листаешь вверх — снизу вверх. -1 — наоборот.
    const ANIM_FOLLOW = 1;
    const NEAR = 4;             // свободные линии и плашки — не дальше стольких клеток от глючащего блока
    const FREE_MAX = 12;        // самая длинная свободная линия, клеток (было до 46)

    // Кривая cubic-bezier, как в CSS: x — время, y — значение
    function bezier(x1, y1, x2, y2) {
        const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
        const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
        return (x) => {
            if (x <= 0) return 0;
            if (x >= 1) return 1;
            let lo = 0, hi = 1, s = x;
            for (let i = 0; i < 20; i++) {
                s = (lo + hi) / 2;
                if (((ax * s + bx) * s + cx) * s < x) lo = s; else hi = s;
            }
            return ((ay * s + by) * s + cy) * s;
        };
    }
    // Из ключей AE: первая фаза — резкий старт и долгое торможение (Out: influence 0,1 %, In: 100 %)
    const EASE_GROW = bezier(0, 0, 0, 1);
    // вторая фаза — медленный старт и разгон до конца (Out: influence 100 %, In: 0,1 %)
    const EASE_GO = bezier(1, 0, 1, 1);
    // Видимый кусок [хвост, голова] в долях длины: голова вырастает, потом хвост догоняет
    function trim(tau, life) {
        const p = Math.min(ANIM_PHASE, life / 2);
        return [EASE_GO((tau - (life - p)) / p), EASE_GROW(tau / p)];
    }
    const SELECTOR = [
        '.sidebar .logo', '.nav-item', '.mobile-topbar__logo', '.mobile-menu-toggle',
        '.avatar', '.header-info h1', '.header-info .subtitle', '.about-text',
        '.section-title-wrapper', '.showreel-text', '.video-embed', '.watch-on',
        '.content-text', '.design-tools-intro', '.tool-card',
        '.contact-info', '.social-section',
        // страницы плагинов
        '.cta-row', '.section .support-intro', '.section .download-card',
        // страница 404
        '.not-found .error-video', '.not-found__headline', '.not-found__link', '.not-found__logo'
    ].join(',');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Зафиксировано 14.11.2026: основной цвет синий, режим Cover (блок закрыт целиком)
    let scrollDir = 1; // последнее направление прокрутки: 1 — вниз, -1 — вверх
    const state = { base: 'blue', mode: 'cover' };
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
    let vw = 0, vh = 0, ch = 0;   // ch — высота холста: экран + запас сверху и снизу
    let oy = 0;                   // сдвиг: координата экрана -> координата холста
    let dpr = 1;                  // пикселей холста на 1 px страницы
    // Края плашек — точно по пикселям экрана. Иначе при масштабе 125 % / 150 %
    // край попадает на полпикселя, сглаживается, и между соседними плашками виден тонкий зазор.
    const snap = (v) => Math.round(v * dpr) / dpr;
    const snapScreen = (v) => { const r = window.devicePixelRatio || 1; return Math.round(v * r) / r; };

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        vw = window.innerWidth;
        vh = window.innerHeight;
        canvas.width = Math.round(vw * dpr);
        ch = vh + MARGIN * 2;
        canvas.height = Math.round(ch * dpr);
        // размер в px: на телефоне 100vh больше видимой области; ровно canvas.width / dpr, без растяжения
        canvas.style.width = canvas.width / dpr + 'px';
        canvas.style.height = canvas.height / dpr + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', () => { resize(); kick(); });

    // ---- Блоки ----
    const items = [];
    const byEl = new Map();
    function collect() {
        const fresh = [];
        document.querySelectorAll(SELECTOR).forEach((el) => {
            if (byEl.has(el)) return;
            const i = items.length;
            const it = { el, id: i, dur: DUR, lastHover: 0, active: false, shown: false, t0: 0, rects: [], fx: [], cols: 1, rows: 1 };
            items.push(it);
            byEl.set(el, it);
            if (state.mode === 'cover') el.classList.add('gx-hidden');
            fresh.push(it);
        });
        return fresh;
    }
    collect();

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
        const L = {
            ang: pick(['up', 'up', 'down', 'down', 'vert']),
            len: CELL * (long ? 12 + irnd(34) : 2 + irnd(6)),
            style: pick(['single', 'single', 'pair', 'dash']),
            col: rnd() < 0.72 ? 'w' : (rnd() < 0.7 ? 'a' : 'b'),
            dot: rnd() < 0.4,
            gap: 16 + irnd(20),   // зазор между двумя линиями в паре, px
            dir: rnd() < 0.5 ? 1 : -1,
            anim: rnd() < ANIM_SHARE   // прорисовывается от начала к концу и убирается (e-2)
        };
        // Анимированная линия рисуется в сторону прокрутки: листаешь вниз — от верхнего конца к нижнему.
        // Если линия идёт вверх, рисуем её с другого конца (rev), сама линия та же.
        const goesDown = L.ang === 'vert' ? L.dir < 0 : L.ang === 'down';
        L.rev = L.anim && goesDown !== (scrollDir * ANIM_FOLLOW > 0);
        return L;
    }

    // Свободные элементы держатся рядом с блоком, который сейчас глючит:
    // случайная клетка в рамке вокруг блока шириной NEAR клеток.
    function nearCell(it, w) {
        const b = it.el.getBoundingClientRect();
        const pad = NEAR * CELL;
        const x = b.left - pad + rnd() * (b.width + 2 * pad);
        const y = Math.min(vh, Math.max(0, b.top - pad + rnd() * (b.height + 2 * pad)));
        const maxC = Math.ceil(vw / CELL) - (w || 1);
        return {
            c: Math.max(0, Math.min(maxC, Math.floor(x / CELL))),
            r: Math.floor((window.scrollY + y) / CELL)
        };
    }

    // Блок-якорь: тот, что сейчас глючит на экране; если таких нет — любой видимый
    function pickAnchor() {
        const onScreen = (it) => {
            const b = it.el.getBoundingClientRect();
            return b.width > 0 && b.bottom > 0 && b.top < vh;
        };
        const busy = items.filter((it) => it.active && onScreen(it));
        if (busy.length) return pick(busy);
        const seen = items.filter(onScreen);
        return seen.length ? pick(seen) : null;
    }

    // Линия рядом с блоком (it), к самому блоку не привязана
    function spawnFreeLine(t0, longChance, it) {
        if (sparks.length > 22) return;
        const L = makeLine(longChance);
        // длинная свободная линия — не длиннее FREE_MAX клеток, чтобы не тянулась через весь экран
        if (L.len > FREE_MAX * CELL) L.len = CELL * (6 + irnd(FREE_MAX - 5));
        const anchor = it || pickAnchor();
        const cell = anchor ? nearCell(anchor) : {
            c: irnd(Math.ceil(vw / CELL)),
            r: Math.floor((window.scrollY + rnd() * vh) / CELL)
        };
        sparks.push({
            kind: 'line', free: true, c: cell.c, r: cell.r,
            t0, life: L.anim ? 2 * ANIM_PHASE : 160 + rnd() * 260, L
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

    // страховка для сайта: если глюк на блоке сломается, блок всё равно покажется
    function start(it, delay, hover) {
        try { startGlitch(it, delay, hover); } catch (e) { reveal(it); }
    }

    function startGlitch(it, delay, hover) {
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
            // анимированная плашка (e-1): край выезжает с одной стороны, потом уезжает дальше
            q.anim = rnd() < ANIM_SHARE;
            q.side = scrollDir * ANIM_FOLLOW > 0 ? 0 : 1; // 0 — сверху вниз, 1 — снизу вверх
        });
        it.rects = rects;
        it.dur = hover ? HOVER_DUR : DUR;
        it.fx = makeFx(it.cols, it.rows);
        // анимированной линии нужно время на обе фазы
        it.fx.forEach((f) => {
            if (f.type !== 'line' || !f.L.anim) return;
            f.len = Math.min(2 * ANIM_PHASE / it.dur, 0.9);
            f.tIn = 0.05 + rnd() * Math.max(0, 0.9 - f.len);
        });
        it.t0 = performance.now() + delay;
        it.active = true;
        // страховка: если анимация тормозит (вкладка в фоне), контент всё равно покажется
        const run = it.run = (it.run || 0) + 1;
        if (!hover) setTimeout(() => { if (it.run === run && !it.shown) reveal(it); }, delay + DUR + 400);
        // пара линий где-то ещё на экране
        const nFree = hover ? (rnd() < 0.5 ? 1 : 0) : irnd(3);
        for (let i = 0; i < nFree; i++) spawnFreeLine(it.t0 + rnd() * it.dur * 0.7, undefined, it);
        kick();
    }

    function reveal(it) {
        it.shown = true;
        it.el.classList.remove('gx-hidden');
    }

    function reset(it) {
        it.run = (it.run || 0) + 1;
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
    // мобильное меню сайт строит позже — подхватываем его пункты
    document.addEventListener('DOMContentLoaded', () => collect().forEach((it) => io.observe(it.el)));

    // ---- Элементы, которые пробегают при прокрутке ----
    const sparks = [];
    let lastY = window.scrollY, acc = 0;

    function spawnSpark(now) {
        if (sparks.length > 16) return;
        const boxes = items.map((it) => it.el.getBoundingClientRect());
        const roll = rnd();
        const kind = roll < 0.4 ? 'bar' : roll < 0.72 ? 'line' : roll < 0.87 ? 'speck' : 'cross';
        const anchor = pickAnchor();
        if (kind === 'line') { spawnFreeLine(now, undefined, anchor); return; }
        for (let tries = 0; tries < 16; tries++) {
            const w = kind === 'bar' ? 1 + irnd(3) : 2;
            // рядом с глючащим блоком, но не на блоках (проверка ниже)
            const cell = anchor ? nearCell(anchor, w) : {
                c: irnd(Math.ceil(vw / CELL) - w),
                r: Math.floor((window.scrollY + rnd() * vh) / CELL)
            };
            const c = cell.c, r = cell.r;
            const x = c * CELL, y = r * CELL - window.scrollY;
            const hit = boxes.some((b) => x < b.right && x + w * CELL > b.left && y < b.bottom && y + CELL > b.top);
            if (hit) continue;
            const anim = kind === 'bar' && rnd() < ANIM_SHARE;
            sparks.push({
                kind, c, r, w, t0: now, life: anim ? 2 * ANIM_PHASE : 180 + rnd() * 240, gray: rnd() < 0.35,
                sz: Math.round(CELL / pick([4, 2])), anim, side: scrollDir * ANIM_FOLLOW > 0 ? 0 : 1
            });
            return;
        }
    }

    window.addEventListener('scroll', () => {
        const y = window.scrollY;
        if (y !== lastY) scrollDir = y > lastY ? 1 : -1;
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

    // a, b — видимый кусок линии в долях длины (для анимированных), по умолчанию вся линия
    function drawLine(x, y, L, a, b) {
        if (a === undefined) { a = 0; b = 1; }
        if (L.rev) { const a0 = a; a = 1 - b; b = 1 - a0; } // рисуем с другого конца
        if (b <= a) return;
        const dx = L.ang === 'vert' ? 0 : C30 * L.len * L.dir;
        const dy = L.ang === 'vert' ? -L.len * L.dir : (L.ang === 'up' ? -0.5 : 0.5) * L.len;
        const col = L.col === 'w' ? WHITE : L.col === 'a' ? accent() : accent2();
        ctx.lineWidth = 1;
        ctx.strokeStyle = col;
        if (L.style === 'dash') {
            ctx.setLineDash([6, 6]);
            ctx.lineDashOffset = -a * L.len; // штрихи стоят на месте, а не ползут
        }
        line(x + dx * a, y + dy * a, x + dx * b, y + dy * b);
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        if (L.style === 'pair') {
            const ox = L.ang === 'vert' ? L.gap : 0, oy = L.ang === 'vert' ? 0 : L.gap;
            line(x + ox + dx * 0.6 * a, y + oy + dy * 0.6 * a, x + ox + dx * 0.6 * b, y + oy + dy * 0.6 * b);
        }
        if (L.dot && b >= 1) {
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
        // Холст лежит в странице и прокручивается вместе с ней — глюк не отстаёт от блоков.
        // Каждый кадр ставим холст под текущий экран.
        const sy = window.scrollY;
        const maxTop = Math.max(0, document.documentElement.scrollHeight - ch);
        // сдвиг холста — целое число пикселей экрана, иначе весь холст пересэмплируется и края мылятся
        const top = snapScreen(Math.min(Math.max(sy - MARGIN, 0), maxTop));
        canvas.style.transform = 'translateY(' + top + 'px)';
        oy = sy - top;
        ctx.clearRect(0, 0, vw, ch);

        for (const it of items) {
            if (!it.active) continue;
            const t = (q - it.t0) / it.dur;
            const ts = (now - it.t0) / it.dur; // плавное время — для анимированных
            if (t < 0) { busy = true; continue; }
            if (t >= 0.38 && !it.shown) reveal(it);
            if (t >= 1) { it.active = false; continue; }
            busy = true;
            const b = it.el.getBoundingClientRect();
            if (b.bottom < -CELL * 2 || b.top > vh + CELL * 2) continue;
            const cw = b.width / it.cols, chh = b.height / it.rows;
            const gx = (c) => snap(b.left + c * cw);
            const gy = (r) => snap(b.top + oy + r * chh);

            for (const k of it.rects) {
                const tk = k.anim ? ts : t;
                if (tk < k.tIn || tk >= k.tOut) continue;
                let x = gx(k.x), y = gy(k.y);
                let w = gx(k.x + k.w) - x, h = gy(k.y + k.h) - y;
                const isAccent = tk < k.tGray;
                let whole = true;
                if (k.anim) {
                    const life = (k.tOut - k.tIn) * it.dur;
                    const [u0, u1] = trim((tk - k.tIn) * it.dur, life);
                    whole = u0 <= 0 && u1 >= 1;
                    // кусок плашки от хвоста до головы, внутри её же клеток
                    const from = k.side === 0 ? u0 : 1 - u1, to = k.side === 0 ? u1 : 1 - u0;
                    const y0 = snap(y + h * from), y1 = snap(y + h * to);
                    y = y0; h = y1 - y0;
                    if (w <= 0 || h <= 0) continue;
                }
                ctx.fillStyle = isAccent ? a1 : GRAY;
                ctx.fillRect(x, y, w, h);
                if (isAccent && k.mark && whole) {
                    ctx.fillStyle = DARK;
                    ctx.fillRect(x + 6, y + 6, 4, 4);
                    ctx.font = '7px Consolas, monospace';
                    ctx.fillText('KV-' + String(it.id * 37 + k.x * 7 + k.y).padStart(4, '0'), x + 14, y + 11);
                }
            }

            for (const f of it.fx) {
                const animLine = f.type === 'line' && f.L.anim;
                const tf = animLine ? ts : t;
                if (tf < f.tIn || tf >= f.tIn + f.len) continue;
                const x = gx(f.x), y = gy(f.y);
                if (animLine) {
                    const [u0, u1] = trim((tf - f.tIn) * it.dur, f.len * it.dur);
                    drawLine(x + 0.5, y + 0.5, f.L, u0, u1);
                    continue;
                }
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
            const smooth = s.anim || (s.L && s.L.anim);
            const t = ((smooth ? now : q) - s.t0) / s.life;
            if (t >= 1) { sparks.splice(i, 1); continue; }
            busy = true;
            if (t < 0) continue;
            const x = s.c * CELL, y = snap(s.r * CELL - sy + oy);
            if (s.kind === 'bar') {
                ctx.fillStyle = s.gray || t > 0.6 ? GRAY : a1;
                if (s.anim) {
                    // полоска выезжает сверху или снизу и уезжает дальше (e-1)
                    const [u0, u1] = trim(t * s.life, s.life);
                    const from = s.side ? 1 - u1 : u0, to = s.side ? 1 - u0 : u1;
                    const y0 = snap(y + CELL * from), y1 = snap(y + CELL * to);
                    if (y1 > y0) ctx.fillRect(x, y0, s.w * CELL, y1 - y0);
                } else {
                    ctx.fillRect(x, y, s.w * CELL, CELL);
                }
            } else if (s.kind === 'speck') {
                ctx.fillStyle = a2;
                ctx.fillRect(x, y, s.sz, s.sz);
            } else if (s.kind === 'cross') {
                drawCross(x, y);
            } else if (s.L.anim) {
                const [u0, u1] = trim(t * s.life, s.life);
                drawLine(x + 0.5, y + 0.5, s.L, u0, u1);
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

    // Телефон: каждое касание блока даёт глюк (свайп для прокрутки не считается)
    let tapX = 0, tapY = 0, tapT = 0;
    document.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        tapX = e.clientX; tapY = e.clientY; tapT = performance.now();
    }, { passive: true });
    document.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'mouse') return;
        const now = performance.now();
        if (now - tapT > 500 || Math.abs(e.clientX - tapX) > 10 || Math.abs(e.clientY - tapY) > 10) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const hit = el && el.closest ? el.closest(SELECTOR) : null;
        const it = hit ? byEl.get(hit) : null;
        if (!it || it.active || !it.shown) return;
        it.lastHover = now;
        start(it, 0, true);
    }, { passive: true });

})();
