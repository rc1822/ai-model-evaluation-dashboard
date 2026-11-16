const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');

class RunManager {
  constructor({ store, datasets, createProvider }) {
    this.store = store;
    this.datasets = datasets;
    this.createProvider = createProvider;
    this.emitters = new Map();
  }

  start({ providerName, datasetIds, limitPerDataset }) {
    const selected = this.datasets.filter((dataset) => datasetIds.includes(dataset.id));
    if (!selected.length) throw new Error('Select at least one valid dataset.');

    const questions = selected.flatMap((dataset) =>
      dataset.questions.slice(0, limitPerDataset).map((question) => ({ dataset, question }))
    );
    if (!questions.length) throw new Error('The selected datasets contain no questions.');

    const provider = this.createProvider(providerName);
    const id = randomUUID();
    const emitter = new EventEmitter();
    this.emitters.set(id, emitter);
    this.store.createRun({ id, provider: provider.name, total: questions.length });

    setImmediate(() => this.#execute(id, provider, questions, emitter));
    return this.store.getRun(id);
  }

  subscribe(id, listener) {
    let emitter = this.emitters.get(id);
    if (!emitter) {
      emitter = new EventEmitter();
      this.emitters.set(id, emitter);
    }
    emitter.on('event', listener);
    return () => emitter.off('event', listener);
  }

  async #execute(id, provider, questions, emitter) {
    try {
      let index = 0;
      for (const { dataset, question } of questions) {
        index += 1;
        const output = await provider.answer(question);
        const correct = output.answer === question.correct;
        this.store.addResult({
          runId: id,
          datasetId: dataset.id,
          datasetName: dataset.name,
          questionId: question.id,
          question: question.question,
          expected: question.correct,
          predicted: output.answer,
          correct,
          latencyMs: output.latencyMs,
          rawAnswer: output.raw
        });
        const run = this.store.getRun(id);
        emitter.emit('event', { type: 'progress', index, run });
      }
      this.store.completeRun(id);
      const run = this.store.getRun(id);
      emitter.emit('event', { type: 'complete', run });
      emitter.removeAllListeners();
      setTimeout(() => this.emitters.delete(id), 60_000).unref?.();
    } catch (error) {
      this.store.failRun(id, error.message || error);
      const run = this.store.getRun(id);
      emitter.emit('event', { type: 'failed', run });
      emitter.removeAllListeners();
    }
  }
}

module.exports = { RunManager };
