const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const FAL_KEY = process.env.FAL_KEY || '';
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://fal.run/openrouter/router/openai/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
const SINGLE_PASS = (process.env.SINGLE_PASS || 'true').toLowerCase() === 'true';
const LOG_PAYLOAD = (process.env.LOG_PAYLOAD || 'false').toLowerCase() === 'true';
const LOG_PAYLOAD_TRUNCATE = Number.parseInt(process.env.LOG_PAYLOAD_TRUNCATE || '0', 10);
const COOKIES_PATH = path.join(__dirname, 'cookies.txt');

const PORT = Number.parseInt(process.env.PORT || '8010', 10);
const EXTRA_PORT = Number.parseInt(process.env.EXTRA_PORT || (PORT === 8010 ? '8000' : '0'), 10);
const HISTORY_LIMIT = Number.parseInt(process.env.HISTORY_LIMIT || '200', 10);
const CACHE_TTL_MS = Number.parseInt(process.env.CACHE_TTL_MS || '0', 10);

const history = [];
const cache = new Map();

const LOG_PREFIX = '[edua]';

function log(message, meta) {
  const ts = new Date().toISOString();
  if (meta) {
    console.log(`${LOG_PREFIX} ${ts} ${message}`, meta);
    return;
  }
  console.log(`${LOG_PREFIX} ${ts} ${message}`);
}

function createRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch (_) {
    return url ? `len:${url.length}` : 'empty';
  }
}

function truncateText(value) {
  if (!LOG_PAYLOAD_TRUNCATE || typeof value !== 'string') {
    return value;
  }
  if (value.length <= LOG_PAYLOAD_TRUNCATE) {
    return value;
  }
  return `${value.slice(0, LOG_PAYLOAD_TRUNCATE)}...`;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return messages;
  }
  return messages.map((msg) => ({
    role: msg?.role,
    content: truncateText(msg?.content ?? '')
  }));
}

class ApiError extends Error {
  constructor(message, status, retryAfterSeconds) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function extractVideoId(url) {
  const match = String(url || '').match(/(?:v=|\/|embed\/|youtu\.be\/)([0-9A-Za-z_-]{11})/);
  return match ? match[1] : null;
}

function splitText(text, size = 3000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

function parseRetryAfterSeconds(message) {
  if (!message) return null;
  const match = message.match(/try again in\s+(\d+)m([0-9.]+)s/i);
  if (!match) return null;
  const minutes = Number.parseInt(match[1], 10);
  const seconds = Number.parseFloat(match[2]);
  return Number.isFinite(minutes) && Number.isFinite(seconds)
    ? Math.ceil(minutes * 60 + seconds)
    : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenRouter(payload, context = {}) {
  if (LOG_PAYLOAD) {
    log('openrouter payload', {
      reqId: context.reqId,
      model: payload?.model,
      response_format: payload?.response_format,
      messageCount: Array.isArray(payload?.messages) ? payload.messages.length : 0,
      messages: sanitizeMessages(payload?.messages)
    });
  }
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const message =
      errBody?.error?.message ||
      errBody?.message ||
      `OpenRouter error (HTTP ${response.status})`;
    let retryAfter = null;
    if (response.status === 429) {
      const headerRetry = response.headers.get('retry-after');
      const parsedHeader = headerRetry ? Number.parseInt(headerRetry, 10) : null;
      retryAfter = Number.isFinite(parsedHeader) ? parsedHeader : parseRetryAfterSeconds(message);
    }
    log('openrouter error', { status: response.status, message });
    throw new ApiError(message, response.status, retryAfter);
  }

  return response.json();
}

async function callOpenRouterWithRetry(payload, retries = 3, context = {}) {
  for (let i = 0; i < retries; i += 1) {
    try {
      return await callOpenRouter(payload, context);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        throw error;
      }
      if (i === retries - 1) {
        throw error;
      }
      await sleep(2 ** i * 1000);
    }
  }
  throw new ApiError('OpenRouter error', 500);
}

function validateOutput(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.title !== 'string' || !data.title.trim()) return false;

  const summarySections = data.summary_sections;
  if (!Array.isArray(summarySections) || summarySections.length === 0) return false;
  for (const section of summarySections) {
    if (!section || typeof section !== 'object') return false;
    if (typeof section.subtitle !== 'string' || !section.subtitle.trim()) return false;
    if (typeof section.content !== 'string' || !section.content.trim()) return false;
  }

  const keyConcepts = data.key_concepts;
  if (!Array.isArray(keyConcepts)) return false;
  for (const concept of keyConcepts) {
    if (!concept || typeof concept !== 'object') return false;
    if (typeof concept.term !== 'string' || !concept.term.trim()) return false;
    if (typeof concept.definition !== 'string' || !concept.definition.trim()) return false;
  }

