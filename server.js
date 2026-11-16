const http = require('node:http');
const path = require('node:path');
const config = require('./src/config');
const { loadDatasets } = require('./src/datasets');
const { createProvider } = require('./src/evaluator');
const { EvaluationStore } = require('./src/store');
const { RunManager } = require('./src/run-manager');
const { sendJson, readJson, serveStatic } = require('./src/http-utils');

const publicDir = path.join(__dirname, 'public');
const dbPath = path.join(__dirname, 'data', 'runtime', 'evaluations.db');
const datasets = loadDatasets();
const store = new EvaluationStore(dbPath);
const manager = new RunManager({
  store,
  datasets,
  createProvider: (name) => createProvider(name, config)
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, datasets: datasets.length, openAiConfigured: Boolean(config.openAiApiKey) });
    }

    if (req.method === 'GET' && pathname === '/api/datasets') {
      return sendJson(res, 200, datasets.map((d) => ({ id: d.id, name: d.name, description: d.description, count: d.questions.length })));
    }

    if (req.method === 'GET' && pathname === '/api/runs') {
      return sendJson(res, 200, { runs: store.listRuns(20) });
    }

    if (req.method === 'DELETE' && pathname === '/api/runs') {
      store.clearRuns();
      return sendJson(res, 200, { success: true });
    }

    if (req.method === 'POST' && pathname === '/api/runs') {
      const body = await readJson(req);
      const provider = body.provider === 'openai' ? 'openai' : 'demo';
      const datasetIds = Array.isArray(body.datasetIds) ? body.datasetIds : datasets.map((d) => d.id);
      const requestedLimit = Number(body.limitPerDataset || 10);
      const limitPerDataset = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 10, 25));
      const run = manager.start({ providerName: provider, datasetIds, limitPerDataset });
      return sendJson(res, 202, { run });
    }

    const runMatch = pathname.match(/^\/api\/runs\/([a-f0-9-]+)$/i);
    if (req.method === 'GET' && runMatch) {
      const run = store.getRun(runMatch[1]);
      return run ? sendJson(res, 200, { run }) : sendJson(res, 404, { error: 'Run not found.' });
    }

    const eventMatch = pathname.match(/^\/api\/runs\/([a-f0-9-]+)\/events$/i);
    if (req.method === 'GET' && eventMatch) {
      const id = eventMatch[1];
      const existing = store.getRun(id);
      if (!existing) return sendJson(res, 404, { error: 'Run not found.' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(`event: snapshot\ndata: ${JSON.stringify({ run: existing })}\n\n`);
      if (existing.status !== 'running') return res.end();

      const unsubscribe = manager.subscribe(id, (event) => {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        if (event.type === 'complete' || event.type === 'failed') res.end();
      });
      req.on('close', unsubscribe);
      return;
    }

    if (req.method === 'GET' && serveStatic(res, publicDir, pathname)) return;
    return sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    const status = /API_KEY|Select|Invalid JSON|too large/i.test(error.message) ? 400 : 500;
    return sendJson(res, status, { error: error.message || 'Internal server error.' });
  }
});

server.listen(config.port, () => {
  console.log(`AI Model Evaluation Dashboard: http://localhost:${config.port}`);
  console.log(`Demo mode available. OpenAI configured: ${Boolean(config.openAiApiKey)}`);
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
