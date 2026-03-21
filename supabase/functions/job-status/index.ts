import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";

validateConfig();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const internalKey = req.headers.get("x-internal-api-key");
  if (!config.INTERNAL_API_KEY || internalKey !== config.INTERNAL_API_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id");
    if (!jobId) throw new Error("job_id is required");

    const supabase = createClient(
      config.SUPABASE_URL!,
      config.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: job, error: jobErr } = await supabase
      .from("render_jobs")
      .select("status, error")
      .eq("id", jobId)
      .single();

    if (jobErr) throw jobErr;

    const { data: segments, error: segErr } = await supabase
      .from("rendered_segments")
      .select("segment_id, avatar_video_url, b_roll_image_url, ui_action_card, dialogue, grounding_source_id, status, error")
      .eq("job_id", jobId)
      .order("segment_id", { ascending: true });

    if (segErr) throw segErr;

    return new Response(
      JSON.stringify({ status: job.status, segments: segments || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("job-status error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
