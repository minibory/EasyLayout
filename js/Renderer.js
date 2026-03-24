const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function shapeEl(shape) {
  const { type, width: w, height: h } = shape;
  if (type === 'rect') {
    return svgEl('rect', { x: 0, y: 0, width: w, height: h, rx: 2 });
  }
  if (type === 'circle') {
    return svgEl('ellipse', { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 });
  }
  if (type === 'triangle') {
    return svgEl('polygon', { points: `${w/2},0 ${w},${h} 0,${h}` });
  }
  if (type === 'line') {
    return svgEl('line', { x1: 0, y1: h, x2: w, y2: 0 });
  }
  return svgEl('rect', { x: 0, y: 0, width: w, height: h });
}

function applyShapeAttrs(el, shape) {
  const { type, fill, stroke, strokeWidth, opacity } = shape;
  if (type === 'line') {
    el.setAttribute('stroke', stroke);
    el.setAttribute('stroke-width', strokeWidth);
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('fill', 'none');
  } else {
    el.setAttribute('fill', fill);
    el.setAttribute('stroke', stroke);
    el.setAttribute('stroke-width', strokeWidth);
  }
  el.setAttribute('opacity', opacity);
}

function groupTransform(shape) {
  const { x, y, width: w, height: h, rotation } = shape;
  if (rotation) {
    return `translate(${x},${y}) rotate(${rotation},${w/2},${h/2})`;
  }
  return `translate(${x},${y})`;
}

export class Renderer {
  constructor(svgEl, shapesLayer) {
    this.svg = svgEl;
    this.layer = shapesLayer;
    this.groups = new Map(); // id -> <g>
  }

  render(shapes) {
    const existing = new Set(this.groups.keys());

    // Sort by zIndex
    const sorted = [...shapes].sort((a, b) => a.zIndex - b.zIndex);

    for (const shape of sorted) {
      existing.delete(shape.id);
      if (!this.groups.has(shape.id)) {
        this._create(shape);
      } else {
        this._update(shape);
      }
    }

    // Remove deleted shapes
    for (const id of existing) {
      this.groups.get(id).remove();
      this.groups.delete(id);
    }

    // Reorder DOM to match zIndex
    for (const shape of sorted) {
      this.layer.appendChild(this.groups.get(shape.id));
    }
  }

  _create(shape) {
    const g = svgEl('g', {
      class: 'shape-group',
      'data-id': shape.id,
    });

    const el = shapeEl(shape);
    el.classList.add('shape-el');
    applyShapeAttrs(el, shape);
    g.appendChild(el);

    // Hit area for line (transparent wide stroke)
    if (shape.type === 'line') {
      const hit = shapeEl(shape);
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', Math.max(12, shape.strokeWidth));
      hit.setAttribute('fill', 'none');
      hit.classList.add('shape-hit');
      g.insertBefore(hit, el);
    }

    const text = svgEl('text', {
      class: 'shape-text',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'pointer-events': 'none',
    });
    g.appendChild(text);

    g.setAttribute('transform', groupTransform(shape));
    this._updateText(text, shape);
    this.layer.appendChild(g);
    this.groups.set(shape.id, g);
  }

  _update(shape) {
    const g = this.groups.get(shape.id);
    const el = g.querySelector('.shape-el');
    const text = g.querySelector('.shape-text');

    // Rebuild shape element if type somehow changed
    const newEl = shapeEl(shape);
    newEl.classList.add('shape-el');
    applyShapeAttrs(newEl, shape);
    el.replaceWith(newEl);

    // Update hit area if line
    const hit = g.querySelector('.shape-hit');
    if (shape.type === 'line' && hit) {
      const newHit = shapeEl(shape);
      newHit.setAttribute('stroke', 'transparent');
      newHit.setAttribute('stroke-width', Math.max(12, shape.strokeWidth));
      newHit.setAttribute('fill', 'none');
      newHit.classList.add('shape-hit');
      hit.replaceWith(newHit);
    }

    g.setAttribute('transform', groupTransform(shape));
    this._updateText(text, shape);
  }

  _updateText(textEl, shape) {
    textEl.textContent = shape.text || '';
    textEl.setAttribute('x', shape.width / 2);
    textEl.setAttribute('y', shape.height / 2);
    textEl.setAttribute('font-size', shape.fontSize);
    textEl.setAttribute('fill', '#333');
  }

  getGroup(id) {
    return this.groups.get(id);
  }
}
