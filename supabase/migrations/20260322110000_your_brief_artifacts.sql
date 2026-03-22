-- Phase 0 & Phase 3: YourBrief Enhancements

-- 1. Add 'archived' boolean to briefing_scripts if missing
ALTER TABLE public.briefing_scripts
ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;

-- 2. Create briefing_artifacts table to cache OpenAI-generated summaries and insights
CREATE TABLE IF NOT EXISTS public.briefing_artifacts (
  script_id uuid PRIMARY KEY REFERENCES public.briefing_scripts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  summary_paragraphs jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_insights jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- RLS: Only Service Role can read/write directly; Edge Functions enforce ownership
ALTER TABLE public.briefing_artifacts ENABLE ROW LEVEL SECURITY;

-- No REST access policies for clients; Edge Functions manage access.
