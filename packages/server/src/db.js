import Database from 'better-sqlite3';

export function createDb(dbPath = './traces.db') {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id                TEXT PRIMARY KEY,
      trace_id          TEXT NOT NULL,
      parent_id         TEXT,
      name              TEXT,
      run_type          TEXT,
      status            TEXT,
      inputs            TEXT,
      outputs           TEXT,
      error             TEXT,
      start_time        INTEGER NOT NULL,
      end_time          INTEGER,
      tokens_prompt     INTEGER,
      tokens_completion INTEGER,
      extra             TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trace_id   ON runs(trace_id);
    CREATE INDEX IF NOT EXISTS idx_start_time ON runs(start_time);
    CREATE INDEX IF NOT EXISTS idx_status     ON runs(status);
  `);

  const insertStmt = sqlite.prepare(`
    INSERT OR REPLACE INTO runs
      (id, trace_id, parent_id, name, run_type, status, inputs, outputs, error,
       start_time, end_time, tokens_prompt, tokens_completion, extra)
    VALUES
      (@id, @trace_id, @parent_id, @name, @run_type, @status, @inputs, @outputs, @error,
       @start_time, @end_time, @tokens_prompt, @tokens_completion, @extra)
  `);

  const insertMany = sqlite.transaction((runs) => {
    for (const run of runs) insertStmt.run(run);
  });

  const updateStmt = sqlite.prepare(`
    UPDATE runs SET
      end_time   = COALESCE(@end_time, end_time),
      outputs    = COALESCE(@outputs, outputs),
      status     = COALESCE(@status, status),
      error      = COALESCE(@error, error),
      tokens_prompt     = COALESCE(@tokens_prompt, tokens_prompt),
      tokens_completion = COALESCE(@tokens_completion, tokens_completion),
      extra      = COALESCE(@extra, extra)
    WHERE id = @id
  `);

  return {
    insertRuns(runs) {
      insertMany(runs);
    },

    updateRun(id, fields) {
      updateStmt.run({ id, end_time: null, outputs: null, status: null, error: null, tokens_prompt: null, tokens_completion: null, extra: null, ...fields });
    },

    getTraces({ limit = 50, offset = 0, status, from, to, name } = {}) {
      let where = 'WHERE parent_id IS NULL';
      const params = {};
      if (status) { where += ' AND status = @status'; params.status = status; }
      if (from) { where += ' AND start_time >= @from'; params.from = new Date(from).getTime(); }
      if (to) { where += ' AND start_time <= @to'; params.to = new Date(to).getTime(); }
      if (name) { where += ' AND name LIKE @name'; params.name = `%${name}%`; }
      params.limit = limit;
      params.offset = offset;
      return sqlite.prepare(
        `SELECT * FROM runs ${where} ORDER BY start_time DESC LIMIT @limit OFFSET @offset`
      ).all(params);
    },

    getRunsByTrace(traceId) {
      return sqlite.prepare('SELECT * FROM runs WHERE trace_id = ? ORDER BY start_time ASC').all(traceId);
    },

    getStats() {
      return sqlite.prepare(`
        SELECT
          COUNT(*) as total_runs,
          COUNT(DISTINCT trace_id) as total_traces,
          AVG(CASE WHEN end_time IS NOT NULL THEN end_time - start_time END) as avg_latency_ms,
          SUM(tokens_prompt) as total_prompt_tokens,
          SUM(tokens_completion) as total_completion_tokens,
          ROUND(100.0 * SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as error_rate
        FROM runs
      `).get();
    },

    deleteOlderThan(timestampMs) {
      return sqlite.prepare('DELETE FROM runs WHERE start_time < ?').run(timestampMs).changes;
    },

    deleteOldestTraces() {
      const oldest = sqlite.prepare(
        'SELECT DISTINCT trace_id FROM runs ORDER BY start_time ASC LIMIT 1'
      ).get();
      if (!oldest) return 0;
      sqlite.prepare('DELETE FROM runs WHERE trace_id = ?').run(oldest.trace_id);
      return 1;
    },

    vacuum() {
      sqlite.exec('VACUUM');
    },

    close() {
      sqlite.close();
    },

    get raw() { return sqlite; },
  };
}
