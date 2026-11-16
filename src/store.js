const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

class EvaluationStore {
  constructor(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        total INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        correct INTEGER NOT NULL DEFAULT 0,
        avg_latency_ms REAL NOT NULL DEFAULT 0,
        error TEXT
      );
      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        dataset_id TEXT NOT NULL,
        dataset_name TEXT NOT NULL,
        question_id TEXT NOT NULL,
        question TEXT NOT NULL,
        expected TEXT NOT NULL,
        predicted TEXT,
        correct INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        raw_answer TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );
      CREATE INDEX IF NOT EXISTS idx_results_run_id ON results(run_id);
    `);
  }

  createRun({ id, provider, total }) {
    this.db.prepare(`INSERT INTO runs (id, provider, status, created_at, total) VALUES (?, ?, 'running', ?, ?)`)
      .run(id, provider, new Date().toISOString(), total);
  }

  addResult(result) {
    this.db.prepare(`
      INSERT INTO results (
        run_id, dataset_id, dataset_name, question_id, question,
        expected, predicted, correct, latency_ms, raw_answer, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.runId, result.datasetId, result.datasetName, result.questionId,
      result.question, result.expected, result.predicted, result.correct ? 1 : 0,
      result.latencyMs, result.rawAnswer || '', new Date().toISOString()
    );

    const stats = this.db.prepare(`
      SELECT COUNT(*) AS completed,
             SUM(correct) AS correct,
             AVG(latency_ms) AS avg_latency_ms
      FROM results WHERE run_id = ?
    `).get(result.runId);

    this.db.prepare(`UPDATE runs SET completed = ?, correct = ?, avg_latency_ms = ? WHERE id = ?`)
      .run(stats.completed, stats.correct || 0, stats.avg_latency_ms || 0, result.runId);
  }

  completeRun(id) {
    this.db.prepare(`UPDATE runs SET status = 'completed', completed_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
  }

  failRun(id, error) {
    this.db.prepare(`UPDATE runs SET status = 'failed', completed_at = ?, error = ? WHERE id = ?`)
      .run(new Date().toISOString(), String(error).slice(0, 1000), id);
  }

  getRun(id) {
    const run = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
    if (!run) return null;
    const results = this.db.prepare('SELECT * FROM results WHERE run_id = ? ORDER BY id ASC').all(id);
    return formatRun(run, results);
  }

  listRuns(limit = 20) {
    return this.db.prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?').all(limit).map((run) => formatRun(run));
  }

  clearRuns() {
    this.db.exec('DELETE FROM results; DELETE FROM runs;');
  }

  close() {
    this.db.close();
  }
}

function formatRun(run, results = undefined) {
  const formatted = {
    id: run.id,
    provider: run.provider,
    status: run.status,
    createdAt: run.created_at,
    completedAt: run.completed_at,
    total: run.total,
    completed: run.completed,
    correct: run.correct,
    accuracy: run.completed ? Number(((run.correct / run.completed) * 100).toFixed(1)) : 0,
    avgLatencyMs: Math.round(run.avg_latency_ms || 0),
    error: run.error || null
  };
  if (results) {
    formatted.results = results.map((r) => ({
      datasetId: r.dataset_id,
      datasetName: r.dataset_name,
      questionId: r.question_id,
      question: r.question,
      expected: r.expected,
      predicted: r.predicted,
      correct: Boolean(r.correct),
      latencyMs: r.latency_ms
    }));
    formatted.datasets = summarizeDatasets(formatted.results);
  }
  return formatted;
}

function summarizeDatasets(results) {
  const groups = new Map();
  for (const result of results) {
    if (!groups.has(result.datasetId)) {
      groups.set(result.datasetId, { id: result.datasetId, name: result.datasetName, total: 0, correct: 0, totalLatency: 0 });
    }
    const group = groups.get(result.datasetId);
    group.total += 1;
    group.correct += result.correct ? 1 : 0;
    group.totalLatency += result.latencyMs;
  }
  return [...groups.values()].map((group) => ({
    id: group.id,
    name: group.name,
    total: group.total,
    correct: group.correct,
    accuracy: Number(((group.correct / group.total) * 100).toFixed(1)),
    avgLatencyMs: Math.round(group.totalLatency / group.total)
  }));
}

module.exports = { EvaluationStore, formatRun, summarizeDatasets };
