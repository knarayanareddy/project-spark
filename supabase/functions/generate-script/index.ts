import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";
import { sanitizeDeep, redactSecrets, sanitizeUserData } from "../_shared/sanitize.ts";
import { buildAllowedIds, validateGroundingIds } from "../_shared/grounding.ts";
import { planSegments, planBriefing } from "../_shared/planner.ts";
import { realizeSegment, repairSegment } from "../_shared/realizer.ts";
import { BriefingSegmentSchema, validateBriefingScript } from "../_shared/briefingSchema.ts";
import { AssembledUserData } from "../_shared/userData.ts";
import { MODULE_CATALOG, ModuleId } from "../_shared/moduleCatalog.ts";

validateConfig();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorizeRequest(req, config);
  if (!auth.ok) {
    return new Response(JSON.stringify(auth.body), { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);
  const userId = auth.user_id!;

  try {
    const body = await req.json().catch(() => ({}));
    const { profile_id, user_preferences, user_data: callerUserData } = body;

    let sanitizedData: AssembledUserData;
    let persona = "Professional Executive";
    let enabledModules: ModuleId[] = [];
    let moduleSettings: Record<string, any> = {};

    // ── PHASE 1: Profile-driven path ─────────────────────────────────────────
    if (profile_id) {
      // Load profile
      const { data: profile } = await supabase
        .from("briefing_profiles")
        .select("persona, enabled_modules, module_settings")
        .eq("id", profile_id)
        .eq("user_id", userId)
        .single();

      if (profile) {
        if (profile.persona) persona = profile.persona;
        enabledModules = (profile.enabled_modules || []) as ModuleId[];
        moduleSettings = profile.module_settings || {};
      }

      // Call assemble-user-data internally (service-role fetch within Supabase)
      const assembleUrl = `${config.SUPABASE_URL}/functions/v1/assemble-user-data`;
      const assembleRes = await fetch(assembleUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
          "apikey": config.SUPABASE_SERVICE_ROLE_KEY!,
        },
        body: JSON.stringify({ profile_id }),
      });

      if (!assembleRes.ok) {
        const err = await assembleRes.text();
        throw new Error(`assemble-user-data failed: ${err.slice(0, 200)}`);
      }

      const assembled = await assembleRes.json();
      sanitizedData = sanitizeUserData(assembled.user_data) as AssembledUserData;

      // Override meta from assembled response
      if (assembled.meta?.enabled_modules?.length > 0) {
        enabledModules = assembled.meta.enabled_modules;
      }
    } else {
      // ── Fallback: caller-supplied user_data (mock mode) ────────────────────
      if (!callerUserData) {
        return new Response(JSON.stringify({ error: "missing_data", message: "Provide profile_id or user_data" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      sanitizedData = sanitizeUserData(callerUserData) as AssembledUserData;
      if (user_preferences?.persona) persona = user_preferences.persona;
      // Legacy path: use planBriefing (all modules, default caps)
      enabledModules = ["weather", "calendar_today", "ai_news_delta", "github_prs", "inbox_triage"] as ModuleId[];
    }

    // ── PHASE 1 cont: Build allowed IDs (includes connector_status source_ids) ─
    const allowedSourceIds = buildAllowedIds(sanitizedData);

    // ── PHASE 2: Deterministic planner ────────────────────────────────────────
    const segmentPlans = profile_id
      ? planSegments({ enabledModules, moduleSettings, userData: sanitizedData })
      : planBriefing(sanitizedData);         // legacy fallback

    if (segmentPlans.length === 0) {
      return new Response(JSON.stringify({
        error: "no_content",
        message: "No briefing content available. Please sync your connectors first.",
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── PHASE 3: LLM Realizer — per segment with repair + fallback ────────────
    const timeline_segments = [];

    for (let i = 0; i < segmentPlans.length; i++) {
      const plan = segmentPlans[i];
      let segment = null;
      let lastRawOutput = "";
      let lastError = "";

      // Attempt 1: initial realize
      try {
        const realized = await realizeSegment(i + 1, plan, persona, config.OPENAI_API_KEY!);
        lastRawOutput = JSON.stringify(realized);
        const parsed = BriefingSegmentSchema.parse(realized);
        validateSegmentGrounding(parsed, plan.grounding_source_ids);
        segment = { ...parsed, dialogue: redactSecrets(parsed.dialogue) };
      } catch (err: any) {
        lastError = err.message;
        console.warn(`Segment ${i + 1} attempt 1 failed: ${err.message}`);
      }

      // Attempt 2: one-shot repair
      if (!segment) {
        try {
          const repaired = await repairSegment(i + 1, plan, lastRawOutput, lastError, persona, config.OPENAI_API_KEY!);
          const parsed = BriefingSegmentSchema.parse(repaired);
          validateSegmentGrounding(parsed, plan.grounding_source_ids);
          segment = { ...parsed, dialogue: redactSecrets(parsed.dialogue) };
        } catch (repairErr: any) {
          console.warn(`Segment ${i + 1} repair failed: ${repairErr.message}. Using deterministic fallback.`);
        }
      }

      // Deterministic fallback — always safe, always grounded
      if (!segment) {
        const factValues = Object.values(plan.facts).filter(v => typeof v === "string" || typeof v === "number");
        segment = {
          segment_id: i + 1,
          dialogue: redactSecrets(`${plan.title}. ${factValues.slice(0, 2).join(". ")}.`),
          grounding_source_id: plan.grounding_source_ids[0],
          runware_b_roll_prompt: null,
          ui_action_card: plan.ui_action_suggestion,
        };
      }

      timeline_segments.push(segment);
    }

    // ── PHASE 4: Final validation + persistence ────────────────────────────────
    const scriptJson = {
      script_metadata: { persona_applied: persona, total_estimated_segments: timeline_segments.length },
      timeline_segments,
    };

    try {
      const validated = validateBriefingScript(scriptJson);
      validateGroundingIds(validated.timeline_segments, allowedSourceIds);
    } catch (validErr: any) {
      return new Response(JSON.stringify({ error: "invalid_script", message: validErr.message }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: scriptData, error: dbErr } = await supabase
      .from("briefing_scripts")
      .insert({ user_id: userId, persona, script_json: scriptJson })
      .select().single();

    if (dbErr) throw dbErr;

    // ── PHASE 5: Update per-module last_seen_at (after successful DB write) ───
    if (profile_id && enabledModules.length > 0) {
      const now = new Date().toISOString();

      // For ai_news_delta: use newest included news item timestamp
      let newsDeltaTs = now;
      if (sanitizedData.news_items && sanitizedData.news_items.length > 0) {
        const newest = sanitizedData.news_items
          .map(n => n.published_time_iso)
          .sort()
          .reverse()[0];
        if (newest) newsDeltaTs = newest;
      }

      const moduleStateRows = enabledModules.map(modId => ({
        user_id: userId,
        module_id: modId,
        last_seen_at: modId === "ai_news_delta" ? newsDeltaTs : now,
        updated_at: now,
      }));

      await supabase
        .from("briefing_module_state")
        .upsert(moduleStateRows, { onConflict: "user_id,module_id" });
    }

    // Legacy briefing_user_state update
    if (auth.mode !== "internal_key") {
      await supabase
        .from("briefing_user_state")
        .upsert({ user_id: userId, last_briefed_at: new Date().toISOString() }, { onConflict: "user_id" });
    }

    return new Response(JSON.stringify({ script_id: scriptData.id, script_json: scriptJson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("generate-script error:", e.message);
    return new Response(JSON.stringify({ error: redactSecrets(e.message).slice(0, 200) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/** Validate that the realized segment's grounding IDs are a subset of the plan's allowed IDs. */
function validateSegmentGrounding(parsed: any, allowedIds: string[]): void {
  const ids = String(parsed.grounding_source_id || "")
    .split(",").map((s: string) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error("Missing grounding_source_id");
  const invalid = ids.filter((id: string) => !allowedIds.includes(id));
  if (invalid.length > 0) throw new Error(`Invalid grounding IDs: ${invalid.join(", ")}`);
}