  const examples = data.examples;
  if (!Array.isArray(examples)) return false;
  if (!examples.every((item) => typeof item === 'string' && item.trim())) return false;

  const questions = data.sorular;
  if (!Array.isArray(questions) || questions.length === 0) return false;
  for (const question of questions) {
    if (!question || typeof question !== 'object') return false;
    if (!['soru', 'secenekler', 'dogru_cevap'].every((k) => k in question)) return false;
    if (typeof question.soru !== 'string' || !question.soru.trim()) return false;
    if (!question.secenekler || typeof question.secenekler !== 'object') return false;
    const optionKeys = Object.keys(question.secenekler).sort().join('');
    if (optionKeys !== 'ABCD') return false;
    for (const key of ['A', 'B', 'C', 'D']) {
      const value = question.secenekler[key];
      if (typeof value !== 'string' || !value.trim()) return false;
    }
    if (!['A', 'B', 'C', 'D'].includes(question.dogru_cevap)) return false;
  }

  return true;
}

function cleanSubtitles(raw) {
  let cleaned = raw.replace(/WEBVTT.*?\n\n/s, '');
  cleaned = cleaned.replace(/\d{1,2}:\d{2}:\d{2}.*?\n/g, '');
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const dedup = [];
  for (const line of lines) {
    if (dedup.length === 0 || dedup[dedup.length - 1] !== line) {
      dedup.push(line);
    }
  }

  return dedup.join(' ');
}

function parseSubtitles(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    if (file.endsWith('.vtt') || file.endsWith('.srt')) {
      const raw = fs.readFileSync(path.join(directory, file), 'utf-8');
      const cleaned = cleanSubtitles(raw);
      if (cleaned.length > 100) {
        return cleaned;
      }
    }
  }
  return null;
}

function findYtdlpPaths() {
  const candidates = [];
  const localAppData = process.env.LOCALAPPDATA;
  const envOverride = process.env.YTDLP_PATH;
  if (envOverride && fs.existsSync(envOverride)) {
    candidates.push(envOverride);
  }
  if (!localAppData) {
    return candidates;
  }

  const wingetLink = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe');
  if (fs.existsSync(wingetLink)) {
    candidates.push(wingetLink);
  }

  const programsDir = path.join(localAppData, 'Programs');
  if (fs.existsSync(programsDir)) {
    try {
      const entries = fs.readdirSync(programsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const name = entry.name.toLowerCase();
        if (name.startsWith('python')) {
          const candidate = path.join(programsDir, entry.name, 'Scripts', 'yt-dlp.exe');
          if (fs.existsSync(candidate)) {
            candidates.push(candidate);
          }
        }
      }
    } catch (_) {
      // ignore
    }

    const direct = path.join(programsDir, 'yt-dlp', 'yt-dlp.exe');
    if (fs.existsSync(direct)) {
      candidates.push(direct);
    }
  }

  const packagesDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(packagesDir)) {
    try {
      const entries = fs.readdirSync(packagesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const name = entry.name.toLowerCase();
        if (!name.startsWith('yt-dlp')) {
          continue;
        }
        const candidate = path.join(packagesDir, entry.name, 'yt-dlp.exe');
        if (fs.existsSync(candidate)) {
          candidates.push(candidate);
        }
      }
    } catch (_) {
      // ignore
    }
  }

  return candidates;
}

function resolveYtdlpCommand() {
  const pathCandidates = findYtdlpPaths().map((cmd) => ({ cmd, args: [] }));
  const candidates = [
    ...pathCandidates,
    { cmd: 'yt-dlp', args: [] },
    { cmd: 'yt-dlp.exe', args: [] },
    { cmd: 'py', args: ['-m', 'yt_dlp'] },
    { cmd: 'python', args: ['-m', 'yt_dlp'] },
    { cmd: 'python3', args: ['-m', 'yt_dlp'] }
  ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.cmd, [...candidate.args, '--version'], {
      stdio: 'ignore',
      windowsHide: true
    });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }

  throw new Error('yt-dlp bulunamadi. PATH uzerinde veya Python modulu olarak kurulu olmali.');
}

function runCommand(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    let stderr = '';
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', (error) => resolve({ code: -1, error }));
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

async function getTranscript(youtubeUrl) {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'edua-'));
  try {
    const outputTemplate = path.join(tmpdir, 'transcript');
    const ytdlp = resolveYtdlpCommand();

    const baseArgs = [
      ...ytdlp.args,
      '--skip-download',
      '--no-playlist',
      '-o',
      outputTemplate
    ];

    if (fs.existsSync(COOKIES_PATH)) {
      baseArgs.push('--cookies', COOKIES_PATH);
    }

    for (const mode of ['--write-sub', '--write-auto-sub']) {
      for (const lang of ['tr', 'en']) {
        const args = [
          ...baseArgs,
          mode,
          '--sub-lang',
          lang,
          '--sub-format',
          'vtt',
          youtubeUrl
        ];

        await runCommand(ytdlp.cmd, args, tmpdir);
        const txt = parseSubtitles(tmpdir);
        if (txt) {
          return txt;
        }
      }
    }
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }

  return null;
}

