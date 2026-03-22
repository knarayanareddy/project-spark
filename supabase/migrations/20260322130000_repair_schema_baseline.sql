-- Repair Baseline Migration
-- Date: 2026-03-22 13:00:00

-- 1. Align briefing_scripts with ownership and status
ALTER TABLE public.briefing_scripts 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS plan_hash text,
  ADD COLUMN IF NOT EXISTS profile_id uuid, -- Assuming briefing_profiles might exist or be added later
  ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_briefing_scripts_user_created_at ON public.briefing_scripts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_briefing_scripts_user_plan_hash ON public.briefing_scripts(user_id, plan_hash);

-- 2. Align render_jobs with ownership
ALTER TABLE public.render_jobs 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill user_id from briefing_scripts
UPDATE public.render_jobs r
SET user_id = s.user_id
FROM public.briefing_scripts s
WHERE r.script_id = s.id AND r.user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_render_jobs_user_created_at ON public.render_jobs(user_id, created_at DESC);

-- 3. Create briefing_artifacts for caching
CREATE TABLE IF NOT EXISTS public.briefing_artifacts (
  script_id uuid PRIMARY KEY REFERENCES public.briefing_scripts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_paragraphs text[],
  key_insights jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.briefing_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own artifacts" ON public.briefing_artifacts
  FOR SELECT USING (auth.uid() = user_id);

-- 4. Create user_settings
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  timezone text,
  location_text text,
  location_lat float8,
  location_lon float8,
  notification_prefs jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own settings" ON public.user_settings
  FOR ALL USING (auth.uid() = user_id);

-- 5. Create user_sessions
CREATE TABLE IF NOT EXISTS public.user_sessions (
  session_id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  user_agent text,
  device_label text,
  ip text,
  location_text text,
  last_seen_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own sessions" ON public.user_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- 6. Create briefing_shares
CREATE TABLE IF NOT EXISTS public.briefing_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  script_id uuid REFERENCES public.briefing_scripts(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.render_jobs(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  scope text DEFAULT 'render',
  view_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.briefing_shares ENABLE ROW LEVEL SECURITY;
-- Shares are public, but logic resides in Edge Function for token verification. 
-- However, we still need a policy if we want to SELECT via EF.
CREATE POLICY "Users can manage their own shares" ON public.briefing_shares
  FOR ALL USING (auth.uid() = user_id);
