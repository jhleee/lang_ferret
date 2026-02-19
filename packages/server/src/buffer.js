export class CircularBuffer {
  #buf;
  #head = 0;
  #count = 0;
  #capacity;

  constructor(capacity = 1000) {
    this.#capacity = capacity;
    this.#buf = new Array(capacity);
  }

  push(item) {
    const idx = (this.#head + this.#count) % this.#capacity;
    if (this.#count < this.#capacity) {
      this.#count++;
    } else {
      this.#head = (this.#head + 1) % this.#capacity;
    }
    this.#buf[idx] = item;
  }

  drain() {
    const items = [];
    for (let i = 0; i < this.#count; i++) {
      items.push(this.#buf[(this.#head + i) % this.#capacity]);
    }
    this.#count = 0;
    this.#head = 0;
    return items;
  }

  get size() {
    return this.#count;
  }
}
