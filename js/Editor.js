import { Shape } from './Shape.js';
import { History } from './History.js';
import { Renderer } from './Renderer.js';
import { Selection } from './Selection.js';
import { PropsPanel } from './PropsPanel.js';

const GRID = 20;
const MIN_SIZE = 10;

function snap(v, enabled) {
  return enabled ? Math.round(v / GRID) * GRID : v;
}

function ptInShape(shape, px, py) {
  // Check if point is within bounding box (unrotated - good enough for now)
  return px >= shape.x && px <= shape.x + shape.width
      && py >= shape.y && py <= shape.y + shape.height;
}

export class Editor {
  constructor() {
    this.shapes = [];
    this.selectedId = null;
    this.history = new History();
    this.snapEnabled = true;
    this.gridVisible = true;
    this.activeTool = 'select'; // 'select' | 'pan' | 'place'
    this.placingType = null;

    // Viewport transform
    this.vx = 0; this.vy = 0; this.vz = 1;

    // Drag state
    this._drag = null;

    this._initDOM();
    this._initEvents();
    const restored = this._loadFromStorage();
    this._save(); // initial snapshot
    this._render();
    if (restored) this._applyViewport();
  }

  // ── DOM Init ──────────────────────────────────────────────────────────────

  _initDOM() {
    this.svg = document.getElementById('canvas');
    this.shapesLayer = document.getElementById('shapes-layer');
    this.selectionLayer = document.getElementById('selection-layer');
    this.gridBg = document.getElementById('grid-bg');
    this.zoomIndicator = document.getElementById('zoom-indicator');

    this.renderer = new Renderer(this.svg, this.shapesLayer);
    this.sel = new Selection(this.selectionLayer);

    this.propsPanel = new PropsPanel(
      document.getElementById('props-content'),
      (id, prop, value) => this._changeProp(id, prop, value)
    );

    this._updateGridBg();
  }

  // ── Event Binding ─────────────────────────────────────────────────────────