async function summarizeChunks(fullText, reqId) {
  const chunks = splitText(fullText);
  const summaries = [];

  log('summarize chunks', { reqId, chunkCount: chunks.length, textLength: fullText.length });

  for (const chunk of chunks) {
    const res = await callOpenRouterWithRetry({
      messages: [
        { role: 'system', content: 'Kisa akademik ozet cikar.' },
        { role: 'user', content: chunk }
      ],
      model: OPENROUTER_MODEL,
      temperature: 0.3
    }, 3, { reqId });

    summaries.push(res.choices?.[0]?.message?.content || '');
  }

  return summaries;
}

async function generateFinalOutput(summaries, reqId) {
  log('generate final output', { reqId, summaryCount: summaries.length });
  const prompt = `
SADECE GECERLI JSON DON:

{
 "title": "Konu basligi (Turkce, kisa ve net)",
 "summary_sections": [
  {
   "subtitle": "Alt baslik",
   "content": "Bu bolumun icerigi (Turkce, 4-8 cumle)"
  }
 ],
 "key_concepts": [
  {
   "term": "Terim/Kavram",
   "definition": "Kisa aciklama (Turkce, 1-3 cumle)"
  }
 ],
 "examples": ["Metindeki ornek 1", "Metindeki ornek 2"],
 "sorular": [
  {
   "soru": "...",
   "secenekler": {
     "A": "...",
     "B": "...",
     "C": "...",
     "D": "..."
   },
   "dogru_cevap": "A"
  }
 ]
}

Aciklama ekleme.
Kurallar:
- "summary_sections" en az 3 bolum icersin.
- "key_concepts" en az 5 kavram icersin.
- "examples" metinden cikarilan en az 2 somut ornek icersin (yoksa bos liste donebilirsin).
- Sorular coktan secmeli olsun ve "dogru_cevap" A/B/C/D'den biri olsun.

Metin:
${summaries.join('\n')}
`;

  const res = await callOpenRouterWithRetry({
    messages: [{ role: 'user', content: prompt }],
    model: OPENROUTER_MODEL,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  }, 3, { reqId });

  const data = JSON.parse(res.choices?.[0]?.message?.content || '{}');
  if (!validateOutput(data)) {
    throw new Error('AI hatali format dondurdu');
  }

  log('final output validated', {
    reqId,
    sections: Array.isArray(data.summary_sections) ? data.summary_sections.length : 0,
    concepts: Array.isArray(data.key_concepts) ? data.key_concepts.length : 0,
    examples: Array.isArray(data.examples) ? data.examples.length : 0,
    questions: Array.isArray(data.sorular) ? data.sorular.length : 0
  });

  try {
    const sectionsText = (data.summary_sections || [])
      .map((section) => `${section.subtitle}\n${section.content}`.trim())
      .join('\n\n');
    const ozetText = `${(data.title || '').trim()}\n\n${sectionsText}`.trim();
    if (ozetText) {
      data.ozet = ozetText;
    }
  } catch (_) {
    // no-op
  }

  return data;
}

async function generateFinalOutputFromTranscript(fullText, reqId) {
  log('generate final output (single pass)', { reqId, textLength: fullText.length });
  const prompt = `
SADECE GECERLI JSON DON:

{
 "title": "Konu basligi (Turkce, kisa ve net)",
 "summary_sections": [
  {
   "subtitle": "Alt baslik",
   "content": "Bu bolumun icerigi (Turkce, 4-8 cumle)"
  }
 ],
 "key_concepts": [
  {
   "term": "Terim/Kavram",
   "definition": "Kisa aciklama (Turkce, 1-3 cumle)"
  }
 ],
 "examples": ["Metindeki ornek 1", "Metindeki ornek 2"],
 "sorular": [
  {
   "soru": "...",
   "secenekler": {
     "A": "...",
     "B": "...",
     "C": "...",
     "D": "..."
   },
   "dogru_cevap": "A"
  }
 ]
}

Aciklama ekleme.
Kurallar:
- "summary_sections" en az 3 bolum icersin.
- "key_concepts" en az 5 kavram icersin.
- "examples" metinden cikarilan en az 2 somut ornek icersin (yoksa bos liste donebilirsin).
- Sorular coktan secmeli olsun ve "dogru_cevap" A/B/C/D'den biri olsun.

Metin:
${fullText}
`;

  const res = await callOpenRouterWithRetry({
    messages: [{ role: 'user', content: prompt }],
    model: OPENROUTER_MODEL,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  }, 3, { reqId });

  const data = JSON.parse(res.choices?.[0]?.message?.content || '{}');
  if (!validateOutput(data)) {
    throw new Error('AI hatali format dondurdu');
  }

  try {
    const sectionsText = (data.summary_sections || [])
      .map((section) => `${section.subtitle}\n${section.content}`.trim())
      .join('\n\n');
    const ozetText = `${(data.title || '').trim()}\n\n${sectionsText}`.trim();
    if (ozetText) {
      data.ozet = ozetText;
    }
  } catch (_) {
    // no-op
  }

  log('final output validated (single pass)', {
    reqId,
    sections: Array.isArray(data.summary_sections) ? data.summary_sections.length : 0,
    concepts: Array.isArray(data.key_concepts) ? data.key_concepts.length : 0,
    examples: Array.isArray(data.examples) ? data.examples.length : 0,
    questions: Array.isArray(data.sorular) ? data.sorular.length : 0
  });

  return data;
}

