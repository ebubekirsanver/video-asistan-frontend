const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const upload = multer({ 
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('[edua] Supabase client initialized successfully');
} else {
  console.log('[edua] Supabase credentials not found in env. Falling back to local memory storage.');
}

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
  if (value === 0) {
    return 0;
  }
  if (!Number.isFinite(value)) {
    return DEFAULT_QUESTION_COUNT;
  }
  return Math.min(MAX_QUESTION_COUNT, Math.max(MIN_QUESTION_COUNT, value));
}

function getEmailFromRequest(req) {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7); // Remove 'Bearer '
  if (!token.startsWith('local_')) {
    return null;
  }
  const parts = token.split('_');
  if (parts.length < 4) {
    return null;
  }
  const base64Part = parts[3];
  // Base64 padding (Eksik dolgu karakterleri '=' için düzeltme)
  const padded = base64Part + '='.repeat((4 - (base64Part.length % 4)) % 4);
  try {
    return Buffer.from(padded, 'base64').toString('utf-8').trim().toLowerCase();
  } catch (e) {
    return null;
  }
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
    return 'Ozet kisa olsun, her bolum 2-4 cumle. Toplam 3-4 bolum yeterli.';
  }
  if (summaryLength === 'detayli') {
    return 'Ozet COK DETAYLI ve KAPSAMLI olsun. Her bolum 10-15 cumle icersin. Hicbir onemli bilgi atlanmasin. Toplam en az 5 bolum olmali. Konunun tum alt basliklarini, aciklamalarini, orneklerini ve detaylarini eksiksiz yaz. Ogrenci sadece bu ozeti okuyarak konuyu tamamen anlayabilmeli.';
  }
  return 'Ozet orta uzunlukta olsun, her bolum 5-8 cumle. Toplam en az 4 bolum olmali.';
}

function getDifficultyGuidance(questionDifficulty) {
  if (questionDifficulty === 'kolay') {
    return 'Sorular KOLAY seviyede olmalı: Temel tanımları, videoda doğrudan söylenen açık bilgileri ve yüzeysel gerçekleri sorgula. Cevaplar doğrudan metinden bulunabilmeli.';
  }
  if (questionDifficulty === 'zor') {
    return 'Sorular ZOR seviyede olmalı: Kavramlar arası ilişkileri, derin analiz gerektiren durumları ve videodaki bilgilerin farklı senaryolara uygulanmasını sorgula. Çeldiriciler (yanlış seçenekler) birbirine yakın ve düşündürücü olmalı.';
  }
  return 'Sorular ORTA seviyede olmalı: Hem temel tanımları hem de bu bilgilerin temel seviyede uygulanmasını (örnek olaylar üzerinden) sorgula.';
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

const TURKISH_MAP = {
  'ı': 'i', 'ğ': 'g', 'ü': 'u', 'ş': 's', 'ö': 'o', 'ç': 'c',
  'İ': 'i', 'Ğ': 'g', 'Ü': 'u', 'Ş': 's', 'Ö': 'o', 'Ç': 'c',
  'I': 'i'
};

function normalizeTurkish(text) {
  return String(text || '').toLowerCase().replace(/[ığüşöçİĞÜŞÖÇI]/g, c => TURKISH_MAP[c] || c);
}

function getQueryTerms(text) {
  const normalized = normalizeTurkish(text);
  return normalized
    .split(/\W+/)
    .filter((term) => term.length > 2);
}

function getQueryBigrams(terms) {
  const bigrams = [];
  for (let i = 0; i < terms.length - 1; i++) {
    bigrams.push(terms[i] + ' ' + terms[i + 1]);
  }
  return bigrams;
}

function splitTextOverlapping(text, chunkSize = 2000, overlap = 400) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
    if (i + overlap >= text.length) break;
  }
  return chunks;
}

