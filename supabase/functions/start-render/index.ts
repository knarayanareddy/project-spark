import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { generateBrollImage } from "../_shared/providers/runware.ts";
import { FalAvatarProvider } from "../_shared/providers/falAvatar.ts";
import { VeedAvatarProvider } from "../_shared/providers/veedAvatar.ts";
import { AvatarProvider } from "../_shared/providers/types.ts";

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
    const { script_id } = await req.json();

    const supabase = createClient(
      config.SUPABASE_URL!,
      config.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Fetch script
    const { data: script, error: scriptErr } = await supabase
      .from("briefing_scripts")
      .select("*")
      .eq("id", script_id)
      .single();

    if (scriptErr || !script) throw new Error("Script not found");

    const timeline = (script.script_json as any).timeline;
    if (!timeline || !Array.isArray(timeline)) throw new Error("Invalid script timeline");

    // 2. Create render job
    const { data: job, error: jobErr } = await supabase
      .from("render_jobs")
      .insert({ script_id, status: "rendering" })
      .select("id")
      .single();

    if (jobErr) throw jobErr;

    // 3. Create segment rows
    const segmentRows = timeline.map((seg: any) => ({
      job_id: job.id,
      segment_id: seg.segment_id,
      dialogue: seg.dialogue,
      grounding_source_id: seg.grounding_source_id,
      ui_action_card: seg.ui_action_card,
      status: "queued",
    }));

    const { error: segErr } = await supabase.from("rendered_segments").insert(segmentRows);
    if (segErr) throw segErr;

    // 4. Initialize Provider
    let avatarProvider: AvatarProvider;
    if (config.AVATAR_PROVIDER === "veed" && config.VEED_API_KEY) {
      avatarProvider = new VeedAvatarProvider();
    } else {
      avatarProvider = new FalAvatarProvider();
    }

    // 5. Process segments sequentially (Resilient Flow)
    let completedCount = 0;
    
    for (const seg of timeline) {
      try {
        await supabase
          .from("rendered_segments")
          .update({ status: "rendering" })
          .eq("job_id", job.id)
          .eq("segment_id", seg.segment_id);

        let bRollUrl = null;
        let avatarUrl = null;
        let segmentError = null;

        // B-Roll (Runware)
        if (config.ENABLE_RUNWARE && seg.runware_b_roll_prompt && seg.segment_id <= config.MAX_BROLL_SEGMENTS) {
          const res = await generateBrollImage({ prompt: seg.runware_b_roll_prompt });
          bRollUrl = res.imageUrl;
          if (res.error) console.warn(`Runware failed for segment ${seg.segment_id}:`, res.error);
        }

        // Avatar Video
        const res = await avatarProvider.generateAvatarVideo({
          dialogue: seg.dialogue,
          persona: script.persona,
        });
        
        avatarUrl = res.videoUrl;
        
        // Fallback to fal if VEED failed
        if (!avatarUrl && config.AVATAR_PROVIDER === "veed" && config.FAL_KEY) {
          console.info(`VEED failed for segment ${seg.segment_id}, falling back to fal.ai`);
          const falRes = await new FalAvatarProvider().generateAvatarVideo({
            dialogue: seg.dialogue,
            persona: script.persona,
          });
          avatarUrl = falRes.videoUrl;
          if (falRes.error) segmentError = falRes.error;
        } else if (res.error) {
          segmentError = res.error;
        }

        // Update segment
        const status = avatarUrl ? "complete" : "failed";
        if (avatarUrl) completedCount++;

        await supabase
          .from("rendered_segments")
          .update({
            status,
            avatar_video_url: avatarUrl,
            b_roll_image_url: bRollUrl,
            error: segmentError,
          })
          .eq("job_id", job.id)
          .eq("segment_id", seg.segment_id);

      } catch (e: any) {
        console.error(`Unexpected error in segment ${seg.segment_id}:`, e.message);
        await supabase
          .from("rendered_segments")
          .update({ status: "failed", error: e.message })
          .eq("job_id", job.id)
          .eq("segment_id", seg.segment_id);
      }
    }

    // 6. Mark job status
    const finalStatus = completedCount > 0 ? "complete" : "failed";
    await supabase
      .from("render_jobs")
      .update({ status: finalStatus })
      .eq("id", job.id);

    return new Response(JSON.stringify({ job_id: job.id, status: finalStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("start-render error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