function getCached(videoId) {
  const entry = cache.get(videoId);
  if (!entry) return null;
  if (CACHE_TTL_MS > 0 && Date.now() - entry.createdAt > CACHE_TTL_MS) {
    cache.delete(videoId);
    return null;
  }
  return entry.data;
}

function setCached(videoId, data) {
  cache.set(videoId, { data, createdAt: Date.now() });
}

function pushHistory(videoId, youtubeUrl, data) {
  history.unshift({
    video_id: videoId,
    video_url: youtubeUrl,
    created_at: new Date().toISOString(),
    ozet: data.ozet || '',
    sorular: data.sorular || []
  });

  if (history.length > HISTORY_LIMIT) {
    history.length = HISTORY_LIMIT;
  }
}

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

app.post('/api/analyze', async (req, res) => {
  const reqId = createRequestId();
  const startedAt = Date.now();
  try {
    if (!FAL_KEY) {
      log('analyze missing FAL key', { reqId });
      return res.status(500).json({ detail: 'FAL key yok' });
    }

    const youtubeUrl = req.body?.youtube_url || '';
    const summaryLength = req.body?.summary_length || '';
    const questionDifficulty = req.body?.question_difficulty || '';
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      log('analyze invalid url', { reqId, url: summarizeUrl(youtubeUrl) });
      return res.status(400).json({ detail: 'Gecersiz URL' });
    }

    log('analyze start', {
      reqId,
      videoId,
      url: summarizeUrl(youtubeUrl),
      model: OPENROUTER_MODEL,
      summaryLength,
      questionDifficulty
    });

    const cached = getCached(videoId);
    if (cached) {
      log('analyze cache hit', { reqId, videoId });
      return res.json({ status: 'success', source: 'cache', analiz: cached });
    }

    const transcript = await getTranscript(youtubeUrl);
    if (!transcript) {
      log('analyze transcript missing', { reqId, videoId });
      return res.status(422).json({ detail: 'Altyazi yok' });
    }

    log('analyze transcript ok', { reqId, length: transcript.length });

    const finalData = SINGLE_PASS
      ? await generateFinalOutputFromTranscript(transcript, reqId)
      : await generateFinalOutput(await summarizeChunks(transcript, reqId), reqId);

    setCached(videoId, finalData);
    pushHistory(videoId, youtubeUrl, finalData);

    log('analyze success', { reqId, videoId, ms: Date.now() - startedAt });

    return res.json({ status: 'success', source: 'fresh', analiz: finalData });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      const detail = { error: 'rate_limit_exceeded', message: error.message };
      if (Number.isFinite(error.retryAfterSeconds)) {
        detail.retry_after_seconds = error.retryAfterSeconds;
      }
      log('analyze rate limited', { reqId, retryAfterSeconds: error.retryAfterSeconds });
      return res.status(429).json({ detail });
    }

    log('analyze error', {
      reqId,
      message: String(error?.message || error),
      ms: Date.now() - startedAt
    });
    return res.status(500).json({ detail: String(error?.message || error) });
  }
});

app.get('/api/history', (req, res) => {
  log('history fetch', { count: history.length });
  res.json(history);
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  log(`api listening on http://127.0.0.1:${PORT}`, {
    model: OPENROUTER_MODEL,
    singlePass: SINGLE_PASS,
    logPayload: LOG_PAYLOAD,
    logPayloadTruncate: LOG_PAYLOAD_TRUNCATE,
    hasFalKey: Boolean(FAL_KEY),
    cacheTtlMs: CACHE_TTL_MS,
    historyLimit: HISTORY_LIMIT
  });
});

if (EXTRA_PORT && EXTRA_PORT !== PORT) {
  app.listen(EXTRA_PORT, () => {
    log(`api also listening on http://127.0.0.1:${EXTRA_PORT}`);
  });
}
