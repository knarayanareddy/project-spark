import { config } from "../config.ts";
import { VideoGenerationParams, VideoGenerationResult, AvatarProvider } from "./types.ts";

export class VeedAvatarProvider implements AvatarProvider {
  async generateAvatarVideo(params: VideoGenerationParams): Promise<VideoGenerationResult> {
    const apiKey = config.VEED_API_KEY;
    if (!apiKey) {
      return { videoUrl: null, error: "VEED API key not configured" };
    }

    try {
      // VEED Avatar API
      const response = await fetch("https://api.veed.io/v1/generate/avatar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          text: params.dialogue,
          avatar: params.persona || "default",
        }),
      });

      if (!response.ok) {
        throw new Error(`VEED API error: ${response.status}`);
      }

      const data = await response.json();
      return { videoUrl: data?.video_url || null };
    } catch (e: any) {
      console.error("VEED generation failed:", e.message);
      return { videoUrl: null, error: e.message };
    }
  }
}
