import os
import json
import re
import subprocess
import tempfile
import time
import sys
import shutil
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
from groq import Groq

load_dotenv(override=True)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

COOKIES_PATH = os.path.join(os.path.dirname(__file__), "cookies.txt")

groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="EduAssistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

class VideoRequest(BaseModel):
    youtube_url: str


# -----------------------------
# UTIL
# -----------------------------

def extract_video_id(url: str) -> str | None:
    match = re.search(r'(?:v=|\/|embed\/|youtu\.be\/)([0-9A-Za-z_-]{11})', url)
    return match.group(1) if match else None


def split_text(text: str, size: int = 3000) -> List[str]:
    return [text[i:i+size] for i in range(0, len(text), size)]


def _parse_retry_after_seconds(message: str) -> int | None:
    """
    Groq 429 hata mesajındaki 'Please try again in 16m37.056s' benzeri ifadeyi parse eder.
    """
    if not message:
        return None
    m = re.search(r"try again in\s+(\d+)m([0-9.]+)s", message, flags=re.IGNORECASE)
    if not m:
        return None
    minutes = int(m.group(1))
    seconds = float(m.group(2))
    return int(minutes * 60 + seconds + 0.999)


def call_groq_with_retry(payload, retries=3):
    for i in range(retries):
        try:
            return groq_client.chat.completions.create(**payload)
        except Exception as e:
            msg = str(e)
            # Token/günlük kota dolduysa retry faydasız; 429 olarak yukarı iletelim.
            if "rate_limit_exceeded" in msg or "Rate limit reached" in msg or "Error code: 429" in msg:
                retry_after = _parse_retry_after_seconds(msg)
                detail = {"error": "rate_limit_exceeded", "message": msg}
                if retry_after is not None:
                    detail["retry_after_seconds"] = retry_after
                raise HTTPException(status_code=429, detail=detail)
            if i == retries - 1:
                raise e
            time.sleep(2 ** i)


def validate_output(data):
    if not isinstance(data, dict):
        return False

    # Structured summary fields
    if not isinstance(data.get("title"), str) or not data["title"].strip():
        return False

    summary_sections = data.get("summary_sections")
    if not isinstance(summary_sections, list) or len(summary_sections) == 0:
        return False
    for s in summary_sections:
        if not isinstance(s, dict):
            return False
        if not isinstance(s.get("subtitle"), str) or not s["subtitle"].strip():
            return False
        if not isinstance(s.get("content"), str) or not s["content"].strip():
            return False

    key_concepts = data.get("key_concepts")
    if not isinstance(key_concepts, list):
        return False
    for c in key_concepts:
        if not isinstance(c, dict):
            return False
        if not isinstance(c.get("term"), str) or not c["term"].strip():
            return False
        if not isinstance(c.get("definition"), str) or not c["definition"].strip():
            return False

    examples = data.get("examples")
    if not isinstance(examples, list):
        return False
    if not all(isinstance(e, str) and e.strip() for e in examples):
        return False

    # Questions
    sorular = data.get("sorular")
    if not isinstance(sorular, list) or len(sorular) == 0:
        return False
    for q in sorular:
        if not isinstance(q, dict):
            return False
        if not all(k in q for k in ["soru", "secenekler", "dogru_cevap"]):
            return False
        if not isinstance(q["soru"], str) or not q["soru"].strip():
            return False
        if not isinstance(q["secenekler"], dict):
            return False
        if set(q["secenekler"].keys()) != {"A", "B", "C", "D"}:
            return False
        if not all(isinstance(q["secenekler"][k], str) and q["secenekler"][k].strip() for k in ["A", "B", "C", "D"]):
            return False
        if q["dogru_cevap"] not in ["A", "B", "C", "D"]:
            return False

    return True


def is_valid_cached(cached: dict | None) -> bool:
    """
    Supabase'den gelen cache verisini doğrular.
    Cache geçmişte hatalı formatta yazılmış olabilir (ör. sorular: string list).
    """
    if not cached or not isinstance(cached, dict):
        return False
    return validate_output({
        "title": cached.get("title"),
        "summary_sections": cached.get("summary_sections"),
        "key_concepts": cached.get("key_concepts"),
        "examples": cached.get("examples"),
        "sorular": cached.get("sorular"),
    })


# -----------------------------
# CACHE
# -----------------------------

