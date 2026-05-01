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

const DEFAULT_QUESTION_COUNT = 10;
const MIN_QUESTION_COUNT = 5;
const MAX_QUESTION_COUNT = 15;

const PORT = Number.parseInt(process.env.PORT || '8010', 10);
const EXTRA_PORT = Number.parseInt(process.env.EXTRA_PORT || (PORT === 8010 ? '8000' : '0'), 10);
const HISTORY_LIMIT = Number.parseInt(process.env.HISTORY_LIMIT || '200', 10);
const CACHE_TTL_MS = Number.parseInt(process.env.CACHE_TTL_MS || '0', 10);

const history = [];
const cache = new Map();
const transcriptCache = new Map();
const analysisIndex = new Map();

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

function clampQuestionCount(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_QUESTION_COUNT;
  }
  return Math.min(MAX_QUESTION_COUNT, Math.max(MIN_QUESTION_COUNT, value));
}

function normalizeQuestionText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s?!.]/g, '')
    .trim();
}

function sanitizeQuestions(questions) {
  if (!Array.isArray(questions)) {
    return [];
  }
  return questions.filter((q) => {
    if (!q || typeof q !== 'object') return false;
    if (typeof q.soru !== 'string' || !q.soru.trim()) return false;
    if (!q.secenekler || typeof q.secenekler !== 'object') return false;
    const keys = Object.keys(q.secenekler).sort().join('');
    if (keys !== 'ABCD') return false;
    if (!['A', 'B', 'C', 'D'].includes(q.dogru_cevap)) return false;
    return true;
  });
}

function dedupeQuestions(questions) {
  const result = [];
  const seen = new Set();
  for (const q of sanitizeQuestions(questions)) {
    const key = normalizeQuestionText(q.soru);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(q);
  }
  return result;
}

function getSummaryGuidance(summaryLength) {
  if (summaryLength === 'kisa') {
    return 'Ozet kisa olsun, her bolum 2-4 cumle.';
  }
  if (summaryLength === 'detayli') {
    return 'Ozet detayli olsun, her bolum 6-9 cumle.';
  }
  return 'Ozet orta uzunlukta olsun, her bolum 4-6 cumle.';
}

function getDifficultyGuidance(questionDifficulty) {
  if (questionDifficulty === 'kolay') {
    return 'Soru zorlugu kolay olsun, temel bilgileri yoklasin.';
  }
  if (questionDifficulty === 'zor') {
    return 'Soru zorlugu zor olsun, kavramlari ayirt ettirsin.';
  }
  return 'Soru zorlugu orta olsun, hem tanim hem uygulama sorgulansin.';
}

function findAnalysisRecord(analysisId, videoId) {
  if (analysisId && analysisIndex.has(analysisId)) {
    return analysisIndex.get(analysisId);
  }
  if (videoId) {
    return history.find((item) => item.video_id === videoId);
  }
  return null;
}

function getQueryTerms(text) {
  const turkishMap = { 'ı': 'i', 'ğ': 'g', 'ü': 'u', 'ş': 's', 'ö': 'o', 'ç': 'c' };
  const normalized = String(text || '').toLowerCase().replace(/[ığüşöç]/g, c => turkishMap[c] || c);
  return normalized
    .split(/\W+/)
    .filter((term) => term.length > 2);
}

