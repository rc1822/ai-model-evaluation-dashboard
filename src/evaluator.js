const { performance } = require('node:perf_hooks');

function normalizeAnswer(text) {
  const match = String(text || '').toUpperCase().match(/\b([A-D])\b/);
  return match ? match[1] : null;
}

function hashText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

class DemoProvider {
  constructor() {
    this.name = 'demo-simulator';
  }

  async answer(question) {
    const start = performance.now();
    const letters = ['A', 'B', 'C', 'D'];
    const hash = hashText(`${question.id}:${question.question}`);
    const intentionallyWrong = hash % 5 === 0;
    let answer = question.correct;
    if (intentionallyWrong) {
      answer = letters[(letters.indexOf(question.correct) + 1 + (hash % 3)) % 4];
    }
    await new Promise((resolve) => setTimeout(resolve, 30 + (hash % 70)));
    return {
      answer,
      latencyMs: Math.round(performance.now() - start),
      raw: answer
    };
  }
}

class OpenAIProvider {
  constructor({ apiKey, model }) {
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for the OpenAI provider.');
    this.apiKey = apiKey;
    this.model = model;
    this.name = `openai:${model}`;
  }

  async answer(question) {
    const start = performance.now();
    const prompt = [
      'Answer the multiple-choice question with only one letter: A, B, C, or D.',
      '',
      question.question,
      ...['A', 'B', 'C', 'D'].map((letter) => `${letter}. ${question.options[letter]}`)
    ].join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        max_tokens: 8,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body?.error?.message || `OpenAI request failed with status ${response.status}`;
      throw new Error(message);
    }

    const raw = body?.choices?.[0]?.message?.content || '';
    return {
      answer: normalizeAnswer(raw),
      latencyMs: Math.round(performance.now() - start),
      raw
    };
  }
}

function createProvider(name, config) {
  if (name === 'demo') return new DemoProvider();
  if (name === 'openai') return new OpenAIProvider({ apiKey: config.openAiApiKey, model: config.openAiModel });
  throw new Error(`Unsupported provider: ${name}`);
}

module.exports = { DemoProvider, OpenAIProvider, createProvider, normalizeAnswer, hashText };