function selectRelevantChunks(fullText, query, maxChunks = 10, chunkSize = 2500) {
  // If text is small enough, return all of it
  if (fullText.length <= maxChunks * chunkSize) {
    return splitText(fullText, chunkSize);
  }

  const chunks = splitTextOverlapping(fullText, chunkSize, 500);
  const terms = getQueryTerms(query);
  const bigrams = getQueryBigrams(terms);

  if (terms.length === 0) {
    return chunks.slice(0, Math.min(maxChunks, chunks.length));
  }

  const scored = chunks.map((chunk, idx) => {
    const lower = normalizeTurkish(chunk);
    let score = 0;

    for (const term of terms) {
      // Count occurrences
      let pos = 0;
      while ((pos = lower.indexOf(term, pos)) !== -1) {
        score += 2;
        pos += term.length;
      }
      // Stem match (70% of word)
      const stem = term.slice(0, Math.max(3, Math.floor(term.length * 0.6)));
      if (stem !== term) {
        let sPos = 0;
        while ((sPos = lower.indexOf(stem, sPos)) !== -1) {
          score += 0.5;
          sPos += stem.length;
        }
      }
    }

    // Bigram matching for phrase relevance
    for (const bigram of bigrams) {
      if (lower.includes(bigram)) {
        score += 5;
      }
    }

    return { chunk, score, idx };
  });

  const sorted = scored.sort((a, b) => b.score - a.score);
  const selected = sorted.slice(0, Math.min(maxChunks, sorted.length));

  // Ensure first chunk is included for topic context
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
  const isSayisal = options.subjectType === 'sayisal';

  const sayisalExtra = isSayisal ? `
BU SAYISAL/STEM BIR DERSTIR. Asagidaki ek kurallara ozellikle dikkat et:
- "key_formulas" alanina TUM formulleri, denklemleri ve matematiksel ifadeleri yaz. En az 3 formul olmali.
- Formulleri acik ve okunakli yaz. Ornegin: "F = m × a", "E = mc²", "∫f(x)dx = F(x) + C".
- "process_flow" alaninda islem adimlari veya cozum yolu adimlarini goster.
- "summary_sections" icinde sayisal degerleri, birimleri ve hesaplamalari vurgula.
- "examples" alanina somut sayisal cozum ornekleri ekle (adim adim islem goster).
- Matematiksel sembolleri dogru kullan: ×, ÷, ², ³, √, π, Σ, ∫, Δ, ≤, ≥, ≠, ∞.
` : '';

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
 ],
 "process_flow": [
  {
   "step": "Adim basligi (kisa, 2-4 kelime)",
   "detail": "Bu adimin kisa aciklamasi (1-2 cumle)"
  }
 ],
 "key_formulas": [
  {
   "label": "Formul veya kural basligi",
   "formula": "Formul veya onemli kural ifadesi"
  }
 ],
 "fun_facts": ["Biliyor muydunuz? seklinde ilginc bilgi 1", "Biliyor muydunuz? seklinde ilginc bilgi 2"]
}

Aciklama ekleme.
Kurallar:
- SADECE DERSLE/KONUYLA ILGILI BILGILERI ozete dahil et. Reklam, sponsor, kanal tanitimi, abone ol cagrilari, kisisel yorumlar, giris/kapanıs selamlari gibi dersle ilgisi olmayan kisimlari kesinlikle ozete DAHIL ETME.
- "summary_sections" en az 3 bolum icersin (detayli modda en az 5 bolum).
- "key_concepts" en az 5 kavram icersin.
- "examples" metinden cikarilan en az 2 somut ornek icersin (yoksa bos liste donebilirsin).
- "important_regions" metindeki vurgulanan, kritik veya onemli kisimlar. En az 2, en fazla 5 adet olsun.
- "process_flow" konunun ana surecini veya asamalarini goster. Bir surec yoksa konunun mantiksal akisini 3-6 adimda ozetle. Her adim kisa ve net olsun.
- "key_formulas" metindeki onemli formuller, denklemler, kurallar veya tanimlar. Yoksa bos liste donebilirsin. En fazla 4 adet.
- "fun_facts" metinden cikartilan 2-3 ilginc veya sasirtici bilgi. "Biliyor muydunuz?" formatinda yaz.
- Metin disina cikma.
- ${guidance}
${sayisalExtra}
Metin:
${fullText}
`;
}

function buildQuestionsPrompt(fullText, options, existingQuestions) {
  const difficulty = getDifficultyGuidance(options.questionDifficulty);
  const isSayisal = options.subjectType === 'sayisal';
  const sayisalExtra = isSayisal ? `
