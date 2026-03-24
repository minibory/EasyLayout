const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const HANDLE_SIZE = 7;
const ROTATE_OFFSET = 22;

const HANDLES = ['nw','n','ne','e','se','s','sw','w'];

export class Selection {
  constructor(layer) {
    this.layer = layer;
    this.shape = null;
    this._els = {};
    this._built = false;
  }

  select(shape) {
    this.shape = shape;
    this._build();
    this._position();
  }

  deselect() {
    this.shape = null;
    this.layer.innerHTML = '';
    this._built = false;
    this._els = {};
  }

  update(shape) {
    this.shape = shape;
    if (this._built) this._position();
  }

  _build() {
    this.layer.innerHTML = '';
    this._els = {};

    // Outline rect
    this._els.outline = svgEl('rect', { class: 'sel-outline' });
    this.layer.appendChild(this._els.outline);

    // Rotate line
    this._els.rotateLine = svgEl('line', { class: 'sel-rotate-line' });
    this.layer.appendChild(this._els.rotateLine);

    // Rotate handle
    this._els.rotate = svgEl('circle', {
      class: 'sel-handle',
      'data-handle': 'rotate',
      r: HANDLE_SIZE / 2 + 1,
    });
    this.layer.appendChild(this._els.rotate);

    // Resize handles
    for (const h of HANDLES) {
      const el = svgEl('rect', {
        class: 'sel-handle',
        'data-handle': h,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
      });
      this._els[h] = el;
      this.layer.appendChild(el);
    }

    this._built = true;
  }

  _position() {
    const s = this.shape;
    const { x, y, width: w, height: h, rotation, cx, cy } = s;

    // Group transform for rotation
    const transform = rotation
      ? `rotate(${rotation},${cx},${cy})`
      : '';

    // Outline
    const outline = this._els.outline;
    outline.setAttribute('x', x);
    outline.setAttribute('y', y);
    outline.setAttribute('width', w);
    outline.setAttribute('height', h);
    if (transform) outline.setAttribute('transform', transform);
    else outline.removeAttribute('transform');

    // Handle positions relative to unrotated bbox
    const hs = HANDLE_SIZE;
    const positions = {
      nw: [x,       y      ],
      n:  [x+w/2,   y      ],
      ne: [x+w,     y      ],
      e:  [x+w,     y+h/2  ],
      se: [x+w,     y+h    ],
      s:  [x+w/2,   y+h    ],
      sw: [x,       y+h    ],
      w:  [x,       y+h/2  ],
    };

    for (const hName of HANDLES) {
      const [hx, hy] = positions[hName];
      const el = this._els[hName];
      el.setAttribute('x', hx - hs/2);
      el.setAttribute('y', hy - hs/2);
      if (transform) el.setAttribute('transform', transform);
      else el.removeAttribute('transform');
    }

    // Rotate handle: above top center
    const rotX = x + w / 2;
    const rotY = y - ROTATE_OFFSET;
    this._els.rotate.setAttribute('cx', rotX);
    this._els.rotate.setAttribute('cy', rotY);
    if (transform) this._els.rotate.setAttribute('transform', transform);
    else this._els.rotate.removeAttribute('transform');

    // Rotate line
    this._els.rotateLine.setAttribute('x1', rotX);
    this._els.rotateLine.setAttribute('y1', y);
    this._els.rotateLine.setAttribute('x2', rotX);
    this._els.rotateLine.setAttribute('y2', rotY);
    if (transform) this._els.rotateLine.setAttribute('transform', transform);
    else this._els.rotateLine.removeAttribute('transform');
  }
}
