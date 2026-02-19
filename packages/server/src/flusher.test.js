import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CircularBuffer } from './buffer.js';
import { createDb } from './db.js';
import { createFlusher } from './flusher.js';

const TEST_DB = './test-flusher.db';

describe('Flusher', () => {
  let db, buffer, flusher;

  before(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = createDb(TEST_DB);
    buffer = new CircularBuffer(100);
  });

  after(() => {
    if (flusher) flusher.stop();
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('flush() should move buffer items to DB', () => {
    buffer.push({
      id: 'r1', trace_id: 't1', parent_id: null, name: 'chain',
      run_type: 'chain', status: 'success', inputs: '{}', outputs: '{}',
      error: null, start_time: Date.now(), end_time: Date.now(),
      tokens_prompt: 10, tokens_completion: 5, extra: null,
    });

    flusher = createFlusher({ db, buffer, flushIntervalMs: 100000, flushBatchSize: 100, ttlDays: 3, maxDbSizeMb: 200, vacuumOnCleanup: false, dbPath: TEST_DB });
    const count = flusher.flush();
    assert.equal(count, 1);
    assert.equal(buffer.size, 0);

    const rows = db.getTraces({ limit: 10, offset: 0 });
    assert.equal(rows.length, 1);
  });

  it('flush() with empty buffer returns 0', () => {
    const count = flusher.flush();
    assert.equal(count, 0);
  });
});