function selectRelevantChunks(fullText, query, maxChunks = 6, chunkSize = 2000) {
  const chunks = splitText(fullText, chunkSize);
  const terms = getQueryTerms(query);
  const turkishMap = { 'ı': 'i', 'ğ': 'g', 'ü': 'u', 'ş': 's', 'ö': 'o', 'ç': 'c' };
  if (terms.length === 0) {
    return chunks.slice(0, Math.min(maxChunks, chunks.length));
  }

  const scored = chunks.map((chunk, idx) => {
    const lower = chunk.toLowerCase().replace(/[ığüşöç]/g, c => turkishMap[c] || c);
    let score = 0;
    for (const term of terms) {
      // Count occurrences, not just presence
      let pos = 0;
      while ((pos = lower.indexOf(term, pos)) !== -1) {
        score += 1;
        pos += term.length;
      }
      // Partial/stem match bonus
      const stem = term.slice(0, Math.max(3, Math.floor(term.length * 0.7)));
      if (stem !== term && lower.includes(stem)) {
        score += 0.3;
      }
    }
    return { chunk, score, idx };
  });

  // Always include first chunk for context
  const sorted = scored.sort((a, b) => b.score - a.score);
  const selected = sorted.slice(0, Math.min(maxChunks, sorted.length));
  
  // Ensure first chunk is included if not already
  if (chunks.length > 0 && !selected.find(s => s.idx === 0)) {
    selected.pop();
    selected.push(scored.find(s => s.idx === 0));
  }
  
  // Sort by original order for coherent reading
  selected.sort((a, b) => a.idx - b.idx);
  return selected.map((item) => item.chunk);
}

function buildSummaryPrompt(fullText, options) {
  const guidance = getSummaryGuidance(options.summaryLength);
  return `
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
 "important_regions": [
  {
   "label": "Kritik veya vurgulu kismin kisa basligi",
   "text": "Bu kismin neden onemli oldugunu 1-2 cumle ile acikla"
  }
 ]
}

Aciklama ekleme.
Kurallar:
- "summary_sections" en az 3 bolum icersin.
- "key_concepts" en az 5 kavram icersin.
- "examples" metinden cikarilan en az 2 somut ornek icersin (yoksa bos liste donebilirsin).
- "important_regions" metindeki vurgulanan, kritik veya onemli kisimlar. Tonlama, tekrar eden ifadeler, uyari ifadeleri (dikkat, onemli, unutmayin gibi) veya anahtar kavramlarin yogun gecistigi bolgeleri tespit et. En az 2, en fazla 5 adet olsun.
- Metin disina cikma.
- ${guidance}

Metin:
${fullText}
`;
}

