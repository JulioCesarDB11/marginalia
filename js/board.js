'use strict';

// Quadro de desenho vetorial. Os traços são guardados em coordenadas lógicas
// (largura fixa de 1000), então o desenho se adapta a qualquer tamanho de tela.
const Board = (() => {
  const W = 1000;
  const all = new Set();
  const PREFS = 'marginalia:board';

  const state = Object.assign(
    { tool: 'pen', color: 'ink', hlColor: '#ffd43b', sizeIdx: 1, finger: false },
    (() => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; } })()
  );
  const persist = () => { try { localStorage.setItem(PREFS, JSON.stringify(state)); } catch {} };

  const TOOLS = [
    ['pen', 'Caneta'], ['highlighter', 'Marca-texto'], ['eraser', 'Borracha'],
    ['line', 'Linha'], ['arrow', 'Seta'], ['rect', 'Retângulo'], ['ellipse', 'Elipse'],
  ];
  const SHAPES = new Set(['line', 'arrow', 'rect', 'ellipse']);
  const PEN_COLORS = ['ink', '#e03131', '#1c7ed6', '#2f9e44', '#f08c00', '#9c36b5'];
  const HL_COLORS = ['#ffd43b', '#69db7c', '#ff8cc6', '#74c0fc'];
  const SIZES = { pen: [1.6, 3, 6], highlighter: [12, 20, 32], eraser: [8, 18, 36] };
  const BGS = [['plain', 'Liso'], ['dots', 'Pontilhado'], ['grid', 'Quadriculado'], ['lines', 'Pautado']];

  const sizeFor = tool => (SIZES[tool] || SIZES.pen)[state.sizeIdx] ?? 3;

  function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = n => cs.getPropertyValue(n).trim();
    return { ink: v('--ink') || '#222', paper: v('--paper') || '#fff', line: v('--paper-line') || '#ddd' };
  }

  function drawBackground(ctx, bg, w, hgt, k, colors) {
    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, w, hgt);
    ctx.fillStyle = colors.line;
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = Math.max(1, k);
    if (bg === 'dots') {
      const step = 25 * k, r = Math.max(1, 1.6 * k);
      for (let y = step; y < hgt; y += step)
        for (let x = step; x < w; x += step) ctx.fillRect(x - r / 2, y - r / 2, r, r);
    } else if (bg === 'grid') {
      const step = 25 * k;
      ctx.beginPath();
      for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, hgt); }
      for (let y = step; y < hgt; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
    } else if (bg === 'lines') {
      const step = 34 * k;
      ctx.beginPath();
      for (let y = step * 1.5; y < hgt; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
    }
  }

  function drawStroke(ctx, s, k, colors) {
    const pts = s.points;
    if (!pts.length) return;
    const color = s.color === 'ink' ? colors.ink : s.color;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const X = p => p[0] * k, Y = p => p[1] * k;

    if (s.tool === 'pen') {
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(X(pts[0]), Y(pts[0]), (s.size * k * (0.5 + pts[0][2])) / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // curva suavizada pelos pontos médios; espessura segue a pressão da caneta
        let from = pts[0];
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i];
          const to = i < pts.length - 1 ? [(p[0] + pts[i + 1][0]) / 2, (p[1] + pts[i + 1][1]) / 2] : p;
          ctx.beginPath();
          ctx.lineWidth = s.size * k * (0.5 + (p[2] ?? 0.5));
          ctx.moveTo(X(from), Y(from));
          ctx.quadraticCurveTo(X(p), Y(p), X(to), Y(to));
          ctx.stroke();
          from = to;
        }
      }
    } else if (s.tool === 'highlighter') {
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = s.size * k;
      ctx.beginPath();
      ctx.moveTo(X(pts[0]), Y(pts[0]));
      if (pts.length === 1) ctx.lineTo(X(pts[0]) + 0.1, Y(pts[0]));
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const to = i < pts.length - 1 ? [(p[0] + pts[i + 1][0]) / 2, (p[1] + pts[i + 1][1]) / 2] : p;
        ctx.quadraticCurveTo(X(p), Y(p), X(to), Y(to));
      }
      ctx.stroke();
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      ctx.lineWidth = s.size * k;
      ctx.beginPath();
      if (s.tool === 'line' || s.tool === 'arrow') {
        ctx.moveTo(X(a), Y(a));
        ctx.lineTo(X(b), Y(b));
        if (s.tool === 'arrow') {
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          const len = Math.max(14, s.size * 4.5) * k;
          for (const d of [-0.45, 0.45]) {
            ctx.moveTo(X(b), Y(b));
            ctx.lineTo(X(b) - len * Math.cos(ang + d), Y(b) - len * Math.sin(ang + d));
          }
        }
      } else if (s.tool === 'rect') {
        ctx.rect(X(a), Y(a), X(b) - X(a), Y(b) - Y(a));
      } else if (s.tool === 'ellipse') {
        ctx.ellipse((X(a) + X(b)) / 2, (Y(a) + Y(b)) / 2, Math.abs(X(b) - X(a)) / 2, Math.abs(Y(b) - Y(a)) / 2, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Pontos usados pela borracha para saber se encostou num traço
  function hitPoints(s) {
    if (!SHAPES.has(s.tool)) return s.points;
    const [a, b] = s.points;
    if (!b) return [a];
    if (s.tool === 'rect') return [a, [b[0], a[1]], b, [a[0], b[1]], a];
    if (s.tool === 'ellipse') {
      const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, rx = Math.abs(b[0] - a[0]) / 2, ry = Math.abs(b[1] - a[1]) / 2;
      return Array.from({ length: 33 }, (_, i) => [cx + rx * Math.cos(i / 32 * Math.PI * 2), cy + ry * Math.sin(i / 32 * Math.PI * 2)]);
    }
    return [a, b];
  }

  function distToSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  function hits(s, p, r) {
    const pts = hitPoints(s);
    const tol = r + s.size / 2;
    if (pts.length === 1) return Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) <= tol;
    for (let i = 1; i < pts.length; i++) if (distToSeg(p, pts[i - 1], pts[i]) <= tol) return true;
    return false;
  }

  const r1 = v => Math.round(v * 10) / 10;

  class BoardView {
    constructor(data, onChange) {
      this.data = data;
      if (!Array.isArray(data.strokes)) data.strokes = [];
      data.h = data.h || 560;
      data.bg = data.bg || 'dots';
      this.onChange = onChange || (() => {});
      this.undoStack = [];
      this.redoStack = [];
      this.colors = themeColors();

      this.bar = h('div', { class: 'board-bar' });
      this.canvas = h('canvas', { class: 'board-canvas' });
      this.cache = document.createElement('canvas');
      this.wrap = h('div', { class: 'board-wrap' }, this.canvas);
      this.handle = h('div', { class: 'board-handle', title: 'Arraste para mudar a altura do quadro' }, h('span'));
      this.el = h('div', { class: 'board' }, this.bar, this.wrap, this.handle);

      this.buildBar();
      this.bindPointer();
      this.bindHandle();
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.wrap);
      all.add(this);
    }

    destroy() { this.ro.disconnect(); all.delete(this); }

    buildBar() {
      const bar = this.bar;
      bar.innerHTML = '';
      const btn = (cls, title, html, onclick, disabled) =>
        h('button', { type: 'button', class: cls, title, 'aria-label': title, html, onclick, disabled });

      const tools = h('div', { class: 'bar-group' }, TOOLS.map(([t, label]) =>
        btn('tool' + (state.tool === t ? ' on' : ''), label, icon(t), () => { state.tool = t; persist(); syncAll(); })));

      const isHl = state.tool === 'highlighter';
      const current = isHl ? state.hlColor : state.color;
      const pickColor = c => {
        if (isHl) state.hlColor = c; else state.color = c;
        if (state.tool === 'eraser') state.tool = 'pen';
        persist(); syncAll();
      };
      const colors = h('div', { class: 'bar-group colors' + (state.tool === 'eraser' ? ' dim' : '') },
        (isHl ? HL_COLORS : PEN_COLORS).map(c =>
          btn('swatch' + (c === current ? ' on' : ''), c === 'ink' ? 'Cor do tema' : c, '', () => pickColor(c))),
        h('label', { class: 'swatch custom' + (!(isHl ? HL_COLORS : PEN_COLORS).includes(current) ? ' on' : ''), title: 'Outra cor' },
          h('input', { type: 'color', value: current === 'ink' ? '#333333' : current, onchange: e => pickColor(e.target.value) })));
      colors.querySelectorAll('button.swatch').forEach((b, i) => {
        const c = (isHl ? HL_COLORS : PEN_COLORS)[i];
        b.style.setProperty('--sw', c === 'ink' ? 'var(--ink)' : c);
      });
      const custom = colors.querySelector('.swatch.custom');
      if (!['ink', ...PEN_COLORS, ...HL_COLORS].includes(current)) custom.style.setProperty('--sw', current);

      const sizes = h('div', { class: 'bar-group sizes' }, [0, 1, 2].map(i =>
        btn('size' + (state.sizeIdx === i ? ' on' : ''), ['Fino', 'Médio', 'Grosso'][i], `<span style="--d:${4 + i * 4}px"></span>`,
          () => { state.sizeIdx = i; persist(); syncAll(); })));

      const bgSel = h('select', { class: 'bg-select', title: 'Fundo do quadro', 'aria-label': 'Fundo do quadro',
        onchange: e => { this.data.bg = e.target.value; localStorage.setItem('marginalia:lastBg', JSON.stringify(e.target.value)); this.redraw(); this.onChange(); } },
        BGS.map(([v, l]) => h('option', { value: v, selected: this.data.bg === v }, l)));

      const actions = h('div', { class: 'bar-group' },
        btn('tool', 'Desfazer', icon('undo'), () => this.undo(), !this.undoStack.length),
        btn('tool', 'Refazer', icon('redo'), () => this.redo(), !this.redoStack.length),
        btn('tool' + (state.finger ? ' on' : ''), state.finger ? 'Dedo desenha (toque para o dedo rolar a página)' : 'Dedo rola a página (toque para o dedo desenhar)', icon('hand'),
          () => { state.finger = !state.finger; persist(); syncAll(); }),
        bgSel,
        btn('tool danger', 'Limpar desenho', icon('trash'), () => this.clear(), !this.data.strokes.length));

      bar.append(tools, colors, sizes, actions);
    }

    resize(force) {
      const w = this.wrap.clientWidth;
      if (!w) return;
      const key = w + 'x' + this.data.h;
      if (!force && key === this.key) return;
      this.key = key;
      const cssH = this.data.h * w / W;
      const dpr = window.devicePixelRatio || 1;
      this.canvas.style.height = cssH + 'px';
      this.canvas.width = this.cache.width = Math.round(w * dpr);
      this.canvas.height = this.cache.height = Math.round(cssH * dpr);
      this.redraw();
    }

    redraw() {
      this.colors = themeColors();
      const ctx = this.cache.getContext('2d');
      const k = this.cache.width / W;
      drawBackground(ctx, this.data.bg, this.cache.width, this.cache.height, k, this.colors);
      for (const s of this.data.strokes) drawStroke(ctx, s, k, this.colors);
      this.paint();
    }

    paint() {
      const ctx = this.canvas.getContext('2d');
      const k = this.canvas.width / W;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.drawImage(this.cache, 0, 0);
      if (this.current) drawStroke(ctx, this.current, k, this.colors);
      if (state.tool === 'eraser' && this.hover) {
        ctx.save();
        ctx.strokeStyle = this.colors.ink;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = Math.max(1, k);
        ctx.beginPath();
        ctx.arc(this.hover[0] * k, this.hover[1] * k, sizeFor('eraser') * k, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    schedulePaint() {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => { this.raf = null; this.paint(); });
    }

    point(e) {
      const r = this.canvas.getBoundingClientRect();
      const k = W / r.width;
      const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
      return [r1((e.clientX - r.left) * k), r1((e.clientY - r.top) * k), Math.round(p * 100) / 100];
    }

    bindPointer() {
      const c = this.canvas;
      c.addEventListener('pointerdown', e => this.down(e));
      c.addEventListener('pointermove', e => this.move(e));
      c.addEventListener('pointerup', e => this.up(e));
      c.addEventListener('pointercancel', e => this.up(e));
      c.addEventListener('pointerleave', () => { this.hover = null; if (!this.active) this.paint(); });
      c.addEventListener('contextmenu', e => e.preventDefault());
    }

    down(e) {
      if (this.active) return;
      if (e.pointerType === 'touch' && !state.finger) {
        // dedo rola a página por cima do quadro
        this.pan = { id: e.pointerId, y: e.clientY };
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.canvas.setPointerCapture(e.pointerId);
      this.active = { id: e.pointerId, changed: false };
      this.undoStack.push(this.data.strokes.slice());
      if (this.undoStack.length > 100) this.undoStack.shift();
      const p = this.point(e);
      if (state.tool === 'eraser') this.eraseAt(p);
      else this.current = {
        tool: state.tool,
        color: state.tool === 'highlighter' ? state.hlColor : state.color,
        size: sizeFor(state.tool),
        points: [p],
      };
      this.paint();
    }

    move(e) {
      if (this.pan && e.pointerId === this.pan.id) {
        const sc = this.el.closest('.scroller') || document.scrollingElement;
        sc.scrollBy(0, this.pan.y - e.clientY);
        this.pan.y = e.clientY;
        return;
      }
      const p = this.point(e);
      this.hover = p;
      if (!this.active || e.pointerId !== this.active.id) {
        if (state.tool === 'eraser') this.schedulePaint();
        return;
      }
      const evs = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
      if (state.tool === 'eraser') {
        evs.forEach(ev => this.eraseAt(this.point(ev)));
      } else if (SHAPES.has(this.current.tool)) {
        this.current.points = [this.current.points[0], p];
      } else {
        const pts = this.current.points;
        for (const ev of evs) {
          const q = this.point(ev);
          const last = pts[pts.length - 1];
          if (Math.hypot(q[0] - last[0], q[1] - last[1]) >= 0.8) pts.push(q);
        }
      }
      this.schedulePaint();
    }

    up(e) {
      if (this.pan && e.pointerId === this.pan.id) { this.pan = null; return; }
      if (!this.active || e.pointerId !== this.active.id) return;
      let changed = this.active.changed;
      const s = this.current;
      if (s) {
        const [a, b] = s.points;
        const valid = !SHAPES.has(s.tool) || (b && Math.hypot(b[0] - a[0], b[1] - a[1]) > 2);
        if (valid) {
          if (s.tool === 'highlighter' || SHAPES.has(s.tool)) s.points = s.points.map(p => [p[0], p[1]]);
          this.data.strokes.push(s);
          changed = true;
        }
      }
      this.current = null;
      this.active = null;
      if (changed) {
        this.redoStack = [];
        this.redraw();
        this.onChange();
      } else {
        this.undoStack.pop();
        this.paint();
      }
      this.buildBar();
    }

    eraseAt(p) {
      const r = sizeFor('eraser');
      const before = this.data.strokes.length;
      this.data.strokes = this.data.strokes.filter(s => !hits(s, p, r));
      if (this.data.strokes.length !== before) {
        this.active.changed = true;
        this.redraw();
      }
    }

    bindHandle() {
      let start = null;
      this.handle.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.handle.setPointerCapture(e.pointerId);
        start = { y: e.clientY, h: this.data.h, k: W / this.wrap.clientWidth };
      });
      this.handle.addEventListener('pointermove', e => {
        if (!start) return;
        this.data.h = Math.round(Math.max(200, Math.min(8000, start.h + (e.clientY - start.y) * start.k)));
        if (!this.rafH) this.rafH = requestAnimationFrame(() => { this.rafH = null; this.resize(); });
      });
      const end = () => { if (start) { start = null; this.onChange(); } };
      this.handle.addEventListener('pointerup', end);
      this.handle.addEventListener('pointercancel', end);
    }

    undo() {
      if (!this.undoStack.length) return;
      this.redoStack.push(this.data.strokes.slice());
      this.data.strokes = this.undoStack.pop();
      this.redraw(); this.onChange(); this.buildBar();
    }

    redo() {
      if (!this.redoStack.length) return;
      this.undoStack.push(this.data.strokes.slice());
      this.data.strokes = this.redoStack.pop();
      this.redraw(); this.onChange(); this.buildBar();
    }

    clear() {
      if (!this.data.strokes.length || !confirm('Apagar todo o desenho deste quadro?')) return;
      this.undoStack.push(this.data.strokes.slice());
      this.data.strokes = [];
      this.redraw(); this.onChange(); this.buildBar();
    }
  }

  function syncAll() { all.forEach(b => b.buildBar()); }

  return {
    create: (data, onChange) => new BoardView(data, onChange),
    refreshAll: () => all.forEach(b => b.resize(true)),
    defaultBg: () => { try { return JSON.parse(localStorage.getItem('marginalia:lastBg')) || 'dots'; } catch { return 'dots'; } },
    toDataURL(data, colors, width = 1000) {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = Math.round((data.h || 560) * width / W);
      const ctx = c.getContext('2d');
      const k = width / W;
      drawBackground(ctx, data.bg, c.width, c.height, k, colors);
      (data.strokes || []).forEach(s => drawStroke(ctx, s, k, colors));
      return c.toDataURL('image/png');
    },
  };
})();
