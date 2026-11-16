const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { EvaluationStore } = require('../src/store');

test('store persists and summarizes evaluation results', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-store-'));
  const store = new EvaluationStore(path.join(dir, 'test.db'));
  store.createRun({ id: 'run-1', provider: 'demo', total: 2 });
  store.addResult({ runId: 'run-1', datasetId: 'a', datasetName: 'A', questionId: '1', question: 'Q1', expected: 'A', predicted: 'A', correct: true, latencyMs: 100, rawAnswer: 'A' });
  store.addResult({ runId: 'run-1', datasetId: 'a', datasetName: 'A', questionId: '2', question: 'Q2', expected: 'B', predicted: 'C', correct: false, latencyMs: 200, rawAnswer: 'C' });
  store.completeRun('run-1');
  const run = store.getRun('run-1');
  assert.equal(run.status, 'completed');
  assert.equal(run.completed, 2);
  assert.equal(run.accuracy, 50);
  assert.equal(run.avgLatencyMs, 150);
  assert.equal(run.datasets[0].accuracy, 50);
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
