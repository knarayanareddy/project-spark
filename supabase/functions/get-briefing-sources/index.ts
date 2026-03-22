import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";

validateConfig();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key, x-user-id, x-preview-user-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE, PUT",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorizeRequest(req, config);
  if (!auth.ok || !auth.user_id) {
    return new Response(JSON.stringify({ error: "Access denied or missing authentication" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const userId = auth.user_id;
  const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const url = new URL(req.url);
    const scriptId = url.searchParams.get("script_id");
    if (!scriptId) throw new Error("script_id query parameter is required");

    // 1) Load script_json.timeline_segments
    const { data: script, error: scriptErr } = await supabase
      .from("briefing_scripts")
      .select("script_json")
      .eq("id", scriptId)
      .eq("user_id", userId)
      .single();

    if (scriptErr || !script) throw new Error("Script not found or access denied");

    // 2) Extract unique grounding_source_id values from all segments
    const segments = script.script_json?.timeline_segments || [];
    const sourceIdsSet = new Set<string>();
    
    for (const seg of segments) {
      if (seg.grounding_source_id) {
        sourceIdsSet.add(seg.grounding_source_id);
      }
    }
    
    const uniqueSourceIds = Array.from(sourceIdsSet);
    const missingSourceIds: string[] = [];
    let sources: any[] = [];

    // 3) Query synced_items
    if (uniqueSourceIds.length > 0) {
      const { data: items, error: itemsErr } = await supabase
        .from("synced_items")
        .select("source_id, provider, item_type, occurred_at, title, author, url, summary, payload")
        .eq("user_id", userId)
        .in("source_id", uniqueSourceIds);

      if (itemsErr) throw itemsErr;
      
      sources = items || [];
      const returnedIds = new Set(sources.map((s: any) => s.source_id));
      
      for (const reqId of uniqueSourceIds) {
        if (!returnedIds.has(reqId)) {
          missingSourceIds.push(reqId);
        }
      }
    }

    // 4) Return
    return new Response(JSON.stringify({ sources, missing_source_ids: missingSourceIds }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e: any) {
    console.error("get-briefing-sources error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