function buildQuestionsPrompt(fullText, options, existingQuestions) {
  const difficulty = getDifficultyGuidance(options.questionDifficulty);
  const existingList = (existingQuestions || [])
    .map((q, idx) => `${idx + 1}. ${q.soru}`)
    .join('\n');

  return `
SADECE GECERLI JSON DON:

{
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

Kurallar:
- ${options.questionCount} adet soru uret.
- Sorular birbirinin aynisi olmamali.
- Sorular sadece metindeki bilgiye dayanmalidir, metin disina cikma.
- ${difficulty}
- Daha once sorulanlar (TEKRAR ETME):
${existingList}

Metin:
${fullText}
`;
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

function validateSummaryOutput(data) {
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

  // important_regions is optional - sanitize if present
  if (data.important_regions && !Array.isArray(data.important_regions)) {
    data.important_regions = [];
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

async function generateAdditionalQuestions(fullText, options, existingQuestions, reqId) {
  const missingCount = Math.max(0, options.questionCount - existingQuestions.length);
  if (missingCount === 0) {
    return [];
  }

  const extraOptions = {
    summaryLength: options.summaryLength,
    questionDifficulty: options.questionDifficulty,
    questionCount: missingCount
  };
  const prompt = buildQuestionsPrompt(fullText, extraOptions, existingQuestions);

  const res = await callOpenRouterWithRetry({
    messages: [{ role: 'user', content: prompt }],
    model: OPENROUTER_MODEL,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  }, 2, { reqId });

  const data = JSON.parse(res.choices?.[0]?.message?.content || '{}');
  return sanitizeQuestions(data.sorular || []);
}

async function enforceQuestionCount(questions, fullText, options, reqId) {
  const desiredCount = options.questionCount;
  let current = dedupeQuestions(questions || []);

  let attempts = 0;
  while (current.length < desiredCount && attempts < 3) {
    log('question shortfall', { reqId, have: current.length, need: desiredCount, attempt: attempts + 1 });
    const extra = await generateAdditionalQuestions(fullText, options, current, reqId);
    current = dedupeQuestions([...current, ...extra]);
    attempts += 1;
  }

  if (current.length < desiredCount) {
    log('question still short', { reqId, have: current.length, need: desiredCount });
  }

  return current.slice(0, desiredCount);
}

async function generateSummaryFromTranscript(fullText, reqId, options) {
  log('generate summary (single pass)', {
    reqId,
    textLength: fullText.length,
    summaryLength: options.summaryLength
  });
  const prompt = buildSummaryPrompt(fullText, options);

  const res = await callOpenRouterWithRetry({
    messages: [{ role: 'user', content: prompt }],
    model: OPENROUTER_MODEL,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  }, 3, { reqId });

  const data = JSON.parse(res.choices?.[0]?.message?.content || '{}');
  if (!validateSummaryOutput(data)) {
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

  log('summary output validated', {
    reqId,
    sections: Array.isArray(data.summary_sections) ? data.summary_sections.length : 0,
    concepts: Array.isArray(data.key_concepts) ? data.key_concepts.length : 0,
    examples: Array.isArray(data.examples) ? data.examples.length : 0
  });

  return data;
}

async function generateQuestionsFromTranscript(fullText, reqId, options) {
  log('generate questions', {
    reqId,
    questionCount: options.questionCount,
    questionDifficulty: options.questionDifficulty
  });

  const prompt = buildQuestionsPrompt(fullText, options, []);
  const res = await callOpenRouterWithRetry({
    messages: [{ role: 'user', content: prompt }],
    model: OPENROUTER_MODEL,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  }, 3, { reqId });

  const data = JSON.parse(res.choices?.[0]?.message?.content || '{}');
  const initialQuestions = dedupeQuestions(data.sorular || []);
  const finalQuestions = await enforceQuestionCount(initialQuestions, fullText, options, reqId);

  log('questions ready', { reqId, count: finalQuestions.length });
  return finalQuestions;
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

function addHistoryEntry(entry) {
  history.unshift(entry);
  if (entry?.analysis_id) {
    analysisIndex.set(entry.analysis_id, entry);
  }

  if (history.length > HISTORY_LIMIT) {
    const removed = history.pop();
    if (removed?.analysis_id) {
      analysisIndex.delete(removed.analysis_id);
    }
  }
}

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..')));

app.post('/api/analyze', async (req, res) => {
  const reqId = createRequestId();
  const startedAt = Date.now();
  try {
    if (!FAL_KEY) {
      log('analyze missing FAL key', { reqId });
      return res.status(500).json({ detail: 'FAL key yok' });
    }

    const youtubeUrl = req.body?.youtube_url || '';
    const userTitle = String(req.body?.user_title || '').trim();
    const summaryLength = req.body?.summary_length || '';
    const questionDifficulty = req.body?.question_difficulty || 'orta';
    const questionCount = clampQuestionCount(Number.parseInt(req.body?.question_count || '', 10));
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      log('analyze invalid url', { reqId, url: summarizeUrl(youtubeUrl) });
      return res.status(400).json({ detail: 'Gecersiz URL' });
    }

    const analysisId = createRequestId();

    log('analyze start', {
      reqId,
      videoId,
      url: summarizeUrl(youtubeUrl),
      model: OPENROUTER_MODEL,
      summaryLength,
      questionCount,
      hasUserTitle: Boolean(userTitle)
    });

    let transcript = transcriptCache.get(videoId);
    const cached = getCached(videoId);
    if (cached?.transcript) {
      transcript = cached.transcript;
    }

    if (!transcript) {
      transcript = await getTranscript(youtubeUrl);
      if (!transcript) {
        log('analyze transcript missing', { reqId, videoId });
        return res.status(422).json({ detail: 'Altyazi yok' });
      }
    }

    log('analyze transcript ok', { reqId, length: transcript.length });

    const options = {
      summaryLength,
      questionCount,
      questionDifficulty
    };

    let summaryData = cached?.summary || null;
    let source = 'fresh';
    if (summaryData) {
      source = 'cache';
      log('analyze cache hit', { reqId, videoId });
    } else {
      summaryData = await generateSummaryFromTranscript(transcript, reqId, options);
      setCached(videoId, { summary: summaryData, transcript });
    }

    let questions = [];
    try {
      questions = await generateQuestionsFromTranscript(transcript, reqId, options);
    } catch (error) {
      log('analyze questions error', { reqId, message: String(error?.message || error) });
      questions = [];
    }

    transcriptCache.set(videoId, transcript);

    const record = {
      analysis_id: analysisId,
      video_id: videoId,
      video_url: youtubeUrl,
      created_at: new Date().toISOString(),
      user_title: userTitle,
      title: summaryData.title || '',
      summary_sections: summaryData.summary_sections || [],
      key_concepts: summaryData.key_concepts || [],
      examples: summaryData.examples || [],
      important_regions: summaryData.important_regions || [],
      ozet: summaryData.ozet || '',
      sorular: questions,
      question_count: questionCount,
      last_question_count: questions.length,
      last_question_difficulty: questionDifficulty
    };

    addHistoryEntry(record);

    log('analyze success', { reqId, videoId, analysisId, ms: Date.now() - startedAt });

    return res.json({ status: 'success', source, analysis_id: analysisId, analiz: record });
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

app.post('/api/questions', async (req, res) => {
  const reqId = createRequestId();
  const startedAt = Date.now();
  try {
    if (!FAL_KEY) {
      log('questions missing FAL key', { reqId });
      return res.status(500).json({ detail: 'FAL key yok' });
    }

    const analysisId = String(req.body?.analysis_id || '').trim();
    const youtubeUrl = String(req.body?.youtube_url || '').trim();
    const questionDifficulty = req.body?.question_difficulty || 'orta';
    const questionCount = clampQuestionCount(Number.parseInt(req.body?.question_count || '', 10));

    const videoId = youtubeUrl ? extractVideoId(youtubeUrl) : null;
    const record = findAnalysisRecord(analysisId, videoId);
    if (!record) {
      log('questions analysis not found', { reqId, analysisId, videoId });
      return res.status(404).json({ detail: 'Analiz bulunamadi' });
    }

    if (
      Array.isArray(record.sorular) &&
      record.sorular.length === questionCount &&
      record.last_question_difficulty === questionDifficulty
    ) {
      log('questions cache hit', { reqId, analysisId, count: record.sorular.length });
      return res.json({ status: 'success', analysis_id: record.analysis_id, sorular: record.sorular });
    }

    let transcript = transcriptCache.get(record.video_id);
    const cached = getCached(record.video_id);
    if (!transcript && cached?.transcript) {
      transcript = cached.transcript;
    }
    if (!transcript && record.video_url) {
      transcript = await getTranscript(record.video_url);
      if (transcript) {
        transcriptCache.set(record.video_id, transcript);
      }
    }

    if (!transcript) {
      log('questions transcript missing', { reqId, analysisId, videoId: record.video_id });
      return res.status(422).json({ detail: 'Altyazi yok' });
    }

    const options = {
      summaryLength: 'orta',
      questionDifficulty,
      questionCount
    };

    const questions = await generateQuestionsFromTranscript(transcript, reqId, options);
    record.sorular = questions;
    record.last_question_count = questionCount;
    record.last_question_difficulty = questionDifficulty;

    log('questions success', { reqId, analysisId, count: questions.length, ms: Date.now() - startedAt });
    return res.json({ status: 'success', analysis_id: record.analysis_id, sorular: questions });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      const detail = { error: 'rate_limit_exceeded', message: error.message };
      if (Number.isFinite(error.retryAfterSeconds)) {
        detail.retry_after_seconds = error.retryAfterSeconds;
      }
      log('questions rate limited', { reqId, retryAfterSeconds: error.retryAfterSeconds });
      return res.status(429).json({ detail });
    }

    log('questions error', {
      reqId,
      message: String(error?.message || error),
      ms: Date.now() - startedAt
    });
    return res.status(500).json({ detail: String(error?.message || error) });
  }
});

app.post('/api/chat', async (req, res) => {
  const reqId = createRequestId();
  const startedAt = Date.now();
  try {
    if (!FAL_KEY) {
      log('chat missing FAL key', { reqId });
      return res.status(500).json({ detail: 'FAL key yok' });
    }

    const analysisId = String(req.body?.analysis_id || '').trim();
    const youtubeUrl = String(req.body?.youtube_url || '').trim();
    const question = String(req.body?.question || '').trim();
    if (!question) {
      return res.status(400).json({ detail: 'Soru bos olamaz' });
    }

    const videoId = youtubeUrl ? extractVideoId(youtubeUrl) : null;
    const record = findAnalysisRecord(analysisId, videoId);
    if (!record) {
      return res.status(404).json({ detail: 'Analiz bulunamadi' });
    }

    let transcript = transcriptCache.get(record.video_id);
    const cached = getCached(record.video_id);
    if (!transcript && cached?.transcript) {
      transcript = cached.transcript;
    }
    if (!transcript && record.video_url) {
      transcript = await getTranscript(record.video_url);
      if (transcript) {
        transcriptCache.set(record.video_id, transcript);
      }
    }

    if (!transcript) {
      return res.status(422).json({ detail: 'Altyazi yok' });
    }

    const chunks = selectRelevantChunks(transcript, question, 6, 2000);
    const contextText = chunks.map((chunk, index) => `Parca ${index + 1}: ${chunk}`).join('\n\n');
    
    // Build summary context from the analysis record
    let summaryContext = '';
    if (record.ozet) {
      summaryContext = `\n\nOzet:\n${record.ozet}`;
    } else if (Array.isArray(record.summary_sections) && record.summary_sections.length > 0) {
      summaryContext = '\n\nOzet:\n' + record.summary_sections.map(s => `${s.subtitle}: ${s.content}`).join('\n');
    }
    
    const prompt = `
Sen bu videonun icerigini cok iyi bilen, yardimci ve bilgili bir egitim asistanisin.
Asagida videonun transkriptinden alinmis parcalar ve olusturulmus ozet var.

ONEMLI KURALLAR:
- Transkript parcalarini dikkatlice oku. Bilgi transkriptte varsa "transkriptte bahsedilmemistir" DEME, dogrudan cevapla.
- Turkce karakterler transkriptte farkli yazilmis olabilir (ornegin "vitamin" yerine "vitam in" seklinde bolunmus olabilir). Anlam butunlugune bak.
- Cevabini acik, anlasilir ve egitici bir dilde ver.
- Madde isaretleri ve basliklar kullanarak duzgun formatla.
- Sadece transkriptte veya ozette hic gecmeyen konularda "Bu konu videoda ele alinmamistir" de.

Transkript parcalari:
${contextText}
${summaryContext}

Kullanici sorusu: ${question}
`;

    const response = await callOpenRouterWithRetry({
      messages: [
        { role: 'system', content: 'Sen bir egitim asistanisin. Videodaki bilgileri kullanarak ogrencilere yardim ediyorsun. Bilgi transkriptte varsa dogrudan ve detayli cevap ver.' },
        { role: 'user', content: prompt }
      ],
      model: OPENROUTER_MODEL,
      temperature: 0.3
    }, 3, { reqId });

    const answer = response.choices?.[0]?.message?.content || '';
    log('chat success', { reqId, analysisId: record.analysis_id, ms: Date.now() - startedAt });
    return res.json({ status: 'success', answer });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      const detail = { error: 'rate_limit_exceeded', message: error.message };
      if (Number.isFinite(error.retryAfterSeconds)) {
        detail.retry_after_seconds = error.retryAfterSeconds;
      }
      return res.status(429).json({ detail });
    }

    log('chat error', {
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
