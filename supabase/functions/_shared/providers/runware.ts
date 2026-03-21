import { config } from "../config.ts";
import { ImageGenerationParams, ImageGenerationResult } from "./types.ts";

export async function generateBrollImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  const apiKey = config.RUNWARE_API_KEY;
  if (!apiKey) {
    return { imageUrl: null, error: "Runware API key not configured" };
  }

  try {
    const response = await fetch("https://api.runware.ai/v1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify([
        {
          taskType: "imageInference",
          taskUUID: crypto.randomUUID(),
          positivePrompt: params.prompt,
          width: params.size?.width || 800,
          height: params.size?.height || 450,
          numberResults: 1,
        },
      ]),
    });

    if (!response.ok) {
      throw new Error(`Runware API error: ${response.status}`);
    }

    const data = await response.json();
    return { imageUrl: data?.data?.[0]?.imageURL || null };
  } catch (e: any) {
    console.error("Runware generation failed:", e.message);
    return { imageUrl: null, error: e.message };
  }
}