def get_cached(video_id: str):
    try:
        # Yeni şema
        try:
            res = (
                supabase.table("video_analyses")
                .select("title, summary_sections, key_concepts, examples, sorular")
                .eq("video_id", video_id)
                .limit(1)
                .execute()
            )
            if res.data:
                return res.data[0]
        except Exception as e:
            # Eski şema (ozet, sorular) veya kolonlar migrate edilmemiş olabilir
            print("cache error:", e)
            res = (
                supabase.table("video_analyses")
                .select("ozet, sorular")
                .eq("video_id", video_id)
                .limit(1)
                .execute()
            )
            if res.data:
                row = res.data[0]
                ozet = row.get("ozet")
                # ozet içinde JSON-string olarak structured saklandıysa parse etmeyi dene
                if isinstance(ozet, str):
                    try:
                        parsed = json.loads(ozet)
                        if isinstance(parsed, dict):
                            if "sorular" not in parsed:
                                parsed["sorular"] = row.get("sorular")
                            return parsed
                    except Exception:
                        pass
                return row
    except Exception as e:
        print("cache error:", e)
    return None


# -----------------------------
# TRANSCRIPT
# -----------------------------

def get_transcript(youtube_url: str) -> str | None:
    with tempfile.TemporaryDirectory() as tmpdir:
        output_template = os.path.join(tmpdir, "transcript")

        # Windows'ta pip ile kurulan yt-dlp genelde Python'un Scripts klasörüne düşer
        # ve PATH'e ekli değilse shutil.which("yt-dlp") None döner.
        # Bu yüzden öncelik: yt-dlp exe, yoksa `python -m yt_dlp`.
        ytdlp_exe = shutil.which("yt-dlp") or shutil.which("yt-dlp.exe")
        ytdlp_is_module = False

        if not ytdlp_exe:
            scripts_candidate = os.path.join(os.path.dirname(sys.executable), "Scripts", "yt-dlp.exe")
            if os.path.exists(scripts_candidate):
                ytdlp_exe = scripts_candidate

        if not ytdlp_exe:
            # Son çare: modül olarak çalıştır.
            ytdlp_is_module = True

        base_args = (
            [sys.executable, "-m", "yt_dlp"]
            if ytdlp_is_module
            else [ytdlp_exe]
        )

        base_args += [
            "--skip-download",
            "--no-playlist",
            "-o", output_template,
        ]

        if os.path.exists(COOKIES_PATH):
            base_args += ["--cookies", COOKIES_PATH]

        for mode in ["--write-sub", "--write-auto-sub"]:
            for lang in ["tr", "en"]:
                args = base_args + [
                    mode,
                    "--sub-lang", lang,
                    "--sub-format", "vtt",
                    youtube_url,
                ]

                subprocess.run(args, capture_output=True)

                txt = parse_subtitles(tmpdir)
                if txt:
                    return txt

    return None


def parse_subtitles(directory):
    for f in os.listdir(directory):
        if f.endswith(".vtt") or f.endswith(".srt"):
            with open(os.path.join(directory, f), encoding="utf-8", errors="ignore") as file:
                raw = file.read()
            cleaned = clean_subtitles(raw)
            if len(cleaned) > 100:
                return cleaned
    return None


def clean_subtitles(raw: str) -> str:
    raw = re.sub(r"WEBVTT.*?\n\n", "", raw, flags=re.DOTALL)
    raw = re.sub(r"\d{1,2}:\d{2}:\d{2}.*?\n", "", raw)
    raw = re.sub(r"<[^>]+>", "", raw)

    lines = [l.strip() for l in raw.splitlines() if l.strip()]

    dedup = []
    for l in lines:
        if not dedup or dedup[-1] != l:
            dedup.append(l)

    return " ".join(dedup)


# -----------------------------
# AI PIPELINE
# -----------------------------

def summarize_chunks(full_text: str):
    chunks = split_text(full_text)
    summaries = []

    for chunk in chunks:
        res = call_groq_with_retry({
            "messages": [
                {"role": "system", "content": "Kısa akademik özet çıkar."},
                {"role": "user", "content": chunk}
            ],
            "model": "llama-3.3-70b-versatile",
            "temperature": 0.3,
        })

        summaries.append(res.choices[0].message.content)

    return summaries