BU SAYISAL/STEM BIR DERSTIR. Soru köklerinde işlem yapmayı, formül kullanımını veya bir problemin çözüm adımını sorgula.
Sayısal verileri, birimleri ve hesaplamaları doğru kullan. Örnek: "V hızıyla giden..." gibi sayısal senaryolu sorular ekle.
` : `
BU SÖZEL/SOSYAL BIR DERSTIR. Sorular daha çok kavramların anlamını, olayların neden-sonuç ilişkilerini ve videodaki ana fikirleri sorgulamalı.
`;

  const existingList = (existingQuestions || [])
    .map((q, idx) => `${idx + 1}. ${q.soru}`)
    .join('\n');

  return `
SADECE GECERLI JSON DON:

{
 "sorular": [
  {
   "soru": "Soru metni...",
   "secenekler": {
     "A": "Secenek A",
     "B": "Secenek B",
     "C": "Secenek C",
     "D": "Secenek D"
   },
   "dogru_cevap": "A",
   "aciklama": "Dogru cevabin neden dogru oldugunu, yanlislarin neden yanlis oldugunu anlatan net aciklama (1-2 cumle)",
   "zaman_referansi": "MM:SS formatinda videoda bu konunun gectigi sure"
  }
 ]
}

Kurallar:
- ${options.questionCount} adet soru uret.
- ${sayisalExtra}
- ${difficulty}
- Sorular birbirinden farkli olmali.
- Sorular sadece metindeki bilgiye dayanmali, disina cikma.
- "aciklama" alanı COK ONEMLIDIR; kullanıcının konuyu kavraması için doğru cevabı açıkla.
- "zaman_referansi" alanını metindeki [MM:SS] etiketlerini kullanarak videodaki GERÇEK süreyi yaz. Kesinlikle uydurma, metindeki etiketi bul.
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

  // Infographic fields are optional - sanitize if not arrays
  if (!Array.isArray(data.process_flow)) data.process_flow = [];
  if (!Array.isArray(data.key_formulas)) data.key_formulas = [];
  if (!Array.isArray(data.fun_facts)) data.fun_facts = [];

  return true;
}

function cleanSubtitles(raw) {
  let cleaned = raw.replace(/WEBVTT.*?\n\n/s, '');

  // Format timestamps to [MM:SS] to help AI reference time accurately
  cleaned = cleaned.replace(/(\d{2}):(\d{2}):(\d{2})\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/g, ' [$2:$3] ');

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

  let data;
  try {
    data = JSON.parse(res.choices?.[0]?.message?.content || '{}');
  } catch (_) {
    data = repairAndParseJSON(res.choices?.[0]?.message?.content || '{}');
  }
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

function repairAndParseJSON(raw) {
  // Try to extract JSON object from the raw string
  let text = raw.trim();

  // Remove markdown code fences if present
  text = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');

  // Find the first { 
  const start = text.indexOf('{');
  if (start === -1) return {};
  text = text.slice(start);

  // Try parsing as-is first
  try { return JSON.parse(text); } catch (_) { /* continue */ }

  // Attempt to close unclosed strings and brackets
  let repaired = text;

  // Check if we're inside an unclosed string
  let inString = false;
  let escaped = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; }
  }
  if (inString) {
    repaired += '"';
  }

  // Count brackets and close them
  let braces = 0, brackets = 0;
  inString = false;
  escaped = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }

  // Remove trailing comma before closing
  repaired = repaired.replace(/,\s*$/, '');

  while (brackets > 0) { repaired += ']'; brackets--; }
  while (braces > 0) { repaired += '}'; braces--; }

  try { return JSON.parse(repaired); } catch (_) { /* continue */ }

  // Last resort: try to cut at the last valid closing brace
  for (let i = repaired.length - 1; i > 0; i--) {
    if (repaired[i] === '}') {
      try { return JSON.parse(repaired.slice(0, i + 1)); } catch (_) { /* continue */ }
    }
  }

  return {};
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
    max_tokens: options.summaryLength === 'detayli' ? 16384 : 8192,
    response_format: { type: 'json_object' }
  }, 3, { reqId });

  const rawContent = res.choices?.[0]?.message?.content || '{}';
  let data;
  try {
    data = JSON.parse(rawContent);
  } catch (parseErr) {
    log('summary json parse failed, attempting repair', { reqId, error: parseErr.message, rawLength: rawContent.length });
    data = repairAndParseJSON(rawContent);
  }
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

  let data;
  const rawContent = res.choices?.[0]?.message?.content || '{}';
  try {
    data = JSON.parse(rawContent);
  } catch (parseErr) {
    log('questions json parse failed, attempting repair', { reqId, error: parseErr.message, rawLength: rawContent.length });
    data = repairAndParseJSON(rawContent);
  }
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