  _initEvents() {
    const svg = this.svg;

    // Shape palette
    document.querySelectorAll('.shape-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.shape;
        this._setActiveTool('place', type);
        document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Tool buttons
    document.getElementById('tool-select').addEventListener('click', () => this._setActiveTool('select'));
    document.getElementById('tool-pan').addEventListener('click', () => this._setActiveTool('pan'));

    // Toolbar actions
    document.getElementById('btn-undo').addEventListener('click', () => this._undo());
    document.getElementById('btn-redo').addEventListener('click', () => this._redo());
    document.getElementById('btn-delete').addEventListener('click', () => this._deleteSelected());
    document.getElementById('btn-bring-front').addEventListener('click', () => this._bringFront());
    document.getElementById('btn-send-back').addEventListener('click', () => this._sendBack());
    document.getElementById('btn-grid').addEventListener('click', e => {
      this.gridVisible = !this.gridVisible;
      e.currentTarget.classList.toggle('active', this.gridVisible);
      this.gridBg.setAttribute('visibility', this.gridVisible ? 'visible' : 'hidden');
    });
    document.getElementById('btn-snap').addEventListener('click', e => {
      this.snapEnabled = !this.snapEnabled;
      e.currentTarget.classList.toggle('active', this.snapEnabled);
    });
    document.getElementById('btn-save').addEventListener('click', () => this._exportJSON());
    document.getElementById('btn-load').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', e => this._importJSON(e));
    document.getElementById('btn-export-png').addEventListener('click', () => this._exportPNG());
    document.getElementById('btn-reset').addEventListener('click', () => this._reset());

    // SVG mouse events
    svg.addEventListener('mousedown', e => this._onMouseDown(e));
    window.addEventListener('mousemove', e => this._onMouseMove(e));
    window.addEventListener('mouseup', e => this._onMouseUp(e));
    svg.addEventListener('wheel', e => this._onWheel(e), { passive: false });
    svg.addEventListener('dblclick', e => this._onDblClick(e));

    // Keyboard
    window.addEventListener('keydown', e => this._onKey(e));
  }

  // ── Tool switching ─────────────────────────────────────────────────────────

  _setActiveTool(tool, placingType = null) {
    this.activeTool = tool;
    this.placingType = placingType;

    document.getElementById('tool-select').classList.toggle('active', tool === 'select');
    document.getElementById('tool-pan').classList.toggle('active', tool === 'pan');
    if (tool !== 'place') {
      document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
    }

    this.svg.className.baseVal = tool === 'pan' ? 'tool-pan'
      : tool === 'place' ? 'tool-placing' : '';

    if (tool !== 'select') this._deselect();
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  _svgPt(e) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.vx) / this.vz,
      y: (e.clientY - rect.top  - this.vy) / this.vz,
    };
  }

  _screenPt(e) {
    const rect = this.svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ── Mouse Events ──────────────────────────────────────────────────────────

  _onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();

    const pt = this._svgPt(e);
    const screenPt = this._screenPt(e);

    // Pan tool
    if (this.activeTool === 'pan') {
      this._drag = { type: 'pan', sx: screenPt.x, sy: screenPt.y, vx0: this.vx, vy0: this.vy };
      this.svg.classList.add('panning');
      return;
    }

    // Place tool
    if (this.activeTool === 'place') {
      const sx = snap(pt.x, this.snapEnabled);
      const sy = snap(pt.y, this.snapEnabled);
      this._drag = { type: 'placing', x0: sx, y0: sy, px: pt.x, py: pt.y };
      return;
    }

    // Select tool
    const handle = e.target.dataset.handle;
    if (handle) {
      const shape = this._selected();
      if (shape) {
        this._drag = {
          type: handle === 'rotate' ? 'rotating' : 'resizing',
          handle,
          shape0: { ...shape },
          px: pt.x, py: pt.y,
          cx0: shape.cx, cy0: shape.cy,
        };
        return;
      }
    }

    // Click on shape
    const shapeId = this._hitTest(pt.x, pt.y);
    if (shapeId != null) {
      this._select(shapeId);
      const shape = this._selected();
      this._drag = {
        type: 'moving',
        px: pt.x, py: pt.y,
        x0: shape.x, y0: shape.y,
      };
    } else {
      this._deselect();
      this._drag = { type: 'pan', sx: screenPt.x, sy: screenPt.y, vx0: this.vx, vy0: this.vy };
      this.svg.classList.add('panning');
    }
  }

  _onMouseMove(e) {
    if (!this._drag) return;
    const pt = this._svgPt(e);
    const screenPt = this._screenPt(e);
    const d = this._drag;

    if (d.type === 'pan') {
      this.vx = d.vx0 + (screenPt.x - d.sx);
      this.vy = d.vy0 + (screenPt.y - d.sy);
      this._applyViewport();
      return;
    }

    if (d.type === 'placing') {
      d.px = pt.x; d.py = pt.y;
      // Live preview via ghost (skip for now – handled on mouseup)
      return;
    }

    if (d.type === 'moving') {
      const shape = this._selected();
      if (!shape) return;
      const dx = pt.x - d.px;
      const dy = pt.y - d.py;
      shape.x = snap(d.x0 + dx, this.snapEnabled);
      shape.y = snap(d.y0 + dy, this.snapEnabled);
      this._renderAndRefresh(shape);
      return;
    }

    if (d.type === 'resizing') {
      this._doResize(pt, d);
      return;
    }

    if (d.type === 'rotating') {
      const shape = this._selected();
      if (!shape) return;
      const angle = Math.atan2(pt.y - shape.cy, pt.x - shape.cx) * 180 / Math.PI + 90;
      shape.rotation = this.snapEnabled ? Math.round(angle / 15) * 15 : Math.round(angle * 10) / 10;
      this._renderAndRefresh(shape);
    }
  }

  _onMouseUp(e) {
    if (!this._drag) return;
    const d = this._drag;
    const pt = this._svgPt(e);

    if (d.type === 'placing') {
      const x0 = d.x0, y0 = d.y0;
      const x1 = snap(pt.x, this.snapEnabled);
      const y1 = snap(pt.y, this.snapEnabled);
      let x = Math.min(x0, x1), y = Math.min(y0, y1);
      let w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
      if (w < MIN_SIZE) w = GRID * 5;
      if (h < MIN_SIZE) h = GRID * 4;
      if (w < MIN_SIZE || h < MIN_SIZE) { x -= w/2; y -= h/2; }
      const shape = new Shape(this.placingType, x, y, w, h);
      shape.zIndex = this.shapes.length;
      this.shapes.push(shape);
      this._save();
      this._render();
      this._setActiveTool('select');
      this._select(shape.id);
    } else if (d.type === 'moving' || d.type === 'resizing' || d.type === 'rotating') {
      this._save();
    }

    this._drag = null;
    this.svg.classList.remove('panning');
  }

  _onWheel(e) {
    e.preventDefault();
    const rect = this.svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZ = Math.min(5, Math.max(0.1, this.vz * delta));
    this.vx = mx - (mx - this.vx) * (newZ / this.vz);
    this.vy = my - (my - this.vy) * (newZ / this.vz);
    this.vz = newZ;
    this._applyViewport();
  }

  _onDblClick(e) {
    // Double click on shape → focus text input in props panel
    const pt = this._svgPt(e);
    const id = this._hitTest(pt.x, pt.y);
    if (id != null) {
      this._select(id);
      const textInput = document.querySelector('#props-content [name="text"]');
      if (textInput) { textInput.focus(); textInput.select(); }
    }
  }

  _onKey(e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); this._undo(); return; }
      if (e.key === 'y') { e.preventDefault(); this._redo(); return; }
      if (e.key === 'c') { e.preventDefault(); this._copy(); return; }
      if (e.key === 'v') { e.preventDefault(); this._paste(); return; }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') this._deleteSelected();
    if (e.key === 'v' || e.key === 'Escape') this._setActiveTool('select');
    if (e.key === 'h') this._setActiveTool('pan');

    // Arrow keys for nudge
    const sel = this._selected();
    if (sel) {
      const step = this.snapEnabled ? GRID : 1;
      if (e.key === 'ArrowLeft')  { sel.x -= step; this._renderAndRefresh(sel); this._save(); }
      if (e.key === 'ArrowRight') { sel.x += step; this._renderAndRefresh(sel); this._save(); }
      if (e.key === 'ArrowUp')    { sel.y -= step; this._renderAndRefresh(sel); this._save(); }
      if (e.key === 'ArrowDown')  { sel.y += step; this._renderAndRefresh(sel); this._save(); }
    }
  }

  // ── Resize logic ──────────────────────────────────────────────────────────

  _doResize(pt, d) {
    const shape = this._selected();
    if (!shape) return;
    const s0 = d.shape0;
    const dx = pt.x - d.px;
    const dy = pt.y - d.py;

    let { x, y, width: w, height: h } = s0;

    const rdx = Math.round(dx), rdy = Math.round(dy);
    const h_map = {
      nw: () => { x = s0.x + rdx; y = s0.y + rdy; w = s0.width - rdx; h = s0.height - rdy; },
      ne: () => { y = s0.y + rdy; w = s0.width + rdx; h = s0.height - rdy; },
      se: () => { w = s0.width + rdx; h = s0.height + rdy; },
      sw: () => { x = s0.x + rdx; w = s0.width - rdx; h = s0.height + rdy; },
      n:  () => { y = s0.y + rdy; h = s0.height - rdy; },
      s:  () => { h = s0.height + rdy; },
      e:  () => { w = s0.width + rdx; },
      w:  () => { x = s0.x + rdx; w = s0.width - rdx; },
    };

    if (h_map[d.handle]) h_map[d.handle]();

    shape.x = x; shape.y = y;
    shape.width = Math.max(MIN_SIZE, w);
    shape.height = Math.max(MIN_SIZE, h);
    this._renderAndRefresh(shape);
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  _select(id) {
    this.selectedId = id;
    const shape = this._selected();
    if (shape) {
      this.sel.select(shape);
      this.propsPanel.show(shape);
    }
  }

  _deselect() {
    this.selectedId = null;
    this.sel.deselect();
    this.propsPanel.hide();
  }

  _selected() {
    return this.shapes.find(s => s.id === this.selectedId) || null;
  }

  _hitTest(x, y) {
    // Reverse order (top shape first)
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      if (ptInShape(s, x, y)) return s.id;
    }
    return null;
  }

  // ── Property Change ───────────────────────────────────────────────────────

  _changeProp(id, prop, value) {
    const shape = this.shapes.find(s => s.id === id);
    if (!shape) return;
    shape[prop] = value;
    this._renderAndRefresh(shape);
    // Debounce save for rapid input
    clearTimeout(this._propSaveTimer);
    this._propSaveTimer = setTimeout(() => this._save(), 500);
  }

  // ── History ───────────────────────────────────────────────────────────────

  _save() {
    this.history.push(this.shapes.map(s => s.toJSON()));
    this._updateUndoRedo();
    this._persist();
  }

  _reset() {
    if (!confirm('모든 도형과 화면 위치를 초기화하시겠습니까?')) return;
    this.shapes = [];
    this.vx = 0; this.vy = 0; this.vz = 1;
    this._deselect();
    this._applyViewport();
    this._save();
    this._render();
    localStorage.removeItem('easylayout');
  }

  _persist() {
    try {
      localStorage.setItem('easylayout', JSON.stringify({
        shapes: this.shapes.map(s => s.toJSON()),
        viewport: { vx: this.vx, vy: this.vy, vz: this.vz },
      }));
    } catch { /* 저장 실패 무시 */ }
  }

  _loadFromStorage() {
    try {
      const raw = localStorage.getItem('easylayout');
      if (!raw) return false;
      const { shapes, viewport } = JSON.parse(raw);
      this.shapes = shapes.map(d => Shape.fromJSON(d));
      if (viewport) { this.vx = viewport.vx; this.vy = viewport.vy; this.vz = viewport.vz; }
      return true;
    } catch { return false; }
  }

  _undo() {
    const state = this.history.undo();
    if (state) { this._loadState(state); this._updateUndoRedo(); }
  }

  _redo() {
    const state = this.history.redo();
    if (state) { this._loadState(state); this._updateUndoRedo(); }
  }

  _loadState(state) {
    this.shapes = state.map(d => Shape.fromJSON(d));
    const sel = this._selected();
    if (sel) {
      const updated = this.shapes.find(s => s.id === sel.id);
      if (updated) {
        this.sel.update(updated);
        this.propsPanel.refresh(updated);
      } else {
        this._deselect();
      }
    }
    this._render();
  }

  _updateUndoRedo() {
    document.getElementById('btn-undo').disabled = !this.history.canUndo;
    document.getElementById('btn-redo').disabled = !this.history.canRedo;
  }

  // ── Edit actions ──────────────────────────────────────────────────────────

  _deleteSelected() {
    if (this.selectedId == null) return;
    this.shapes = this.shapes.filter(s => s.id !== this.selectedId);
    this._deselect();
    this._save();
    this._render();
  }

  _copy() {
    const s = this._selected();
    if (s) this._clipboard = s.clone();
  }

  _paste() {
    if (!this._clipboard) return;
    const s = this._clipboard.clone();
    s.zIndex = this.shapes.length;
    this.shapes.push(s);
    this._clipboard = s.clone();
    this._select(s.id);
    this._save();
    this._render();
  }

  _bringFront() {
    const s = this._selected();
    if (!s) return;
    s.zIndex = Math.max(...this.shapes.map(x => x.zIndex)) + 1;
    this._save(); this._render();
  }

  _sendBack() {
    const s = this._selected();
    if (!s) return;
    s.zIndex = Math.min(...this.shapes.map(x => x.zIndex)) - 1;
    this._save(); this._render();
  }

  // ── Viewport ──────────────────────────────────────────────────────────────

  _applyViewport() {
    const t = `translate(${this.vx},${this.vy}) scale(${this.vz})`;
    this.shapesLayer.setAttribute('transform', t);
    this.selectionLayer.setAttribute('transform', t);
    this.zoomIndicator.textContent = `${Math.round(this.vz * 100)}%`;
  }

  _updateGridBg() {
    // nothing extra needed – grid is handled by SVG pattern
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _render() {
    this.renderer.render(this.shapes);
    const sel = this._selected();
    if (sel) this.sel.update(sel);
  }

  _renderAndRefresh(shape) {
    this._render();
    this.propsPanel.refresh(shape);
    this.sel.update(shape);
  }

  // ── Import / Export ───────────────────────────────────────────────────────

  _exportJSON() {
    const data = JSON.stringify({ shapes: this.shapes.map(s => s.toJSON()) }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'layout.json'; a.click();
    URL.revokeObjectURL(url);
  }

  _importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const { shapes } = JSON.parse(ev.target.result);
        this.shapes = shapes.map(d => Shape.fromJSON(d));
        this._deselect();
        this._save();
        this._render();
      } catch {
        alert('파일을 읽을 수 없습니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  _exportPNG() {
    const svgEl = this.svg;
    const rect = svgEl.getBoundingClientRect();
    const data = new XMLSerializer().serializeToString(svgEl);
    const svg64 = btoa(unescape(encodeURIComponent(data)));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = rect.width; canvas.height = rect.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'layout.png'; a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + svg64;
  }
}
