import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Config } from "./config.ts";
import { falAvatarProvider } from "./providers/falAvatar.ts";
import { runwareProvider } from "./providers/runware.ts";
import { veedAvatarProvider } from "./providers/veedAvatar.ts";

export interface RenderProgress {
  total: number;
  complete: number;
  failed: number;
  isDone: boolean;
}

/**
 * The core rendering pipeline.
 * Processes a limited number of segments for a given job.
 */
export async function processNextSegments(
  supabase: SupabaseClient,
  jobId: string,
  config: Config,
  maxSegments: number = 1
): Promise<RenderProgress> {
  // 1. Fetch job metadata
  const { data: job, error: jobErr } = await supabase
    .from("render_jobs")
    .select("*, briefing_scripts(script_json)")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) throw new Error("Job not found");
  const script = job.briefing_scripts.script_json;
  const personaTitle = script.script_metadata.persona_applied;

  // 2. Fetch pending segments
  const { data: segments, error: segErr } = await supabase
    .from("rendered_segments")
    .select("*")
    .eq("job_id", jobId)
    .in("status", ["queued"])
    .order("segment_id", { ascending: true })
    .limit(maxSegments);

  if (segErr) throw segErr;

  // 3. Process each segment
  const avatarProvider = config.AVATAR_PROVIDER === "veed" ? veedAvatarProvider : falAvatarProvider;

  for (const seg of (segments || [])) {
    // Optimistic lock for this segment
    await supabase
      .from("rendered_segments")
      .update({ status: "rendering" })
      .match({ job_id: jobId, segment_id: seg.segment_id });

    try {
      let bRollUrl = null;
      // Budget check for B-roll
      if (config.ENABLE_RUNWARE && seg.runware_b_roll_prompt && seg.segment_id <= config.MAX_BROLL_SEGMENTS) {
        try {
          const res = await runwareProvider.generateImage({
            prompt: seg.runware_b_roll_prompt,
            aspectRatio: "16:9",
          });
          bRollUrl = res.url;
        } catch (e: any) {
          console.error(`B-roll failed for segment ${seg.segment_id}:`, e.message);
        }
      }

      const avatarRes = await avatarProvider.generateVideo({
        dialogue: seg.dialogue,
        personaTitle: personaTitle,
      });

      await supabase
        .from("rendered_segments")
        .update({
          status: "complete",
          avatar_video_url: avatarRes.url,
          b_roll_image_url: bRollUrl,
        })
        .match({ job_id: jobId, segment_id: seg.segment_id });

    } catch (e: any) {
      console.error(`Rendering failed for segment ${seg.segment_id}:`, e.message);
      await supabase
        .from("rendered_segments")
        .update({ status: "failed", error: e.message.slice(0, 200) })
        .match({ job_id: jobId, segment_id: seg.segment_id });
    }
  }

  // 4. Update overall job status
  const { data: allSegments } = await supabase
    .from("rendered_segments")
    .select("status")
    .eq("job_id", jobId);

  const stats = {
    total: allSegments?.length || 0,
    queued: allSegments?.filter(s => s.status === "queued").length || 0,
    rendering: allSegments?.filter(s => s.status === "rendering").length || 0,
    complete: allSegments?.filter(s => s.status === "complete").length || 0,
    failed: allSegments?.filter(s => s.status === "failed").length || 0,
  };

  const isDone = stats.queued === 0 && stats.rendering === 0;
  if (isDone) {
    const finalStatus = stats.complete > 0 ? "complete" : "failed";
    await supabase
      .from("render_jobs")
      .update({ status: finalStatus })
      .eq("id", jobId);
  } else {
    await supabase
      .from("render_jobs")
      .update({ status: "rendering", heartbeat_at: new Date().toISOString() })
      .eq("id", jobId);
  }

  return {
    total: stats.total,
    complete: stats.complete,
    failed: stats.failed,
    isDone
  };
}
