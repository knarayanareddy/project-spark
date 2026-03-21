import { config } from "../config.ts";
import { VideoGenerationParams, VideoGenerationResult, AvatarProvider } from "./types.ts";

export class FalAvatarProvider implements AvatarProvider {
  async generateAvatarVideo(params: VideoGenerationParams): Promise<VideoGenerationResult> {
    const apiKey = config.FAL_KEY;
    if (!apiKey) {
      return { videoUrl: null, error: "fal.ai API key not configured" };
    }

    try {
      // fal.ai Text-to-Video (SadTalker / Simli / etc.)
      const response = await fetch("https://fal.run/fal-ai/sadtalker", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify({
          source_image_url: "https://storage.googleapis.com/falserverless/model_tests/sadtalker/default_avatar.png",
          text: params.dialogue,
        }),
      });

      if (!response.ok) {
        throw new Error(`fal.ai API error: ${response.status}`);
      }

      const data = await response.json();
      return { videoUrl: data?.video?.url || null };
    } catch (e: any) {
      console.error("fal.ai generation failed:", e.message);
      return { videoUrl: null, error: e.message };
    }
  }
}
