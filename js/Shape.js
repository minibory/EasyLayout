let _id = 1;

export class Shape {
  constructor(type, x, y, width, height) {
    this.id = _id++;
    this.type = type;       // 'rect' | 'circle' | 'triangle' | 'line'
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.fill = '#ffffff';
    this.stroke = '#5b8ce6';
    this.strokeWidth = 2;
    this.opacity = 1;
    this.rotation = 0;      // degrees
    this.text = '';
    this.fontSize = 14;
    this.zIndex = 0;
  }

  clone() {
    const s = new Shape(this.type, this.x + 20, this.y + 20, this.width, this.height);
    s.fill = this.fill;
    s.stroke = this.stroke;
    s.strokeWidth = this.strokeWidth;
    s.opacity = this.opacity;
    s.rotation = this.rotation;
    s.text = this.text;
    s.fontSize = this.fontSize;
    s.zIndex = this.zIndex;
    return s;
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    const s = new Shape(data.type, data.x, data.y, data.width, data.height);
    Object.assign(s, data);
    return s;
  }

  // Center point
  get cx() { return this.x + this.width / 2; }
  get cy() { return this.y + this.height / 2; }

  // Bounding box corners (unrotated)
  get bounds() {
    return { x: this.x, y: this.y, w: this.width, h: this.height };
  }
}
