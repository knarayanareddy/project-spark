-- 1. user_settings: Persist user preferences and identity
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  timezone text DEFAULT 'UTC',
  location_text text,
  location_lat double precision,
  location_lon double precision,
  notification_prefs jsonb NOT NULL DEFAULT '{
    "edgeFailures": true,
    "newLogin": true,
    "vaultRotation": false,
    "genComplete": true,
    "genError": true,
    "dailyDigest": false,
    "rateLimit": true
  }'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: Authenticated users can manage their own settings
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own settings"
  ON public.user_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. user_sessions: Lightweight app-level session tracking
CREATE TABLE IF NOT EXISTS public.user_sessions (
  session_id uuid PRIMARY KEY, -- From JWT "session_id"
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  user_agent text,
  device_label text,
  ip text,
  location_text text,
  ended_at timestamptz
);

-- RLS: Authenticated users can view their own sessions
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own sessions"
  ON public.user_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Trigger for updated_at on user_settings
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
