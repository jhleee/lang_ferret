import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CircularBuffer } from './buffer.js';

describe('CircularBuffer', () => {
  it('should store and drain items', () => {
    const buf = new CircularBuffer(5);
    buf.push({ id: '1' });
    buf.push({ id: '2' });
    assert.equal(buf.size, 2);
    const items = buf.drain();
    assert.equal(items.length, 2);
    assert.equal(items[0].id, '1');
    assert.equal(buf.size, 0);
  });

  it('should overwrite oldest when full', () => {
    const buf = new CircularBuffer(3);
    buf.push({ id: '1' });
    buf.push({ id: '2' });
    buf.push({ id: '3' });
    buf.push({ id: '4' });
    const items = buf.drain();
    assert.equal(items.length, 3);
    assert.equal(items[0].id, '2');
    assert.equal(items[2].id, '4');
  });

  it('should report correct size', () => {
    const buf = new CircularBuffer(2);
    assert.equal(buf.size, 0);
    buf.push({ id: '1' });
    assert.equal(buf.size, 1);
    buf.push({ id: '2' });
    assert.equal(buf.size, 2);
    buf.push({ id: '3' });
    assert.equal(buf.size, 2);
  });

  it('drain returns empty array when empty', () => {
    const buf = new CircularBuffer(5);
    assert.deepEqual(buf.drain(), []);
  });
});
