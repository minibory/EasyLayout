export class PropsPanel {
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.shape = null;
  }

  show(shape) {
    this.shape = shape;
    this.container.innerHTML = this._html(shape);
    this._bind();
  }

  hide() {
    this.shape = null;
    this.container.innerHTML = '<p class="no-selection">도형을 선택하세요</p>';
  }

  refresh(shape) {
    if (!this.shape || this.shape.id !== shape.id) return;
    // Update only numeric inputs without losing focus
    const focused = document.activeElement;
    const focusedName = focused && focused.name;
    this.shape = shape;
    const fields = ['x','y','width','height','rotation','opacity','strokeWidth','fontSize'];
    for (const f of fields) {
      const el = this.container.querySelector(`[name="${f}"]`);
      if (el && el !== focused) el.value = this._fmt(shape[f]);
    }
    const fillEl = this.container.querySelector('[name="fill"]');
    const strokeEl = this.container.querySelector('[name="stroke"]');
    if (fillEl && fillEl !== focused) fillEl.value = shape.fill;
    if (strokeEl && strokeEl !== focused) strokeEl.value = shape.stroke;
    const textEl = this.container.querySelector('[name="text"]');
    if (textEl && textEl !== focused) textEl.value = shape.text;
  }

  _fmt(v) {
    return typeof v === 'number' ? Math.round(v * 10) / 10 : v;
  }

  _html(s) {
    return `
      <div class="prop-section">
        <div class="prop-section-title">위치 / 크기</div>
        <div class="prop-row-2col">
          <div class="prop-field"><label>X</label><input type="number" name="x" value="${this._fmt(s.x)}"></div>
          <div class="prop-field"><label>Y</label><input type="number" name="y" value="${this._fmt(s.y)}"></div>
        </div>
        <div class="prop-row-2col">
          <div class="prop-field"><label>W</label><input type="number" name="width" value="${this._fmt(s.width)}" min="4"></div>
          <div class="prop-field"><label>H</label><input type="number" name="height" value="${this._fmt(s.height)}" min="4"></div>
        </div>
        <div class="prop-row">
          <label>회전</label>
          <input type="number" name="rotation" value="${this._fmt(s.rotation)}" min="-360" max="360" step="1">
        </div>
      </div>
      <div class="prop-divider"></div>
      <div class="prop-section">
        <div class="prop-section-title">색상</div>
        <div class="prop-row">
          <label>채우기</label>
          <input type="color" name="fill" value="${s.fill}" ${s.type === 'line' ? 'disabled' : ''}>
          <input type="text" name="fill_hex" value="${s.fill}" style="flex:1;width:0" maxlength="9">
        </div>
        <div class="prop-row">
          <label>선</label>
          <input type="color" name="stroke" value="${s.stroke}">
          <input type="text" name="stroke_hex" value="${s.stroke}" style="flex:1;width:0" maxlength="9">
        </div>
        <div class="prop-row">
          <label>두께</label>
          <input type="number" name="strokeWidth" value="${s.strokeWidth}" min="0" max="20" step="0.5">
        </div>
        <div class="prop-row">
          <label>투명도</label>
          <input type="number" name="opacity" value="${s.opacity}" min="0" max="1" step="0.1">
        </div>
      </div>
      <div class="prop-divider"></div>
      <div class="prop-section">
        <div class="prop-section-title">텍스트</div>
        <input type="text" class="prop-text-input" name="text" placeholder="텍스트 입력..." value="${s.text}">
        <div class="prop-row">
          <label>크기</label>
          <input type="number" name="fontSize" value="${s.fontSize}" min="6" max="72">
        </div>
      </div>
    `;
  }

  _bind() {
    const emit = (name, value) => {
      if (this.shape) this.onChange(this.shape.id, name, value);
    };

    const numInput = (name, parser = parseFloat) => {
      const el = this.container.querySelector(`[name="${name}"]`);
      if (!el) return;
      el.addEventListener('input', () => {
        const v = parser(el.value);
        if (!isNaN(v)) emit(name, v);
      });
    };

    numInput('x'); numInput('y');
    numInput('width'); numInput('height');
    numInput('rotation'); numInput('opacity');
    numInput('strokeWidth'); numInput('fontSize');

    // Color pickers + hex inputs sync
    const colorPair = (colorName, hexName) => {
      const colorEl = this.container.querySelector(`[name="${colorName}"]`);
      const hexEl = this.container.querySelector(`[name="${hexName}"]`);
      if (!colorEl || !hexEl) return;
      colorEl.addEventListener('input', () => {
        hexEl.value = colorEl.value;
        emit(colorName, colorEl.value);
      });
      hexEl.addEventListener('input', () => {
        const v = hexEl.value;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
          colorEl.value = v;
          emit(colorName, v);
        }
      });
    };
    colorPair('fill', 'fill_hex');
    colorPair('stroke', 'stroke_hex');

    // Text
    const textEl = this.container.querySelector('[name="text"]');
    if (textEl) textEl.addEventListener('input', () => emit('text', textEl.value));
  }
}
