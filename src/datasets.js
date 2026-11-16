const fs = require('node:fs');
const path = require('node:path');

const DATASET_DIR = path.join(__dirname, '..', 'data', 'datasets');

function loadDatasets() {
  return fs.readdirSync(DATASET_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const fullPath = path.join(DATASET_DIR, name);
      const dataset = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      validateDataset(dataset, name);
      return dataset;
    });
}

function validateDataset(dataset, fileName = 'dataset') {
  if (!dataset.id || !dataset.name || !Array.isArray(dataset.questions)) {
    throw new Error(`Invalid dataset structure: ${fileName}`);
  }
  const seen = new Set();
  for (const q of dataset.questions) {
    if (!q.id || seen.has(q.id)) throw new Error(`Duplicate/missing question id in ${fileName}`);
    seen.add(q.id);
    if (!q.question || !q.options || !['A', 'B', 'C', 'D'].includes(q.correct)) {
      throw new Error(`Invalid question ${q.id} in ${fileName}`);
    }
    for (const letter of ['A', 'B', 'C', 'D']) {
      if (typeof q.options[letter] !== 'string') throw new Error(`Question ${q.id} missing option ${letter}`);
    }
  }
}

function getDataset(id) {
  return loadDatasets().find((dataset) => dataset.id === id) || null;
}

module.exports = { loadDatasets, getDataset, validateDataset };
