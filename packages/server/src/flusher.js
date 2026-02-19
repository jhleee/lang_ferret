import fs from 'node:fs';

export function createFlusher({ db, buffer, flushIntervalMs = 5000, flushBatchSize = 100, ttlDays = 3, maxDbSizeMb = 200, vacuumOnCleanup = false, dbPath = './traces.db', onFlush = null }) {
  let timer = null;

  function normalizeRun(run) {
    return {
      id: run.id,
      trace_id: run.trace_id ?? run.id,
      parent_id: run.parent_run_id ?? run.parent_id ?? null,
      name: run.name ?? null,
      run_type: run.run_type ?? null,
      status: run.status ?? (run.error ? 'error' : (run.end_time ? 'success' : null)),
      inputs: typeof run.inputs === 'string' ? run.inputs : (run.inputs ? JSON.stringify(run.inputs) : null),
      outputs: typeof run.outputs === 'string' ? run.outputs : (run.outputs ? JSON.stringify(run.outputs) : null),
      error: typeof run.error === 'string' ? run.error : (run.error ? JSON.stringify(run.error) : null),
      start_time: run.start_time instanceof Date ? run.start_time.getTime()
        : (typeof run.start_time === 'string' ? new Date(run.start_time).getTime()
        : (run.start_time ?? Date.now())),
      end_time: run.end_time instanceof Date ? run.end_time.getTime()
        : (typeof run.end_time === 'string' ? new Date(run.end_time).getTime()
        : (run.end_time ?? null)),
      tokens_prompt: run.prompt_tokens ?? run.tokens_prompt ?? null,
      tokens_completion: run.completion_tokens ?? run.tokens_completion ?? null,
      extra: run.extra ? (typeof run.extra === 'string' ? run.extra : JSON.stringify(run.extra)) : null,
    };
  }

  function flush() {
    const items = buffer.drain();
    if (items.length === 0) return 0;

    const inserts = [];
    const patches = [];
    for (const item of items) {
      if (item._patch) {
        const { _patch, ...rest } = item;
        patches.push(rest);
      } else {
        inserts.push(normalizeRun(item));
      }
    }

    if (inserts.length > 0) db.insertRuns(inserts);
    for (const patch of patches) {
      db.updateRun(patch.id, {
        end_time: patch.end_time instanceof Date ? patch.end_time.getTime()
          : (typeof patch.end_time === 'string' ? new Date(patch.end_time).getTime() : (patch.end_time ?? null)),
        outputs: patch.outputs ? (typeof patch.outputs === 'string' ? patch.outputs : JSON.stringify(patch.outputs)) : null,
        status: patch.status ?? (patch.error ? 'error' : null),
        error: patch.error ? (typeof patch.error === 'string' ? patch.error : JSON.stringify(patch.error)) : null,
        tokens_prompt: patch.prompt_tokens ?? patch.tokens_prompt ?? null,
        tokens_completion: patch.completion_tokens ?? patch.tokens_completion ?? null,
        extra: patch.extra ? (typeof patch.extra === 'string' ? patch.extra : JSON.stringify(patch.extra)) : null,
      });
    }

    cleanup();
    if (onFlush) onFlush(inserts);
    return inserts.length + patches.length;
  }

  function cleanup() {
    const cutoff = Date.now() - ttlDays * 86400000;
    db.deleteOlderThan(cutoff);

    try {
      const stat = fs.statSync(dbPath);
      const maxBytes = maxDbSizeMb * 1024 * 1024;
      if (stat.size > maxBytes) {
        for (let i = 0; i < 100; i++) {
          db.deleteOldestTraces();
          const newStat = fs.statSync(dbPath);
          if (newStat.size <= maxBytes) break;
        }
      }
    } catch { /* db file may not exist yet */ }

    if (vacuumOnCleanup) {
      db.vacuum();
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      if (buffer.size >= 1) flush();
    }, flushIntervalMs);
    timer.unref();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function checkBatchSize() {
    if (buffer.size >= flushBatchSize) flush();
  }

  return { flush, start, stop, checkBatchSize, cleanup };
}
