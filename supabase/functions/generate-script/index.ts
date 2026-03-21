import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";
import { sanitizeDeep, redactSecrets, sanitizeUserData } from "../_shared/sanitize.ts";
import { buildAllowedIds, validateGroundingIds } from "../_shared/grounding.ts";
import { planBriefing, SegmentPlan } from "../_shared/planner.ts";
import { realizeSegment } from "../_shared/realizer.ts";
import { BriefingSegmentSchema, validateBriefingScript } from "../_shared/briefingSchema.ts";
import { AssembledUserData } from "../_shared/userData.ts";

validateConfig();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await authorizeRequest(req, config);
  if (!auth.ok) {
    return new Response(JSON.stringify(auth.body), { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);
  const userId = auth.user_id;

  try {
    const { user_preferences, user_data } = await req.json();
    if (!user_preferences || !user_data) throw new Error("Missing request data");

    const sanitizedPrefs = sanitizeDeep(user_preferences);
    const sanitizedData = sanitizeUserData(user_data) as AssembledUserData;
    const allowedSourceIds = buildAllowedIds(sanitizedData);

    // 1. DETERMINISTIC PLANNER
    const segmentPlans = planBriefing(sanitizedData);
    if (segmentPlans.length === 0) {
      return new Response(JSON.stringify({ error: "no_content", message: "No briefing content available. Please sync your connectors first." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. LLM REALIZER (Per-segment)
    const timeline_segments = [];
    const persona = sanitizedPrefs.persona || "Professional Executive";

    for (let i = 0; i < segmentPlans.length; i++) {
      const plan = segmentPlans[i];
      console.log(`Realizing segment ${i + 1}/${segmentPlans.length}: ${plan.plan_id}`);
      
      let segment = null;
      let attempts = 0;
      const maxAttempts = 2;

      while (attempts < maxAttempts && !segment) {
        try {
          const realized = await realizeSegment(i + 1, plan, persona, config.OPENAI_API_KEY!);
          
          // Schema validation
          const parsed = BriefingSegmentSchema.parse(realized);
          
          // Grounding check
          const segIds = (parsed.grounding_source_id || "").split(",").map((s: string) => s.trim()).filter(Boolean);
          const invalidIds = segIds.filter((id: string) => !plan.grounding_source_ids.includes(id));
          if (invalidIds.length > 0) throw new Error(`Invalid grounding IDs for this segment: ${invalidIds.join(", ")}`);

          segment = {
            ...parsed,
            dialogue: redactSecrets(parsed.dialogue)
          };
        } catch (err: any) {
          attempts++;
          console.warn(`Segment ${i + 1} attempt ${attempts} failed: ${err.message}`);
          if (attempts >= maxAttempts) {
            // Internal fallback for this specific segment
            segment = {
              segment_id: i + 1,
              dialogue: redactSecrets(`Moving on. ${plan.title}: ${Object.values(plan.facts).splice(0,3).join(". ")}`),
              grounding_source_id: plan.grounding_source_ids.join(", "),
              runware_b_roll_prompt: plan.b_roll_hint,
              ui_action_card: plan.ui_action_suggestion
            };
          }
        }
      }
      timeline_segments.push(segment);
    }

    const scriptJson = {
      script_metadata: {
        persona_applied: persona,
        total_estimated_segments: timeline_segments.length
      },
      timeline_segments
    };

    try {
      const validated = validateBriefingScript(scriptJson);
      validateGroundingIds(validated.timeline_segments, allowedSourceIds);
    } catch (validErr: any) {
      return new Response(JSON.stringify({ error: "invalid_script", message: validErr.message }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. Persist and Respond
    const { data: scriptData, error: dbErr } = await supabase
      .from("briefing_scripts")
      .insert({ persona: persona, script_json: scriptJson })
      .select().single();

    if (dbErr) throw dbErr;

    // 4. Update User State (Success!)
    if (auth.mode !== "internal_key" && auth.user_id) {
      await supabase
        .from("briefing_user_state")
        .upsert({ user_id: userId, last_briefed_at: new Date().toISOString() }, { onConflict: "user_id" });
    }

    return new Response(JSON.stringify({ script_id: scriptData.id, script_json: scriptJson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e: any) {
    console.error("generate-script error:", e.message);
    return new Response(JSON.stringify({ error: redactSecrets(e.message).slice(0, 200) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
