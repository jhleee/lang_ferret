import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDb } from './db.js';

const TEST_DB = './test-traces.db';

describe('Database', () => {
  let db;

  before(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = createDb(TEST_DB);
  });

  after(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('should insert and query runs', () => {
    db.insertRuns([{
      id: 'run-1',
      trace_id: 'trace-1',
      parent_id: null,
      name: 'test_chain',
      run_type: 'chain',
      status: 'success',
      inputs: '{"q":"hello"}',
      outputs: '{"a":"world"}',
      error: null,
      start_time: Date.now() - 1000,
      end_time: Date.now(),
      tokens_prompt: 10,
      tokens_completion: 5,
      extra: null,
    }]);
    const rows = db.getTraces({ limit: 10, offset: 0 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].trace_id, 'trace-1');
  });

  it('should update a run', () => {
    db.updateRun('run-1', {
      end_time: Date.now() + 500,
      outputs: '{"a":"updated"}',
      status: 'success',
    });
    const runs = db.getRunsByTrace('trace-1');
    assert.equal(runs[0].outputs, '{"a":"updated"}');
  });

  it('should return stats', () => {
    const stats = db.getStats();
    assert.equal(stats.total_runs, 1);
    assert.equal(typeof stats.avg_latency_ms, 'number');
  });

  it('should delete old runs by TTL', () => {
    db.insertRuns([{
      id: 'run-old',
      trace_id: 'trace-old',
      parent_id: null,
      name: 'old_chain',
      run_type: 'chain',
      status: 'success',
      inputs: '{}',
      outputs: '{}',
      error: null,
      start_time: 1000,
      end_time: 2000,
      tokens_prompt: 0,
      tokens_completion: 0,
      extra: null,
    }]);
    const deleted = db.deleteOlderThan(Date.now() - 86400000);
    assert.ok(deleted >= 1);
  });
});
