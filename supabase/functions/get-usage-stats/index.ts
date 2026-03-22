import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";

validateConfig();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await authorizeRequest(req, config);
    if (!auth.ok || !auth.user_id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: usage, error } = await supabase
      .from("briefing_usage_limits")
      .select("generate_count, render_count")
      .eq("user_id", auth.user_id)
      .eq("day", new Date().toISOString().split('T')[0])
      .maybeSingle();

    if (error) throw error;

    const generateLimit = parseInt(Deno.env.get("DAILY_GENERATE_LIMIT") || "25");
    const renderLimit = parseInt(Deno.env.get("DAILY_RENDER_LIMIT") || "25");

    const stats = {
      generate_count: usage?.generate_count || 0,
      render_count: usage?.render_count || 0,
      generate_limit: generateLimit,
      render_limit: renderLimit,
      generate_percent: Math.min(100, Math.round(((usage?.generate_count || 0) / generateLimit) * 100)),
      render_percent: Math.min(100, Math.round(((usage?.render_count || 0) / renderLimit) * 100)),
    };

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
