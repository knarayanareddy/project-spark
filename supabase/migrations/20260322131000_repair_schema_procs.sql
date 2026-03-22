-- Repair Schema Procedures
-- Date: 2026-03-22 13:10:00

-- RPC for incrementing share view count
CREATE OR REPLACE FUNCTION public.increment_share_view(share_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.briefing_shares
  SET view_count = view_count + 1
  WHERE id = share_id;
END;
$$;
