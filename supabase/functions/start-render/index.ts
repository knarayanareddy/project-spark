import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const internalKey = req.headers.get("x-internal-api-key");
  const expectedKey = Deno.env.get("INTERNAL_API_KEY");
  if (!expectedKey || internalKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { script_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch script
    const { data: script, error: scriptErr } = await supabase
      .from("briefing_scripts")
      .select("*")
      .eq("id", script_id)
      .single();

    if (scriptErr || !script) throw new Error("Script not found");

    const timeline = (script.script_json as any).timeline;
    if (!timeline || !Array.isArray(timeline)) throw new Error("Invalid script timeline");

    // Create render job
    const { data: job, error: jobErr } = await supabase
      .from("render_jobs")
      .insert({ script_id, status: "rendering" })
      .select("id")
      .single();

    if (jobErr) throw jobErr;

    // Create segment rows
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

    // Process segments sequentially
    const runwareKey = Deno.env.get("RUNWARE_API_KEY");
    const falKey = Deno.env.get("FAL_KEY");
    const veedKey = Deno.env.get("VEED_API_KEY");

    for (const seg of timeline) {
      try {
        // Update status to rendering
        await supabase
          .from("rendered_segments")
          .update({ status: "rendering" })
          .eq("job_id", job.id)
          .eq("segment_id", seg.segment_id);

        let bRollUrl = null;
        let avatarUrl = null;

        // Generate b-roll image via Runware
        if (seg.runware_b_roll_prompt && runwareKey) {
          try {
            bRollUrl = await generateRunwareImage(runwareKey, seg.runware_b_roll_prompt);
          } catch (e) {
            console.error(`Runware failed for segment ${seg.segment_id}:`, e.message);
          }
        }

        // Generate avatar video
        if (veedKey) {
          try {
            avatarUrl = await generateVeedVideo(veedKey, seg.dialogue);
          } catch (e) {
            console.error(`VEED failed for segment ${seg.segment_id}, trying fal:`, e.message);
          }
        }

        if (!avatarUrl && falKey) {
          try {
            avatarUrl = await generateFalVideo(falKey, seg.dialogue);
          } catch (e) {
            console.error(`fal failed for segment ${seg.segment_id}:`, e.message);
          }
        }

        // Update segment
        await supabase
          .from("rendered_segments")
          .update({
            status: "complete",
            avatar_video_url: avatarUrl,
            b_roll_image_url: bRollUrl,
          })
          .eq("job_id", job.id)
          .eq("segment_id", seg.segment_id);
      } catch (e) {
        await supabase
          .from("rendered_segments")
          .update({ status: "failed", error: e.message })
          .eq("job_id", job.id)
          .eq("segment_id", seg.segment_id);
      }
    }

    // Mark job complete
    await supabase
      .from("render_jobs")
      .update({ status: "complete" })
      .eq("id", job.id);

    return new Response(JSON.stringify({ job_id: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function generateRunwareImage(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.runware.ai/v1", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify([{
      taskType: "imageInference",
      taskUUID: crypto.randomUUID(),
      positivePrompt: prompt,
      width: 800,
      height: 450,
      numberResults: 1,
    }]),
  });
  if (!response.ok) throw new Error(`Runware API error: ${response.status}`);
  const data = await response.json();
  return data?.data?.[0]?.imageURL || null;
}

async function generateVeedVideo(apiKey: string, dialogue: string): Promise<string> {
  // VEED Text-to-Avatar API (simplified)
  const response = await fetch("https://api.veed.io/v1/generate/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ text: dialogue, avatar: "default" }),
  });
  if (!response.ok) throw new Error(`VEED API error: ${response.status}`);
  const data = await response.json();
  return data?.video_url || null;
}

async function generateFalVideo(apiKey: string, dialogue: string): Promise<string> {
  // fal.ai text-to-video (simplified)
  const response = await fetch("https://fal.run/fal-ai/sadtalker", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
    body: JSON.stringify({
      source_image_url: "https://storage.googleapis.com/falserverless/model_tests/sadtalker/default_avatar.png",
      driven_audio_url: null,
      text: dialogue,
    }),
  });
  if (!response.ok) throw new Error(`fal API error: ${response.status}`);
  const data = await response.json();
  return data?.video?.url || null;
}
