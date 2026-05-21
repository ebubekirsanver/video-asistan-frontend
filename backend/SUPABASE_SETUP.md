# Supabase Setup Guide & Database Schema

Supabase entegrasyonunu aktifleştirmek için aşağıdaki adımları sırasıyla uygulayınız.

## 1. Veritabanı Tablosunun Oluşturulması

Supabase Dashboard panelinizde sol menüden **SQL Editor** alanına giriniz. **New query** seçeneğine tıklayarak aşağıdaki SQL kodunu yapıştırıp **Run** butonuna basınız:

```sql
-- Analyses tablosunu oluştur
CREATE TABLE IF NOT EXISTS public.analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id TEXT UNIQUE NOT NULL,
    video_id TEXT NOT NULL,
    video_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_title TEXT,
    title TEXT NOT NULL,
    ozet TEXT,
    summary_sections JSONB DEFAULT '[]'::jsonb,
    key_concepts JSONB DEFAULT '[]'::jsonb,
    examples JSONB DEFAULT '[]'::jsonb,
    important_regions JSONB DEFAULT '[]'::jsonb,
    process_flow JSONB DEFAULT '[]'::jsonb,
    key_formulas JSONB DEFAULT '[]'::jsonb,
    fun_facts JSONB DEFAULT '[]'::jsonb,
    sorular JSONB DEFAULT '[]'::jsonb,
    question_count INT DEFAULT 0,
    last_question_count INT DEFAULT 0,
    last_question_difficulty TEXT DEFAULT 'orta'
);

-- Hızlı arama için indeksler oluştur
CREATE INDEX IF NOT EXISTS idx_analyses_video_id ON public.analyses(video_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON public.analyses(created_at DESC);

-- RLS (Row Level Security) devre dışı bırak veya genel okuma/yazma politikası ekle
ALTER TABLE public.analyses DISABLE ROW LEVEL SECURITY;
```

## 2. Environment Variables (.env) Güncellemesi

Backend klasöründeki `.env` dosyasını açıp aşağıdaki değişkenleri kendi Supabase bilgilerinizle doldurarak ekleyiniz:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

*Not: `SUPABASE_URL` ve `SUPABASE_ANON_KEY` değerlerini Supabase panelinizde **Settings -> API** alanından bulabilirsiniz.*