async function addHistoryEntry(entry, userEmail) {
  entry.user_email = userEmail || null;
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

  if (supabase) {
    try {
      const { error } = await supabase
        .from('analyses')
        .insert([{
          analysis_id: entry.analysis_id,
          video_id: entry.video_id,
          video_url: entry.video_url || '',
          created_at: entry.created_at || new Date().toISOString(),
          user_title: entry.user_title || '',
          title: entry.title || '',
          summary_sections: entry.summary_sections || [],
          key_concepts: entry.key_concepts || [],
          examples: entry.examples || [],
          important_regions: entry.important_regions || [],
          process_flow: entry.process_flow || [],
          key_formulas: entry.key_formulas || [],
          fun_facts: entry.fun_facts || [],
          ozet: entry.ozet || '',
          sorular: entry.sorular || [],
          question_count: entry.question_count || 0,
          last_question_count: entry.last_question_count || 0,
          last_question_difficulty: entry.last_question_difficulty || 'orta',
          user_email: entry.user_email
        }]);

      if (error) {
        log('Supabase insert error', { error: error.message });
      } else {
        log('Supabase insert success', { analysisId: entry.analysis_id });
      }
    } catch (err) {
      log('Supabase sync catch error', { error: String(err) });
    }
  }
}

function findAnalysisRecord(analysisId, videoId) {
  if (analysisId) {
    const record = analysisIndex.get(analysisId);
    if (record) return record;
  }
  if (videoId) {
    const record = history.find(h => h.video_id === videoId);
    if (record) return record;
  }
  return null;
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
    const subjectType = req.body?.subject_type || 'sozel';
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      log('analyze invalid url', { reqId, url: summarizeUrl(youtubeUrl) });
      return res.status(400).json({ detail: 'Gecersiz URL' });
    }

    const analysisId = createRequestId();

    const userEmail = getEmailFromRequest(req);

    log('analyze start', {
      reqId,
      videoId,
      url: summarizeUrl(youtubeUrl),
      model: OPENROUTER_MODEL,
      summaryLength,
      questionCount,
      subjectType,
      hasUserTitle: Boolean(userTitle),
      userEmail
    });

    if (supabase) {
      try {
        // 1. Önce bu kullanıcının kendi geçmişinde bu analiz var mı diye bak
        const { data: userEntries, error: userError } = await supabase
          .from('analyses')
          .select('*')
          .eq('video_id', videoId)
          .eq('question_count', questionCount)
          .eq('user_email', userEmail || '')
          .limit(1);

        if (!userError && userEntries && userEntries.length > 0) {
          const cachedRecord = userEntries[0];
          log('Supabase user-specific cache hit', { reqId, videoId, analysisId: cachedRecord.analysis_id, userEmail });
          
          if (!analysisIndex.has(cachedRecord.analysis_id)) {
            history.unshift(cachedRecord);
            analysisIndex.set(cachedRecord.analysis_id, cachedRecord);
          }

          return res.json({
            status: 'success',
            source: 'supabase_cache',
            analysis_id: cachedRecord.analysis_id,
            analiz: cachedRecord
          });
        }

        // 2. Eğer kullanıcının kendi geçmişinde yoksa, ORTAK HAVUZDA (başka birinde) var mı diye bak (Gemini maliyetini önlemek için)
        const { data: globalEntries, error: globalError } = await supabase
          .from('analyses')
          .select('*')
          .eq('video_id', videoId)
          .eq('question_count', questionCount)
          .limit(1);

        if (!globalError && globalEntries && globalEntries.length > 0) {
          const globalRecord = globalEntries[0];
          log('Supabase global cache hit (cloning for user)', { reqId, videoId, sourceAnalysisId: globalRecord.analysis_id, userEmail });
          
          // Ortak kaydı bu kullanıcı için kopyala
          const clonedRecord = {
            ...globalRecord,
            analysis_id: analysisId, // Yeni benzersiz analiz kimliği
            user_title: userTitle || globalRecord.user_title,
            created_at: new Date().toISOString(),
            user_email: userEmail
          };

          // Supabase ve yerel geçmişe bu kullanıcı adına kaydet
          await addHistoryEntry(clonedRecord, userEmail);

          return res.json({
            status: 'success',
            source: 'supabase_cache_cloned',
            analysis_id: clonedRecord.analysis_id,
            analiz: clonedRecord
          });
        }
      } catch (err) {
        log('Supabase cache lookup error', { error: String(err) });
      }
    }

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
      questionDifficulty,
      subjectType
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
    if (questionCount > 0) {
      try {
        questions = await generateQuestionsFromTranscript(transcript, reqId, options);
      } catch (error) {
        log('analyze questions error', { reqId, message: String(error?.message || error) });
        questions = [];
      }
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
      process_flow: summaryData.process_flow || [],
      key_formulas: summaryData.key_formulas || [],
      fun_facts: summaryData.fun_facts || [],
      ozet: summaryData.ozet || '',
      sorular: questions,
      question_count: questionCount,
      last_question_count: questions.length,
      last_question_difficulty: questionDifficulty
    };

    await addHistoryEntry(record, userEmail);

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

