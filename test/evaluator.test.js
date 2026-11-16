const test = require('node:test');
const assert = require('node:assert/strict');
const { DemoProvider, normalizeAnswer } = require('../src/evaluator');

test('normalizeAnswer extracts a standalone A-D answer', () => {
  assert.equal(normalizeAnswer('B'), 'B');
  assert.equal(normalizeAnswer('Answer: c'), 'C');
  assert.equal(normalizeAnswer('not available'), null);
});

test('demo provider returns a valid answer and latency', async () => {
  const provider = new DemoProvider();
  const result = await provider.answer({
    id: 'q1',
    question: 'Test?',
    options: { A: 'a', B: 'b', C: 'c', D: 'd' },
    correct: 'A'
  });
  assert.match(result.answer, /^[A-D]$/);
  assert.ok(result.latencyMs >= 0);
});
