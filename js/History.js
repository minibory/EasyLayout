export class History {
  constructor(maxSize = 50) {
    this.stack = [];
    this.pointer = -1;
    this.maxSize = maxSize;
  }

  push(snapshot) {
    // Remove redo states
    this.stack.splice(this.pointer + 1);
    this.stack.push(JSON.stringify(snapshot));
    if (this.stack.length > this.maxSize) this.stack.shift();
    this.pointer = this.stack.length - 1;
  }

  undo() {
    if (!this.canUndo) return null;
    this.pointer--;
    return JSON.parse(this.stack[this.pointer]);
  }

  redo() {
    if (!this.canRedo) return null;
    this.pointer++;
    return JSON.parse(this.stack[this.pointer]);
  }

  get canUndo() { return this.pointer > 0; }
  get canRedo() { return this.pointer < this.stack.length - 1; }
}
