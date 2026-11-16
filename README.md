# AI Model Evaluation Dashboard

A portfolio-ready benchmarking application for measuring **multiple-choice accuracy** and **response latency** across curated IT datasets.

The project provides a browser dashboard, persistent SQLite run history, live progress updates using Server-Sent Events, a built-in deterministic demo provider, and an optional OpenAI provider.

## Why this project

AI integrations are more useful when they can be measured rather than simply demonstrated. This application treats model evaluation as an engineering workflow: select datasets, run a benchmark, persist each result, stream progress to the UI, and compare performance by subject area.

## Features

- Run evaluations across multiple datasets
- Compare accuracy by dataset
- Measure per-question and average response latency
- Live progress updates with Server-Sent Events (SSE)
- Persistent run history with SQLite
- Detailed question-level results
- Built-in demo provider — no API key required
- Optional OpenAI provider through `OPENAI_API_KEY`
- No credentials committed to source control
- Zero npm runtime dependencies
- Responsive dashboard UI
- Automated tests with Node's built-in test runner
- Docker support and GitHub Actions CI

## Tech stack

- **Node.js 22+**
- **HTTP/REST API** using the Node standard library
- **SQLite** via `node:sqlite`
- **Server-Sent Events** for live progress
- **Vanilla JavaScript / HTML / CSS**
- Optional **OpenAI API** integration via `fetch`

## Architecture

```text
Browser Dashboard
      |
      | REST + SSE
      v
Node.js HTTP Server
      |
      +---- Run Manager ---- Model Provider
      |                         |-- Demo simulator
      |                         `-- OpenAI API (optional)
      |
      +---- Dataset Loader ---- JSON datasets
      |
      `---- Evaluation Store -- SQLite
```

The model provider is intentionally isolated behind a small interface. That makes it straightforward to add another LLM provider without changing the run manager, database, or frontend.

## Quick start

Requirements: **Node.js 22.5 or newer**.

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Select **Demo simulator** to run the full project without an API key.

## OpenAI mode

Copy the environment template:

```bash
cp .env.example .env
```

Then set:

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```

You can replace `OPENAI_MODEL` with another model available to your OpenAI API account.

Never commit the `.env` file. It is ignored by Git.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Service health and configuration status |
| `GET` | `/api/datasets` | Available evaluation datasets |
| `POST` | `/api/runs` | Start an evaluation run |
| `GET` | `/api/runs` | Recent runs |
| `GET` | `/api/runs/:id` | Full results for one run |
| `GET` | `/api/runs/:id/events` | SSE progress stream |
| `DELETE` | `/api/runs` | Clear stored evaluation history |

Example run request:

```json
{
  "provider": "demo",
  "datasetIds": ["computer-security", "networking", "systems"],
  "limitPerDataset": 10
}
```

## Testing

```bash
npm test
```

The tests cover dataset validation, answer parsing, the demo provider, SQLite persistence, and summary calculations.

## Docker

```bash
docker compose up --build
```

Then open `http://localhost:3000`.

## Repository structure

```text
.
├── data/
│   ├── datasets/          # Version-controlled benchmark questions
│   └── runtime/           # Local SQLite database (gitignored)
├── public/                # Dashboard frontend
├── src/
│   ├── config.js
│   ├── datasets.js
│   ├── evaluator.js
│   ├── http-utils.js
│   ├── run-manager.js
│   └── store.js
├── test/
├── server.js
├── Dockerfile
└── compose.yaml
```

## Engineering improvements over a basic prototype

This version was designed around production-style concerns that are easy to discuss in an interview:

- secrets are supplied through environment variables rather than committed to Git
- the application does not depend on an external database account
- evaluation runs and question results are persisted locally
- the frontend receives incremental progress instead of waiting for one large request
- provider logic is separated from orchestration and persistence
- malformed datasets are rejected during startup
- API input is bounded and validated
- automated tests and CI verify core behavior

## Future improvements

- concurrent evaluation with configurable rate limits
- token and cost tracking
- multiple LLM providers in the same benchmark
- dataset upload/import
- export to CSV/JSON
- authentication for shared deployments
- statistical confidence intervals and repeated trials

## License

MIT
