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
    return new Response(JSON.stringify({ error: "Access denied" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const userId = auth.user_id;
  const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const url = new URL(req.url);
    const scriptId = url.searchParams.get("script_id") || (req.method === "POST" ? (await req.json()).script_id : null);
    if (!scriptId) throw new Error("script_id is required");

    // 1. Check cache
    const { data: cached, error: cacheErr } = await supabase
      .from("briefing_artifacts")
      .select("summary_paragraphs, key_insights")
      .eq("script_id", scriptId)
      .eq("user_id", userId)
      .maybeSingle();
      
    if (cached) {
      return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Fetch script
    const { data: script, error: scriptErr } = await supabase
      .from("briefing_scripts")
      .select("script_json")
      .eq("id", scriptId)
      .eq("user_id", userId)
      .single();

    if (scriptErr || !script) throw new Error("Script not found");

    const segments = script.script_json?.timeline_segments || [];
    
    // Fallback deterministic logic
    let summaryFallback = [ "Your briefing has been generated successfully." ];
    let insightsFallback = [] as any[];

    if (segments.length > 0) {
      summaryFallback = [
        segments.filter((s:any) => s.segment_kind === "intro" || s.segment_id <= 2)
          .map((s:any) => s.dialogue.split(".")[0] + ".")
          .join(" ")
      ];
      insightsFallback = segments.slice(0, 5).map((s:any) => ({
        text: s.dialogue.split(".")[0] || "Segment insight",
        segment_ids: [s.segment_id],
        source_ids: s.grounding_source_id ? s.grounding_source_id.split(",").map((i:string) => i.trim()) : []
      }));
    }

    // 3. LLM generation
    let generatedSummary = summaryFallback;
    let generatedInsights = insightsFallback;

    if (config.OPENAI_API_KEY && segments.length > 0) {
      const transcriptStr = segments.map((s:any) => `[Segment ${s.segment_id}] (Sources: ${s.grounding_source_id})\n${s.dialogue}`).join("\n\n");
      
      const systemPrompt = `You are a strict executive assistant. Your task is to extract a summary and key insights from a provided briefing transcript.
RULES:
1. You MUST NOT hallucinate or introduce external knowledge. Only use the facts in the transcript.
2. Return JSON exactly matching this structure:
{
  "summary_paragraphs": ["string", "string"],
  "key_insights": [
    { "text": "string", "segment_ids": [number], "source_ids": ["string"] }
  ]
}
3. The summary_paragraphs should be 2 concise paragraphs wrapping up the narrative.
4. Each key_insight MUST cite at least one segment_id and source_ids matching the provided segment tags. Ensure "segment_ids" are numbers.`;

      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Here is the transcript:\n\n${transcriptStr}` }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1
          })
        });
        
        if (res.ok) {
          const jsonVal = await res.json();
          const parsed = JSON.parse(jsonVal.choices[0].message.content);
          if (Array.isArray(parsed.summary_paragraphs) && Array.isArray(parsed.key_insights)) {
            generatedSummary = parsed.summary_paragraphs;
            generatedInsights = parsed.key_insights;
          }
        }
      } catch (err: any) {
        console.warn("LLM artifact generation failed, using fallback.", err.message);
      }
    }

    // 4. Save to cache
    const payload = {
      script_id: scriptId,
      user_id: userId,
      summary_paragraphs: generatedSummary,
      key_insights: generatedInsights
    };
    
    await supabase.from("briefing_artifacts").upsert(payload, { onConflict: "script_id", ignoreDuplicates: false });

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e: any) {
    console.error("get-briefing-artifacts error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
