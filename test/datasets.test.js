const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDatasets } = require('../src/datasets');

test('all bundled datasets load and validate', () => {
  const datasets = loadDatasets();
  assert.equal(datasets.length, 3);
  for (const dataset of datasets) {
    assert.equal(dataset.questions.length, 10);
  }
});
