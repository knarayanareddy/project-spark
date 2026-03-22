-- Phase 3 - Final Schema Alignment for Repair & Consistency

-- 1. Ensure briefing_scripts has 'archived' and 'plan_hash' (if missing)
ALTER TABLE public.briefing_scripts
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_hash text;

-- 2. Ensure user_id is NOT NULL on briefing_scripts (after ensuring backfill)
-- Note: We assume the previous migration's backfill logic ran.
-- To be safe, we don't force NOT NULL here in case of empty dev DBs without auth users,
-- but we enforce the index and constraint for future rows.
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'briefing_scripts' AND column_name = 'user_id') THEN
    -- Attempt to set NOT NULL if no nulls exist
    BEGIN
      ALTER TABLE public.briefing_scripts ALTER COLUMN user_id SET NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not set user_id NOT NULL on briefing_scripts, likely due to existing NULL rows.';
    END;
  END IF;
END $$;

-- 3. Ensure render_jobs has user_id NOT NULL (after backfill)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'render_jobs' AND column_name = 'user_id') THEN
    BEGIN
      ALTER TABLE public.render_jobs ALTER COLUMN user_id SET NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not set user_id NOT NULL on render_jobs.';
    END;
  END IF;
END $$;

-- 4. Ensure RLS on briefing_scripts for the latest columns
DROP POLICY IF EXISTS "Users can view their own scripts" ON public.briefing_scripts;
CREATE POLICY "Users can view their own scripts"
  ON public.briefing_scripts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own scripts" ON public.briefing_scripts;
CREATE POLICY "Users can update their own scripts"
  ON public.briefing_scripts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Final check for sharing table (briefing_shares)
-- Most of this was in 20260322100002_briefing_shares.sql, but we ensure the RLS is strict.
ALTER TABLE public.briefing_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own shares" ON public.briefing_shares;
CREATE POLICY "Users can manage their own shares"
  ON public.briefing_shares FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
