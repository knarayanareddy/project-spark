import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";
import { falAvatarProvider } from "../_shared/providers/falAvatar.ts";
import { runwareProvider } from "../_shared/providers/runware.ts";
import { veedAvatarProvider } from "../_shared/providers/veedAvatar.ts";

validateConfig();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Unified authorization check
  const auth = await authorizeRequest(req, config);
  if (!auth.ok) {
    return new Response(JSON.stringify(auth.body), {
      status: auth.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { script_id } = await req.json();
    if (!script_id) throw new Error("script_id is required");

    const supabase = createClient(
      config.SUPABASE_URL!,
      config.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Fetch script
    const { data: scriptData, error: scriptErr } = await supabase
      .from("briefing_scripts")
      .select("script_json")
      .eq("id", script_id)
      .single();

    if (scriptErr) throw scriptErr;
    const script = scriptData.script_json;
    const segments = script.timeline_segments;

    // 2. Create render job
    const { data: job, error: jobErr } = await supabase
      .from("render_jobs")
      .insert({ script_id, status: "rendering" })
      .select()
      .single();

    if (jobErr) throw jobErr;

    // 3. Initialize segments in DB
    const initialSegments = segments.map((s: any) => ({
      job_id: job.id,
      segment_id: s.segment_id,
      dialogue: s.dialogue,
      grounding_source_id: s.grounding_source_id,
      ui_action_card: s.ui_action_card,
      status: "queued",
    }));

    const { error: insErr } = await supabase
      .from("rendered_segments")
      .insert(initialSegments);

    if (insErr) throw insErr;

    // 4. Background Rendering (Edge Function keeps running)
    const avatarProvider = config.AVATAR_PROVIDER === "veed" ? veedAvatarProvider : falAvatarProvider;
    let successCount = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      
      await supabase
        .from("rendered_segments")
        .update({ status: "rendering" })
        .match({ job_id: job.id, segment_id: seg.segment_id });

      try {
        let bRollUrl = null;
        if (config.ENABLE_RUNWARE && seg.runware_b_roll_prompt && i < config.MAX_BROLL_SEGMENTS) {
          try {
            const res = await runwareProvider.generateImage({
              prompt: seg.runware_b_roll_prompt,
              aspectRatio: "16:9",
            });
            bRollUrl = res.url;
          } catch (e) {
            console.error(`B-roll failed for segment ${seg.segment_id}:`, e);
          }
        }

        const avatarRes = await avatarProvider.generateVideo({
          dialogue: seg.dialogue,
          personaTitle: script.script_metadata.persona_applied,
        });

        await supabase
          .from("rendered_segments")
          .update({
            status: "complete",
            avatar_video_url: avatarRes.url,
            b_roll_image_url: bRollUrl,
          })
          .match({ job_id: job.id, segment_id: seg.segment_id });
        
        successCount++;
      } catch (e: any) {
        console.error(`Rendering failed for segment ${seg.segment_id}:`, e.message);
        await supabase
          .from("rendered_segments")
          .update({ 
            status: "failed", 
            error: e.message.slice(0, 200) // Truncate error for safety
          })
          .match({ job_id: job.id, segment_id: seg.segment_id });
      }
    }

    // 5. Update job status
    const finalStatus = successCount > 0 ? "complete" : "failed";
    await supabase
      .from("render_jobs")
      .update({ status: finalStatus })
      .eq("id", job.id);

    return new Response(JSON.stringify({ job_id: job.id, status: "started" }), {
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