def generate_final_output(summaries: List[str]):
    prompt = f"""
SADECE GEÇERLİ JSON DÖN:

{{
 "title": "Konu başlığı (Türkçe, kısa ve net)",
 "summary_sections": [
  {{
   "subtitle": "Alt başlık",
   "content": "Bu bölümün içeriği (Türkçe, 4-8 cümle)"
  }}
 ],
 "key_concepts": [
  {{
   "term": "Terim/Kavram",
   "definition": "Kısa açıklama (Türkçe, 1-3 cümle)"
  }}
 ],
 "examples": ["Metindeki örnek 1", "Metindeki örnek 2"],
 "sorular": [
  {{
   "soru": "...",
   "secenekler": {{
     "A": "...",
     "B": "...",
     "C": "...",
     "D": "..."
   }},
   "dogru_cevap": "A"
  }}
 ]
}}

Açıklama ekleme.
Kurallar:
- "summary_sections" en az 3 bölüm içersin.
- "key_concepts" en az 5 kavram içersin.
- "examples" metinden çıkarılan en az 2 somut örnek içersin (yoksa boş liste dönebilirsin).
- Sorular çoktan seçmeli olsun ve "dogru_cevap" A/B/C/D'den biri olsun.

Metin:
{chr(10).join(summaries)}
"""

    res = call_groq_with_retry({
        "messages": [{"role": "user", "content": prompt}],
        "model": "llama-3.3-70b-versatile",
        "temperature": 0.3,
        "response_format": {"type": "json_object"}
    })

    data = json.loads(res.choices[0].message.content)

    if not validate_output(data):
        raise Exception("AI hatalı format döndü")

    # Geriye uyumluluk: bazı frontendler hâlâ `analiz.ozet` string alanını bekliyor olabilir.
    try:
        sections_text = "\n\n".join(
            f"{s['subtitle']}\n{s['content']}".strip()
            for s in (data.get("summary_sections") or [])
            if isinstance(s, dict) and s.get("subtitle") and s.get("content")
        )
        ozet_text = f"{data.get('title','').strip()}\n\n{sections_text}".strip()
        if ozet_text:
            data["ozet"] = ozet_text
    except Exception:
        pass

    return data


# -----------------------------
# API
# -----------------------------

@app.post("/api/analyze")
async def analyze(req: VideoRequest):
    if not groq_client:
        raise HTTPException(status_code=500, detail="API key yok")

    video_id = extract_video_id(req.youtube_url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Geçersiz URL")

    cached = get_cached(video_id)
    if cached and is_valid_cached(cached):
        return {"status": "success", "source": "cache", "analiz": cached}
    elif cached:
        print(f"[CACHE] Geçersiz cache formatı tespit edildi, yeniden üretilecek: video_id={video_id}")

    transcript = get_transcript(req.youtube_url)

    if not transcript:
        raise HTTPException(status_code=422, detail="Altyazı yok")

    try:
        summaries = summarize_chunks(transcript)
        final_data = generate_final_output(summaries)

        # DB yazımı başarısız olsa bile API cevabını döndürelim (UI çalışsın).
        try:
            supabase.table("video_analyses").insert({
                "video_id": video_id,
                "video_url": req.youtube_url,
                "title": final_data["title"],
                "summary_sections": final_data["summary_sections"],
                "key_concepts": final_data["key_concepts"],
                "examples": final_data["examples"],
                "sorular": final_data["sorular"],
            }).execute()
        except Exception as e:
            print("db insert error:", e)
            # Eski şemaya uyumluluk: structured özet JSON-string olarak ozet içine yaz.
            try:
                supabase.table("video_analyses").insert({
                    "video_id": video_id,
                    "video_url": req.youtube_url,
                    "ozet": json.dumps({
                        "title": final_data.get("title"),
                        "summary_sections": final_data.get("summary_sections"),
                        "key_concepts": final_data.get("key_concepts"),
                        "examples": final_data.get("examples"),
                    }, ensure_ascii=False),
                    "sorular": final_data["sorular"],
                }).execute()
            except Exception as e2:
                print("db fallback insert error:", e2)

        return {"status": "success", "source": "fresh", "analiz": final_data}

    except HTTPException:
        raise
    except Exception as e:
        print("ERROR:", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history")
async def history():
    res = supabase.table("video_analyses").select("*").execute()
    return res.data


@app.get("/health")
async def health():
    return {"ok": True}