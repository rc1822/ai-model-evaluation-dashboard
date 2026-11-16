const state = { datasets: [], activeRun: null, stream: null };
const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function loadInitialData() {
  try {
    const [health, datasets, history] = await Promise.all([
      api('/api/health'), api('/api/datasets'), api('/api/runs')
    ]);
    state.datasets = datasets;
    $('apiStatus').textContent = health.openAiConfigured ? 'API online · OpenAI ready' : 'API online · Demo ready';
    $('apiStatus').classList.add('ok');
    renderDatasets();
    renderHistory(history.runs);
    if (history.runs[0]) await loadRun(history.runs[0].id);
  } catch (error) {
    $('apiStatus').textContent = 'API unavailable';
    $('runMessage').textContent = error.message;
  }
}

function renderDatasets() {
  $('datasets').innerHTML = state.datasets.map((dataset) => `
    <label class="dataset-option">
      <input type="checkbox" value="${escapeHtml(dataset.id)}" checked />
      <span>
        <strong>${escapeHtml(dataset.name)} · ${dataset.count}</strong>
        <small>${escapeHtml(dataset.description)}</small>
      </span>
    </label>
  `).join('');
}

async function startRun() {
  const datasetIds = [...$('datasets').querySelectorAll('input:checked')].map((input) => input.value);
  if (!datasetIds.length) return setMessage('Select at least one dataset.');
  $('startRun').disabled = true;
  setMessage('Starting evaluation…');
  try {
    const { run } = await api('/api/runs', {
      method: 'POST',
      body: JSON.stringify({
        provider: $('provider').value,
        datasetIds,
        limitPerDataset: Number($('limit').value)
      })
    });
    state.activeRun = run;
    renderRun(run);
    connectEvents(run.id);
    setMessage('Evaluation running. Results update live.');
    await refreshHistory();
  } catch (error) {
    setMessage(error.message);
    $('startRun').disabled = false;
  }
}

function connectEvents(id) {
  state.stream?.close();
  const stream = new EventSource(`/api/runs/${id}/events`);
  state.stream = stream;

  for (const eventName of ['snapshot', 'progress', 'complete', 'failed']) {
    stream.addEventListener(eventName, (event) => {
      const payload = JSON.parse(event.data);
      if (payload.run) {
        state.activeRun = payload.run;
        renderRun(payload.run);
      }
      if (eventName === 'complete' || eventName === 'failed') {
        stream.close();
        $('startRun').disabled = false;
        setMessage(eventName === 'complete' ? 'Evaluation complete.' : payload.run?.error || 'Evaluation failed.');
        refreshHistory();
      }
    });
  }
  stream.onerror = () => {
    if (state.activeRun?.status === 'running') setMessage('Live connection interrupted. You can reload the run from history.');
  };
}

function renderRun(run) {
  $('accuracy').textContent = run.completed ? `${run.accuracy}%` : '—';
  $('latency').textContent = run.completed ? `${run.avgLatencyMs} ms` : '—';
  $('progress').textContent = `${run.completed}/${run.total}`;
  $('currentProvider').textContent = run.provider || '—';
  $('resultCount').textContent = run.results ? `${run.results.length} results` : '';

  if (run.datasets?.length) {
    $('datasetStats').classList.remove('empty-state');
    $('datasetStats').innerHTML = run.datasets.map((dataset) => `
      <div class="bar-row">
        <div class="bar-label"><strong>${escapeHtml(dataset.name)}</strong><span>${dataset.accuracy}% · ${dataset.avgLatencyMs} ms</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${dataset.accuracy}%"></div></div>
      </div>
    `).join('');
  } else {
    $('datasetStats').classList.add('empty-state');
    $('datasetStats').textContent = 'Waiting for results…';
  }

  if (run.results?.length) {
    $('resultsBody').innerHTML = run.results.map((result) => `
      <tr>
        <td>${escapeHtml(result.datasetName)}</td>
        <td>${escapeHtml(result.question)}</td>
        <td>${escapeHtml(result.expected)}</td>
        <td>${escapeHtml(result.predicted || 'N/A')}</td>
        <td>${result.latencyMs} ms</td>
        <td class="${result.correct ? 'good' : 'bad'}">${result.correct ? 'Correct' : 'Incorrect'}</td>
      </tr>
    `).join('');
  } else {
    $('resultsBody').innerHTML = '<tr><td colspan="6" class="empty-cell">Waiting for question results.</td></tr>';
  }
}

async function loadRun(id) {
  try {
    const { run } = await api(`/api/runs/${id}`);
    state.activeRun = run;
    renderRun(run);
    if (run.status === 'running') {
      $('startRun').disabled = true;
      connectEvents(id);
    }
  } catch (error) {
    setMessage(error.message);
  }
}

function renderHistory(runs) {
  if (!runs.length) {
    $('history').className = 'history empty-state';
    $('history').textContent = 'No evaluation history yet.';
    return;
  }
  $('history').className = 'history';
  $('history').innerHTML = runs.map((run) => `
    <div class="history-item" data-run-id="${run.id}" role="button" tabindex="0">
      <div class="history-top"><strong>${escapeHtml(run.provider)}</strong><span class="badge ${run.status}">${escapeHtml(run.status)}</span></div>
      <div class="history-bottom">${run.completed}/${run.total} · ${run.accuracy}% accuracy · ${new Date(run.createdAt).toLocaleString()}</div>
    </div>
  `).join('');
  $('history').querySelectorAll('.history-item').forEach((item) => {
    const activate = () => loadRun(item.dataset.runId);
    item.addEventListener('click', activate);
    item.addEventListener('keydown', (event) => { if (event.key === 'Enter') activate(); });
  });
}

async function refreshHistory() {
  const { runs } = await api('/api/runs');
  renderHistory(runs);
}

async function clearHistory() {
  if (!confirm('Clear all stored evaluation history?')) return;
  await api('/api/runs', { method: 'DELETE' });
  state.activeRun = null;
  $('accuracy').textContent = '—';
  $('latency').textContent = '—';
  $('progress').textContent = '—';
  $('currentProvider').textContent = '—';
  $('datasetStats').className = 'bar-list empty-state';
  $('datasetStats').textContent = 'Run a benchmark to populate results.';
  $('resultsBody').innerHTML = '<tr><td colspan="6" class="empty-cell">No results yet.</td></tr>';
  $('resultCount').textContent = '';
  await refreshHistory();
  setMessage('Evaluation history cleared.');
}

function setMessage(message) { $('runMessage').textContent = message; }

$('startRun').addEventListener('click', startRun);
$('clearRuns').addEventListener('click', clearHistory);
loadInitialData();