app.post('/api/analyze-file', upload.single('file'), async (req, res) => {
  const reqId = createRequestId();
  const startedAt = Date.now();
  try {
    if (!FAL_KEY) {
      log('analyze-file missing FAL key', { reqId });
      return res.status(500).json({ detail: 'FAL key yok' });
    }

    if (!req.file) {
      return res.status(400).json({ detail: 'Lütfen bir dosya yükleyin' });
    }

    const originalName = req.file.originalname || 'Ders Dokümanı';
    const userTitle = String(req.body?.user_title || '').trim() || originalName;
    const summaryLength = req.body?.summary_length || '';
    const questionDifficulty = req.body?.question_difficulty || 'orta';
    const questionCount = clampQuestionCount(Number.parseInt(req.body?.question_count || '', 10));
    const subjectType = req.body?.subject_type || 'sozel';

    log('analyze-file start', {
      reqId,
      originalName,
      userTitle,
      summaryLength,
      questionCount,
      subjectType
    });

    let documentText = '';
    const fileExtension = path.extname(originalName).toLowerCase();

    if (fileExtension === '.pdf') {
      const parsePDF = typeof pdfParse === 'function' ? pdfParse : (pdfParse.default || pdfParse);
      const pdfData = await parsePDF(req.file.buffer);
      documentText = pdfData.text || '';
    } else {
      // Default to reading as plain text
      documentText = req.file.buffer.toString('utf8');
    }

    documentText = documentText.trim();
    if (!documentText) {
      return res.status(422).json({ detail: 'Dosya içeriği boş veya metin okunamadı' });
    }

    const fileHash = crypto.createHash('sha256').update(documentText).digest('hex');
    const fileId = "file_" + fileHash.slice(0, 16);

    transcriptCache.set(fileId, documentText);
    log('analyze-file extracted text ok', { reqId, fileId, length: documentText.length });

    const userEmail = getEmailFromRequest(req);

    if (supabase) {
      try {
        // 1. Önce bu kullanıcının kendi geçmişinde bu dosya analizi var mı diye bak
        const { data: userEntries, error: userError } = await supabase
          .from('analyses')
          .select('*')
          .eq('video_id', fileId)
          .eq('question_count', questionCount)
          .eq('user_email', userEmail || '')
          .limit(1);

        if (!userError && userEntries && userEntries.length > 0) {
          const cachedRecord = userEntries[0];
          log('Supabase user-specific file cache hit', { reqId, fileId, analysisId: cachedRecord.analysis_id, userEmail });
          
          if (!analysisIndex.has(cachedRecord.analysis_id)) {
            history.unshift(cachedRecord);
            analysisIndex.set(cachedRecord.analysis_id, cachedRecord);
          }

          return res.json({
            status: 'success',
            source: 'supabase_cache',
            analysis_id: cachedRecord.analysis_id,
            analiz: cachedRecord
          });
        }

        // 2. Eğer kullanıcının kendi geçmişinde yoksa, ORTAK HAVUZDA var mı diye bak (maliyet tasarrufu)
        const { data: globalEntries, error: globalError } = await supabase
          .from('analyses')
          .select('*')
          .eq('video_id', fileId)
          .eq('question_count', questionCount)
          .limit(1);

        if (!globalError && globalEntries && globalEntries.length > 0) {
          const globalRecord = globalEntries[0];
          log('Supabase global file cache hit (cloning for user)', { reqId, fileId, sourceAnalysisId: globalRecord.analysis_id, userEmail });
          
          // Ortak kaydı bu kullanıcı için kopyala
          const clonedRecord = {
            ...globalRecord,
            analysis_id: "file_an_" + createRequestId(), // Yeni benzersiz analiz kimliği
            user_title: userTitle || globalRecord.user_title,
            created_at: new Date().toISOString(),
            user_email: userEmail
          };

          // Supabase ve yerel geçmişe kaydet
          await addHistoryEntry(clonedRecord, userEmail);

          return res.json({
            status: 'success',
            source: 'supabase_cache_cloned',
            analysis_id: clonedRecord.analysis_id,
            analiz: clonedRecord
          });
        }
      } catch (err) {
        log('Supabase file cache lookup error', { error: String(err) });
      }
    }

    const options = {
      summaryLength,
      questionCount,
      questionDifficulty,
      subjectType
    };

    // Generate summary using the same LLM logic
    const summaryData = await generateSummaryFromTranscript(documentText, reqId, options);

    // Generate questions if requested
    let questions = [];
    if (questionCount > 0) {
      try {
        questions = await generateQuestionsFromTranscript(documentText, reqId, options);
      } catch (error) {
        log('analyze-file questions error', { reqId, message: String(error?.message || error) });
        throw new Error(`Soru üretimi başarısız oldu: ${error?.message || error}`);
      }
    }

    const analysisId = createRequestId();
    const record = {
      analysis_id: analysisId,
      video_id: fileId,
      video_url: '', // Local files don't have a YouTube URL
      created_at: new Date().toISOString(),
      user_title: userTitle,
      title: summaryData.title || userTitle || 'Ders Özeti',
      summary_sections: summaryData.summary_sections || [],
      key_concepts: summaryData.key_concepts || [],
      examples: summaryData.examples || [],
      important_regions: summaryData.important_regions || [],
      process_flow: summaryData.process_flow || [],
      key_formulas: summaryData.key_formulas || [],
      fun_facts: summaryData.fun_facts || [],
      ozet: summaryData.ozet || '',
      sorular: questions,
      question_count: questionCount,
      last_question_count: questions.length,
      last_question_difficulty: questionDifficulty
    };

    await addHistoryEntry(record, userEmail);

    log('analyze-file success', { reqId, fileId, analysisId, ms: Date.now() - startedAt });

    return res.json({ status: 'success', source: 'file', analysis_id: analysisId, analiz: record });
  } catch (error) {
    log('analyze-file error', {
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

// Per-analysis chat history for multi-turn conversations
const chatHistories = new Map();

app.post('/api/chat', async (req, res) => {
  const reqId = createRequestId();
  const startedAt = Date.now();
  log('chat request processed with new rules', { reqId });
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

    const isLocalFile = String(record.video_id || '').startsWith('file_');

    if (!transcript) {
      return res.status(422).json({ detail: isLocalFile ? 'Doküman metni bulunamadı' : 'Altyazi yok' });
    }

    // If transcript is short enough, send it all; otherwise select best chunks
    const MAX_FULL_TRANSCRIPT = 30000;
    let contextText;
    if (transcript.length <= MAX_FULL_TRANSCRIPT) {
      contextText = transcript;
    } else {
      const chunks = selectRelevantChunks(transcript, question, 10, 2500);
      contextText = chunks.map((chunk, index) => `[Bolum ${index + 1}]\n${chunk}`).join('\n\n---\n\n');
    }

    // Build summary + key concepts context from the analysis record
    let summaryContext = '';
    const summaryLabel = isLocalFile ? 'DOKUMAN OZETI' : 'VIDEO OZETI';
    if (Array.isArray(record.summary_sections) && record.summary_sections.length > 0) {
      summaryContext = `\n\n--- ${summaryLabel} ---\n` + record.summary_sections.map(s => `**${s.subtitle}**: ${s.content}`).join('\n\n');
    } else if (record.ozet) {
      summaryContext = `\n\n--- ${summaryLabel} ---\n${record.ozet}`;
    }

    let conceptsContext = '';
    if (Array.isArray(record.key_concepts) && record.key_concepts.length > 0) {
      conceptsContext = '\n\n--- ANAHTAR KAVRAMLAR ---\n' + record.key_concepts.map(kc => `- **${kc.term}**: ${kc.definition}`).join('\n');
    }

    // Get or create chat history for this analysis
    const chatKey = record.analysis_id || record.video_id;
    if (!chatHistories.has(chatKey)) {
      chatHistories.set(chatKey, []);
    }
    const chatHistory = chatHistories.get(chatKey);

    const sourceLabel = isLocalFile ? 'ders dokümanı metni' : 'video transkripti';
    const systemPrompt = `Sen her konuda bilgi sahibi, yardımsever ve uzman bir egitim asistanisin. Sana referans olması için bir ${sourceLabel} ve ozeti verilecek.

TEMEL GÖREVİN:
Kullanıcının sorduğu HER soruya, ders içeriği ile ilgili olsun veya olmasın, mutlaka en doğru ve detaylı cevabı vermektir.

KURALLAR:
1. Soru ders içeriğiyle ilgiliyse, öncelikle dokümandaki veya videodaki bilgileri kullanarak cevap ver.
2. Soru DERS HARİCİ bir konuyla ilgiliyse (tamamen bağımsız olsa bile), uzman eğitim bilginle eksiksiz cevap ver. Asla "dokümanda yok" veya "cevap veremem" deme.
3. Kullanıcıya her zaman eğitici, nazik ve destekleyici bir dille yaklaş.
4. Cevaplarını Türkçe, açık ve madde işaretleri (*) kullanarak formatla.
5. Önceki sohbet geçmişini dikkate alarak akıcı bir diyalog sürdür.`;

    const userPrompt = `--- REFERANS VIDEO ICERIGI ---
${contextText}
${summaryContext}
${conceptsContext}

--- KULLANICI SORUSU ---
${question}

Uzman egitim bilginle bu soruyu detayli bir sekilde cevapla.`;

    // Build messages array with conversation history (last 10 turns max)
    console.log("\n--- DEBUG: SISTEM PROMPTU ---");
    console.log(systemPrompt);
    console.log("-----------------------------\n");
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add recent chat history (keep last 10 exchanges)
    const recentHistory = chatHistory.slice(-10);
    for (const turn of recentHistory) {
      messages.push({ role: 'user', content: turn.question });
      messages.push({ role: 'assistant', content: turn.answer });
    }

    messages.push({ role: 'user', content: userPrompt });

    const response = await callOpenRouterWithRetry({
      messages,
      model: OPENROUTER_MODEL,
      temperature: 0.2
    }, 3, { reqId });

    const answer = response.choices?.[0]?.message?.content || '';

    // Store in chat history
    chatHistory.push({ question, answer });
    // Keep history bounded
    if (chatHistory.length > 20) {
      chatHistory.splice(0, chatHistory.length - 20);
    }

    log('chat success', { reqId, analysisId: record.analysis_id, historyLen: chatHistory.length, ms: Date.now() - startedAt });
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

app.get('/api/history', async (req, res) => {
  const userEmail = getEmailFromRequest(req);
  
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('analyses')
        .select('*')
        .eq('user_email', userEmail || '')
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);

      if (!error && data) {
        log('history fetch from Supabase user-specific', { count: data.length, userEmail });
        for (const item of data) {
          if (!analysisIndex.has(item.analysis_id)) {
            analysisIndex.set(item.analysis_id, item);
          }
        }
        return res.json(data);
      }
      log('Supabase history fetch error, falling back to local memory', { error: error?.message });
    } catch (err) {
      log('Supabase history fetch catch error', { error: String(err) });
    }
  }
  
  const userHistory = history.filter(h => h.user_email === userEmail);
  log('history fetch from local memory user-specific', { count: userHistory.length, userEmail });
  res.json(userHistory);
});

app.post('/api/recommendations', async (req, res) => {
  const reqId = createRequestId();
  const userEmail = getEmailFromRequest(req);
  
  try {
    if (!FAL_KEY) {
      return res.status(500).json({ detail: 'FAL key yok' });
    }

    const userHistory = history.filter(h => h.user_email === userEmail);

    if (userHistory.length === 0) {
      return res.json({ interests: [], recommendations: [] });
    }

    // Build a summary of user's past topics
    const topicSummary = userHistory.slice(0, 10).map(h => {
      const title = h.user_title || h.title || '';
      const concepts = Array.isArray(h.key_concepts) ? h.key_concepts.map(c => c.term).join(', ') : '';
      return `- ${title}${concepts ? ' (' + concepts + ')' : ''}`;
    }).join('\n');

    const prompt = `SADECE GECERLI JSON DON. Baska aciklama ekleme.

Asagida bir ogrencinin gecmiste izledigi video konulari var:
${topicSummary}

Bu ogrencinin ilgi alanlarini analiz et ve YouTube'da izleyebilecegi yeni video onerileri olustur.

{
  "interests": ["Ilgi alani 1", "Ilgi alani 2", "Ilgi alani 3"],
  "recommendations": [
    {
      "title": "Onerilen video basligi (Turkce)",
      "reason": "Bu videonun neden onerildigini 1 cumle ile acikla",
      "search_query": "YouTube arama sorgusu (Turkce)"
    }
  ]
}

Kurallar:
- En az 3, en fazla 6 oneri olustur.
- Onerilerin gecmis konularla iliskili ama farkli olsun (tekrar etmesin).
- "search_query" YouTube'da aranabilir bir sorgu olsun.
- Tamamen Turkce yaz.`;

    const aiRes = await callOpenRouterWithRetry({
      messages: [{ role: 'user', content: prompt }],
      model: OPENROUTER_MODEL,
      temperature: 0.7,
      max_tokens: 2048,
      response_format: { type: 'json_object' }
    }, 2, { reqId });

    let data;
    try {
      data = JSON.parse(aiRes.choices?.[0]?.message?.content || '{}');
    } catch (_) {
      data = repairAndParseJSON(aiRes.choices?.[0]?.message?.content || '{}');
    }

    const interests = Array.isArray(data.interests) ? data.interests : [];
    const recommendations = Array.isArray(data.recommendations)
      ? data.recommendations.map(r => ({
        title: r.title || '',
        reason: r.reason || '',
        search_url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(r.search_query || r.title || '')
      }))
      : [];

    log('recommendations generated', { reqId, interests: interests.length, recs: recommendations.length });
    return res.json({ interests, recommendations });
  } catch (error) {
    log('recommendations error', { reqId, message: String(error?.message || error) });
    return res.status(500).json({ detail: String(error?.message || error) });
  }
});

// --- FEEDBACK SYSTEM ---
const feedbackStore = { liked: [], disliked: [] };

app.post('/api/feedback', (req, res) => {
  const { title, action } = req.body || {};
  if (!title || !['like', 'dislike', 'remove'].includes(action)) {
    return res.status(400).json({ detail: 'Gecersiz feedback' });
  }

  // Remove from both lists first
  feedbackStore.liked = feedbackStore.liked.filter(t => t !== title);
  feedbackStore.disliked = feedbackStore.disliked.filter(t => t !== title);

  if (action === 'like') {
    feedbackStore.liked.push(title);
  } else if (action === 'dislike') {
    feedbackStore.disliked.push(title);
  }

  log('feedback recorded', { title, action, liked: feedbackStore.liked.length, disliked: feedbackStore.disliked.length });
  return res.json({ status: 'success', feedback: feedbackStore });
});

app.get('/api/feedback', (req, res) => {
  return res.json(feedbackStore);
});

// --- USER SETTINGS ---
let userSettings = {};

app.get('/api/user-settings', (req, res) => {
  return res.json(userSettings);
});

app.post('/api/user-settings', (req, res) => {
  const newSettings = req.body || {};
  userSettings = { ...userSettings, ...newSettings };
  log('settings updated', userSettings);
  return res.json({ status: 'success', settings: userSettings });
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  log(`api listening on http://0.0.0.0:${PORT}`, {
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
  app.listen(EXTRA_PORT, '0.0.0.0', () => {
    log(`api also listening on http://0.0.0.0:${EXTRA_PORT}`);
  });
}
